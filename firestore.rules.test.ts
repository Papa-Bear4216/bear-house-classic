import { describe, test, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';

describe('Firestore Security Rules', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'prime-mechanic-463314-m8',
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8')
      },
    });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    
    // Set up default users in the database using admin context (rules disabled)
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      const db = context.firestore();
      
      // Admin
      await db.collection('users').doc('admin-id').set({
        id: 'admin-id',
        name: 'Admin User',
        color: 'blue',
        role: 'admin',
        points: 100
      });
      
      // Super Admin
      await db.collection('users').doc('superadmin-id').set({
        id: 'superadmin-id',
        name: 'SuperAdmin User',
        color: 'purple',
        role: 'superadmin',
        points: 100
      });

      // Child 1
      await db.collection('users').doc('child-id').set({
        id: 'child-id',
        name: 'Child User',
        color: 'red',
        role: 'child',
        points: 50
      });

      // Child 2
      await db.collection('users').doc('other-child-id').set({
        id: 'other-child-id',
        name: 'Other Child',
        color: 'green',
        role: 'child',
        points: 40
      });
    });
  });

  test('1. Create user with role: superadmin as a new user should FAIL', async () => {
    const newContext = testEnv.authenticatedContext('new-user-id');
    const db = newContext.firestore();
    const promise = db.collection('users').doc('new-user-id').set({
      id: 'new-user-id',
      name: 'New User',
      color: 'green',
      role: 'superadmin',
      points: 0
    });
    await assertFails(promise);
  });

  test('1b. Create user with role: child as a new user should SUCCEED', async () => {
    const newContext = testEnv.authenticatedContext('new-user-id');
    const db = newContext.firestore();
    const promise = db.collection('users').doc('new-user-id').set({
      id: 'new-user-id',
      name: 'New User',
      color: 'green',
      role: 'child',
      points: 0
    });
    await assertSucceeds(promise);
  });

  test('2. Update task status: done where assigneeId is NOT the current user and not admin should FAIL', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().collection('tasks').doc('task-1').set({
        id: 'task-1',
        title: 'Clean Room',
        assigneeId: 'other-child-id',
        date: '2026-05-21',
        pointsValue: 10,
        status: 'todo'
      });
    });

    const childContext = testEnv.authenticatedContext('child-id');
    const promise = childContext.firestore().collection('tasks').doc('task-1').update({
      status: 'done'
    });
    await assertFails(promise);
  });

  test('2b. Update task status: done where assigneeId IS the current user should SUCCEED', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().collection('tasks').doc('task-1').set({
        id: 'task-1',
        title: 'Clean Room',
        assigneeId: 'child-id',
        date: '2026-05-21',
        pointsValue: 10,
        status: 'todo'
      });
    });

    const childContext = testEnv.authenticatedContext('child-id');
    const promise = childContext.firestore().collection('tasks').doc('task-1').update({
      status: 'done'
    });
    await assertSucceeds(promise);
  });

  test('3. Update task pointsValue to 999999 (Exceeds limit) should FAIL', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().collection('tasks').doc('task-1').set({
        id: 'task-1',
        title: 'Clean Room',
        assigneeId: 'admin-id',
        date: '2026-05-21',
        pointsValue: 10,
        status: 'todo'
      });
    });

    const adminContext = testEnv.authenticatedContext('admin-id');
    const promise = adminContext.firestore().collection('tasks').doc('task-1').update({
      pointsValue: 999999
    });
    await assertFails(promise);
  });

  test('4. Update user role (to upgrade self to admin) should FAIL', async () => {
    const childContext = testEnv.authenticatedContext('child-id');
    const promise = childContext.firestore().collection('users').doc('child-id').update({
      role: 'admin'
    });
    await assertFails(promise);
  });

  test('5. Read/list events should succeed for authenticated users', async () => {
    const childContext = testEnv.authenticatedContext('child-id');
    const promise = childContext.firestore().collection('events').get();
    await assertSucceeds(promise);
  });

  test('5b. Read/list events should fail for unauthenticated users', async () => {
    const unauthContext = testEnv.unauthenticatedContext();
    const promise = unauthContext.firestore().collection('events').get();
    await assertFails(promise);
  });

  test('6. Create event with startTime string too long (exceeds 10 chars) should FAIL', async () => {
    const adminContext = testEnv.authenticatedContext('admin-id');
    const promise = adminContext.firestore().collection('events').doc('event-1').set({
      id: 'event-1',
      title: 'Family Dinner',
      userId: 'child-id',
      date: '2026-05-21',
      startTime: '18:00:00.0000000', // > 10 chars
      endTime: '19:00'
    });
    await assertFails(promise);
  });

  test('7. Create event with missing title field should FAIL', async () => {
    const adminContext = testEnv.authenticatedContext('admin-id');
    const promise = adminContext.firestore().collection('events').doc('event-1').set({
      id: 'event-1',
      userId: 'child-id',
      date: '2026-05-21',
      startTime: '18:00',
      endTime: '19:00'
    } as any);
    await assertFails(promise);
  });

  test('8. Update task with a Ghost Field isPaid: true should FAIL', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().collection('tasks').doc('task-1').set({
        id: 'task-1',
        title: 'Clean Room',
        assigneeId: 'admin-id',
        date: '2026-05-21',
        pointsValue: 10,
        status: 'todo'
      });
    });

    const adminContext = testEnv.authenticatedContext('admin-id');
    const promise = adminContext.firestore().collection('tasks').doc('task-1').update({
      isPaid: true
    } as any);
    await assertFails(promise);
  });

  test('9. Create event with ID > 128 chars should FAIL', async () => {
    const adminContext = testEnv.authenticatedContext('admin-id');
    const longId = 'a'.repeat(129);
    const promise = adminContext.firestore().collection('events').doc(longId).set({
      id: longId,
      title: 'Family Dinner',
      userId: 'child-id',
      date: '2026-05-21'
    });
    await assertFails(promise);
  });

  test('10. Get user profile should succeed when signed in', async () => {
    const childContext = testEnv.authenticatedContext('child-id');
    const promise = childContext.firestore().collection('users').doc('admin-id').get();
    await assertSucceeds(promise);
  });

  test('11. Create task with pointsValue < 0 should FAIL', async () => {
    const adminContext = testEnv.authenticatedContext('admin-id');
    const promise = adminContext.firestore().collection('tasks').doc('task-negative').set({
      id: 'task-negative',
      title: 'Invalid Task',
      assigneeId: 'child-id',
      date: '2026-05-21',
      pointsValue: -5
    });
    await assertFails(promise);
  });
});

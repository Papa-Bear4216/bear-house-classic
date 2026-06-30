import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Google OAuth provider with calendar scope
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');

// Allowed emails from environment (comma-separated in Vercel)
const allowedEmailsEnv = process.env.NEXT_PUBLIC_ALLOWED_EMAILS || '';
export const ALLOWED_EMAILS = allowedEmailsEnv
  ? allowedEmailsEnv.split(',').map(e => e.trim())
  : [
      'michael711hebert@gmail.com',
      'littlebear8991@gmail.com',
      'jchebert2010@gmail.com',
      'hpfanatic009@gmail.com',
    ];

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED');
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  
  if (isQuotaError) {
    console.error('Firestore Quota Exceeded. The daily free tier limit has been reached. It will reset tomorrow. Details:', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  
  throw new Error(JSON.stringify(errInfo));
}

export const signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Authentication error:", error);
  }
};

export const isPlaceholder = firebaseConfig.apiKey === 'placeholder' || !firebaseConfig.apiKey;

// Connection Test
async function testConnection() {
  if (isPlaceholder) {
    console.log("Bear House OS: Firebase is using placeholder credentials. Live data features will be disabled until Firebase is set up.");
    return;
  }

  try {
    // Only try once to not spam quotas if failing
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    const err = error as any;
    if (err.code === 'permission-denied') {
      // This is expected if 'test/connection' doesn't exist or isn't readable, 
      // but it confirms we CONNECTED to the project.
      console.log("Bear House OS: Firebase connected successfully.");
    } else if (err.message?.includes('the client is offline')) {
      console.warn("Bear House OS: Firebase Connection Error (Offline). Fallback modes active.");
    } else if (err.message?.includes('quota')) {
      console.error("Bear House OS: Firebase Quota Exceeded.");
    } else {
      console.warn("Bear House OS: Firebase Initialization Check:", err.message || err);
    }
  }
}

const isLocalHost = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === ''
);

// Avoid running a live connection check on local dev to prevent unauthorized-domain
// errors from cluttering the console when developers don't have Firebase configured.
if (typeof window !== 'undefined' && !isLocalHost) {
  testConnection();
} else if (typeof window !== 'undefined' && isLocalHost) {
  console.log('Bear House OS: Skipping Firebase runtime connection check in local development.');
}
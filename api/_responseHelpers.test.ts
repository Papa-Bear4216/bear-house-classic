import { describe, it, expect } from 'vitest';
import {
  json, success, error, unauthorized, forbidden, notFound,
  methodNotAllowed, rateLimitExceeded, serverError,
} from './_responseHelpers';

async function body(res: Response) {
  return JSON.parse(await res.text());
}

describe('_responseHelpers', () => {
  it('json returns raw data with a 200 default and JSON content-type', async () => {
    const res = json({ foo: 'bar' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await body(res)).toEqual({ foo: 'bar' });
  });

  it('json respects an explicit status', async () => {
    const res = json({ ok: true }, 201);
    expect(res.status).toBe(201);
  });

  it('success is an alias for json', async () => {
    const res = success({ value: 1 }, 200);
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ value: 1 });
  });

  it('error wraps a message with a default 400', async () => {
    const res = error('bad input');
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual({ error: 'bad input' });
  });

  it('error respects an explicit status', async () => {
    const res = error('conflict', 409);
    expect(res.status).toBe(409);
  });

  it('unauthorized defaults to 401 with a default message', async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect(await body(res)).toEqual({ error: 'Unauthorized' });
  });

  it('forbidden defaults to 403', async () => {
    const res = forbidden();
    expect(res.status).toBe(403);
    expect(await body(res)).toEqual({ error: 'Forbidden' });
  });

  it('notFound defaults to 404', async () => {
    const res = notFound();
    expect(res.status).toBe(404);
    expect(await body(res)).toEqual({ error: 'Not found' });
  });

  it('methodNotAllowed defaults to 405', async () => {
    const res = methodNotAllowed();
    expect(res.status).toBe(405);
    expect(await body(res)).toEqual({ error: 'Method not allowed' });
  });

  it('rateLimitExceeded returns 429 with the retry-after seconds in the message', async () => {
    const res = rateLimitExceeded(42);
    expect(res.status).toBe(429);
    expect(await body(res)).toEqual({ error: 'Rate limit exceeded, try again in 42s' });
  });

  it('serverError defaults to 500', async () => {
    const res = serverError();
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ error: 'Internal server error' });
  });
});

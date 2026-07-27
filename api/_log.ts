/**
 * Structured server-side error logging for Edge Function routes.
 *
 * Every 500-level response was previously built from a caught exception's
 * message and returned to the client, with the exception itself discarded —
 * a production crash left zero trace in Vercel's function logs. console.error
 * output on Vercel is captured automatically (no external service needed);
 * this just makes that output a parseable JSON line instead of free text, so
 * it can be grep'd/filtered by route or error message in the Vercel log viewer
 * or any downstream log processor.
 */

export function logError(route: string, err: unknown, context?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(JSON.stringify({
    level: 'error',
    route,
    message,
    stack,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Structured info-level logging for client-reported metrics (e.g. page load
 * timing) that need to land in Vercel's log viewer without being an error.
 */
export function logInfo(route: string, event: string, context?: Record<string, unknown>): void {
  console.log(JSON.stringify({
    level: 'info',
    route,
    event,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

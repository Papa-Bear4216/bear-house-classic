/**
 * Extract the household webhook token from a request.
 *
 * The x-webhook-token header is the supported transport. A token in the JSON
 * body is still accepted for existing automations (IFTTT / Home Assistant /
 * Tasker) but is deprecated: it is logged (without the token value) so it can
 * be removed once callers have moved to the header. Never accepted from the
 * query string here.
 */
export function webhookToken(req: Request, bodyToken: unknown, route: string): string {
  const header = req.headers.get('x-webhook-token');
  if (header) return header;
  if (typeof bodyToken === 'string' && bodyToken) {
    console.warn(JSON.stringify({ level: 'warn', route, message: 'webhook token in request body is deprecated; send the x-webhook-token header' }));
    return bodyToken;
  }
  return '';
}

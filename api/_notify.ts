/**
 * IFTTT Maker Webhooks notifier — fire-and-forget push via IFTTT applets.
 * Underscore prefix means Vercel won't expose this as a route.
 *
 * Set up on IFTTT: create an applet per event name with trigger
 * "Webhooks -> Receive a web request" (event name must match), action = whatever
 * you want (phone notification, SMS, etc). Value1/Value2/Value3 are passed through.
 *
 * Env var needed: IFTTT_WEBHOOKS_KEY (from ifttt.com/maker_webhooks -> Documentation)
 */
export async function notifyIFTTT(event: string, value1?: string, value2?: string, value3?: string): Promise<void> {
  const key = process.env.IFTTT_WEBHOOKS_KEY;
  if (!key) return;
  try {
    await fetch(`https://maker.ifttt.com/trigger/${encodeURIComponent(event)}/with/key/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value1, value2, value3 }),
    });
  } catch {
    // best-effort — never let a notification failure break the caller
  }
}

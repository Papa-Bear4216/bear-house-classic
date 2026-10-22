#!/usr/bin/env node
/**
 * Subscription bridge: lets ONE household (yours) use the Claude Code, Codex
 * and Antigravity subscriptions already signed in on this PC for text-only AI
 * calls. Vercel cannot spawn CLIs, so api/_subscriptionBridge.ts calls this
 * over a private tunnel (Tailscale Funnel / cloudflared) with a bearer token.
 *
 *   node scripts/subscription-bridge.mjs            # serve
 *   node scripts/subscription-bridge.mjs status     # show sign-in status
 *
 * Env: SUBSCRIPTION_BRIDGE_TOKEN (required, 24+ chars), SUBSCRIPTION_BRIDGE_PORT
 * (default 8791). Binds 127.0.0.1 only. Credential files are checked for
 * presence, never read. Metered API keys are stripped from child processes so
 * a stray key cannot move billing off the subscription. Text only: tools are
 * disabled, so Hermes actions and image scans never use this path.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const HOME = process.env.USERPROFILE || process.env.HOME || '';
const PROVIDERS = {
  claude: { cmd: 'claude', cred: join(HOME, '.claude', '.credentials.json'), login: 'claude auth login' },
  codex: { cmd: 'codex', cred: join(HOME, '.codex', 'auth.json'), login: 'codex login' },
  antigravity: { cmd: 'agy', cred: join(HOME, '.gemini', 'oauth_creds.json'), login: 'agy (sign in, then exit)' },
};
const MAX_BODY = 256 * 1024;
const OUT_CAP = 1024 * 1024;
const TIMEOUT_MS = 60_000;
const MODEL_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_\-./:]*$/;

const signedIn = (p) => !!HOME && existsSync(PROVIDERS[p].cred);

if (process.argv[2] === 'status') {
  for (const p of Object.keys(PROVIDERS)) {
    console.log(`${p.padEnd(12)} ${signedIn(p) ? 'signed in' : `NOT signed in -> run: ${PROVIDERS[p].login}`}`);
  }
  process.exit(0);
}

const TOKEN = process.env.SUBSCRIPTION_BRIDGE_TOKEN || '';
if (TOKEN.length < 24) {
  console.error('Set SUBSCRIPTION_BRIDGE_TOKEN to a random string of 24+ characters.');
  process.exit(1);
}

function childEnv() {
  const env = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY',
    'GOOGLE_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'SUBSCRIPTION_BRIDGE_TOKEN']) delete env[k];
  return env;
}

function run(cmd, args, stdin, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: childEnv(), windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const finish = (fn) => { if (!done) { done = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => { child.kill(); finish(() => reject(new Error('timeout'))); }, TIMEOUT_MS);
    child.stdout.on('data', (c) => { if (out.length < OUT_CAP) out += c; });
    child.stderr.on('data', (c) => { if (err.length < OUT_CAP) err += c; });
    child.on('error', (e) => finish(() => reject(new Error(e.code === 'ENOENT' ? `${cmd} not installed` : 'spawn failed'))));
    child.on('close', (code) => finish(() => (code === 0 || out.trim() ? resolve(out) : reject(new Error(`${cmd} exited ${code}`)))));
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

function lastJsonLine(text, pred) {
  let found;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try { const j = JSON.parse(t); if (pred(j)) found = j; } catch { /* log line */ }
  }
  return found;
}

async function complete(provider, prompt, system, model) {
  const dir = await mkdtemp(join(tmpdir(), 'bh-bridge-'));
  const stdin = [system, prompt, 'Reply with the answer only. Do not edit files, run commands, or use tools.']
    .filter(Boolean).join('\n\n');
  const m = model && MODEL_RE.test(model) ? model : undefined;
  try {
    if (provider === 'claude') {
      const args = ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--setting-sources', '', '--system-prompt', 'Answer concisely from the provided context.',
        '--disable-slash-commands', '--no-session-persistence', '--permission-prompts', 'none'];
      if (m) args.push('--model', m);
      const out = (await run('claude', args, stdin, dir)).trim();
      const j = JSON.parse(out.split(/\r?\n/).filter((l) => l.trim().startsWith('{')).pop() || out);
      if (j.is_error || typeof j.result !== 'string' || !j.result.trim()) throw new Error('claude returned no text');
      return j.result.trim();
    }
    if (provider === 'codex') {
      const file = join(dir, 'last.txt');
      const args = ['exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
        '--color', 'never', '--json', '-o', file, '-C', dir];
      if (m) args.push('-m', m);
      args.push('-');
      await run('codex', args, stdin, dir);
      const text = (await readFile(file, 'utf8').catch(() => '')).trim();
      if (!text) throw new Error('codex returned no text');
      return text;
    }
    const args = ['--output-format', 'stream-json', '--input-format', 'stream-json', '--mode', 'plan', '--sandbox',
      '--print-timeout', `${TIMEOUT_MS / 1000}s`];
    if (m) args.push('--model', m);
    const out = await run('agy', args, JSON.stringify({ event: 'user', message: { role: 'user', content: stdin } }), dir);
    const r = lastJsonLine(out, (j) => j.event === 'result' && j.result && typeof j.result === 'object')?.result;
    const text = typeof r?.response === 'string' ? r.response.trim() : '';
    if (!text) throw new Error('agy returned no text');
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const authed = (req) => {
  const got = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
};
const send = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

let busy = 0;
http.createServer(async (req, res) => {
  if (!authed(req)) return send(res, 401, { error: 'Unauthorized' });
  if (req.method === 'GET' && req.url === '/status') {
    return send(res, 200, Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, signedIn(p)])));
  }
  if (req.method !== 'POST' || req.url !== '/complete') return send(res, 404, { error: 'Not found' });
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(res, 413, { error: 'Too large' }); chunks.push(c); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error: 'Bad JSON' }); }
  const { provider, prompt, system, model } = body || {};
  if (!PROVIDERS[provider]) return send(res, 400, { error: 'provider must be claude, codex or antigravity' });
  if (typeof prompt !== 'string' || !prompt.trim()) return send(res, 400, { error: 'prompt required' });
  if (!signedIn(provider)) return send(res, 503, { error: `Not signed in. Run: ${PROVIDERS[provider].login}` });
  if (busy >= 2) return send(res, 429, { error: 'Busy' });
  busy++;
  try {
    const t0 = Date.now();
    const text = await complete(provider, prompt, typeof system === 'string' ? system : '', model);
    console.log(`${new Date().toISOString()} /complete ${provider} ok ${Date.now() - t0}ms (${prompt.length} chars in)`);
    send(res, 200, { text });
  } catch (e) {
    send(res, 502, { error: e instanceof Error ? e.message : 'failed' });
  } finally { busy--; }
}).listen(Number(process.env.SUBSCRIPTION_BRIDGE_PORT) || 8791, '127.0.0.1', () => {
  console.log(`subscription bridge on 127.0.0.1:${process.env.SUBSCRIPTION_BRIDGE_PORT || 8791}`);
});

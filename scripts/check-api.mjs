import { readdir } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { build } from 'esbuild';

async function sourceFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(path);
  }
  return files;
}

const roots = ['api', 'server'];
const entries = [];
for (const root of roots) {
  try { entries.push(...await sourceFiles(resolve(root))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!entries.length) throw new Error('No API/server TypeScript files found');

await build({
  entryPoints: entries.map(path => `./${relative(process.cwd(), path).replaceAll('\\', '/')}`),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outdir: 'node_modules/.cache/api-check',
  logLevel: 'error',
});

// Runs Vite and the API together without going through cmd.exe / a shell.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const tsxCli = path.join(path.dirname(require.resolve('tsx/package.json')), 'dist/cli.mjs');

const procs = [
  ['web', [viteBin]],
  ['api', [tsxCli, 'watch', 'server/index.ts']],
].map(([name, args]) => {
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = (d) => String(d).trimEnd().split('\n').forEach((l) => console.log(`[${name}] ${l}`));
  p.stdout.on('data', tag);
  p.stderr.on('data', tag);
  p.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    procs.forEach((q) => q.kill());
    process.exit(code ?? 0);
  });
  return p;
});

process.on('SIGINT', () => procs.forEach((p) => p.kill()));

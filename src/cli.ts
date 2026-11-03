#!/usr/bin/env node
import { startup } from './startup.js';
import { VERSION } from './version.js';

const HELP = `daily-diff ${VERSION} — a local-first daily AI & tech briefing

Usage: daily-diff [--port <n>]

  --port <n>   port to serve on (default 4242), bound to 127.0.0.1
  --version    print the version
  --help       show this help

Data lives in ~/.daily-diff (override with DAILY_DIFF_HOME).`;

const args = process.argv.slice(2);
const known = new Set(['--port', '--version', '--help']);
const unknown = args.find((a, i) => a.startsWith('-') && !known.has(a) && args[i - 1] !== '--port');

if (args.includes('--help')) {
  console.log(HELP);
} else if (args.includes('--version')) {
  console.log(VERSION);
} else if (unknown) {
  console.error(`Unknown option: ${unknown}\n\n${HELP}`);
  process.exit(1);
} else {
  const i = args.indexOf('--port');
  const port = i >= 0 ? Number(args[i + 1]) : 4242;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('--port needs a number between 1 and 65535');
    process.exit(1);
  }
  process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Is Daily Diff already running? Try --port <n>.`);
    else console.error(err);
    process.exit(1);
  });
  const { close } = await startup({ port, onListening: (url) => console.log(`Daily Diff running at ${url}`) });
  const shutdown = () => {
    close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

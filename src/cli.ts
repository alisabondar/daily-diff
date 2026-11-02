#!/usr/bin/env node
import { startup } from './startup.js';
import { VERSION } from './version.js';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log(VERSION);
} else {
  const i = args.indexOf('--port');
  const port = i >= 0 ? Number(args[i + 1]) : 4242;
  await startup({ port });
  console.log(`Daily Diff running at http://127.0.0.1:${port}`);
}

#!/usr/bin/env node
// lispia CLI — run files or drop into the REPL.
//
//   node bin/lispia.js run lib/list.lsp
//   node bin/lispia.js                    REPL

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeRuntime, evaluate, display, BUILTINS_OUTPUT, VERSION, LispError, ReadError } from '../src/index.js';

const args = process.argv.slice(2);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const libs = {};
for (const name of ['list', 'functional']) {
  try { libs[name] = readFileSync(join(root, 'lib', name + '.lsp'), 'utf8'); } catch {}
}
const runtime = makeRuntime(libs);

function fail(err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}

if (args[0] === 'run') {
  try {
    const value = evaluate(readFileSync(args[1], 'utf8'), runtime.env);
    for (const line of BUILTINS_OUTPUT) process.stdout.write(line);
    if (value !== null && value !== undefined) console.log(`=> ${display(value)}`);
  } catch (err) { fail(err); }
  process.exit(0);
}

console.log(`Lispia ${VERSION} — a tiny Lisp with macros and TCO. Ctrl+D to exit.`);
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'lispia> ' });
rl.prompt();

let buffer = '';

rl.on('line', (line) => {
  buffer += (buffer ? '\n' : '') + line;
  const opens = (buffer.match(/\(/g) ?? []).length - (buffer.match(/\)/g) ?? []).length;
  if (opens > 0) { rl.setPrompt('...... '); rl.prompt(); return; }
  try {
    const value = evaluate(buffer, runtime.env);
    for (const line of BUILTINS_OUTPUT) console.log(line);
    if (value !== null && value !== undefined) console.log(`=> ${display(value)}`);
  } catch (err) {
    if (err instanceof LispError) console.log(`error: ${err.message}`);
    else if (err instanceof ReadError) console.log(`read error: ${err.message}`);
    else console.log(`error: ${err.message}`);
  }
  BUILTINS_OUTPUT.length = 0;
  buffer = '';
  rl.setPrompt('lispia> ');
  rl.prompt();
}).on('close', () => { console.log(); process.exit(0); });

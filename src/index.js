// lispia — public API + runtime bootstrap + stdlib loading.

import { read, display, ReadError } from './reader.js';
import { makeEnv, evalExpr, evalProgram, LispError, BUILTINS_OUTPUT } from './eval.js';

export { read, display, ReadError };
export { makeEnv, evalExpr, evalProgram, LispError, BUILTINS_OUTPUT };
export { VERSION } from './version.js';

/**
 * Build a runtime: fresh env with builtins, then evaluate each lib file
 * (lib files are written in Lispia itself — the stdlib is self-hosting).
 */
export function makeRuntime(libs = {}) {
  const env = makeEnv();
  const loaded = [];
  for (const [name, source] of Object.entries(libs)) {
    evalProgram(read(source), env);
    loaded.push(name);
  }
  return { env, loaded };
}

/** Evaluate a source string in the given env, returning the last value. */
export function evaluate(source, env) {
  return evalProgram(read(source), env);
}

/**
 * Convenience: fresh runtime + source, returns { value, output, env }.
 */
export function run(source, { libs = {}, env } = {}) {
  BUILTINS_OUTPUT.length = 0;
  const runtime = env ? { env } : makeRuntime(libs);
  const value = evaluate(source, runtime.env);
  return { value, env: runtime.env, output: BUILTINS_OUTPUT.slice() };
}

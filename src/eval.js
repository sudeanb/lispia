// Lispia evaluator — environments, closures, tail-call optimization,
// quasiquote, and a hygienic defmacro.
//
// TCO: evalExpr is an iterative loop. Tail positions (`if` branches, last
// expression of `begin`/`let`/`do`, and function calls to closures) update
// expr/env and `continue` instead of recursing — so (loop 1000000) runs in
// constant JS stack. Non-tail subexpressions (operands, conditions) recurse.
//
// Hygiene: `defmacro` templates get their BINDING positions renamed with a
// fresh gensym per expansion (lambda params, let bindings, define names —
// plus every reference reachable from those bindings). Caller-visible
// symbols are never captured by macro-introduced bindings.

import { ReadError, read, display } from './reader.js';

export class LispError extends Error {}

const sym = (name) => ({ type: 'sym', name });
const isSym = (x, name) => x && x.type === 'sym' && (name === undefined || x.name === name);

class Env {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
  }
  lookup(name) {
    let e = this;
    while (e) {
      if (e.vars.has(name)) return e.vars.get(name);
      e = e.parent;
    }
    throw new LispError(`undefined variable '${name}'`);
  }
  defined(name) {
    let e = this;
    while (e) {
      if (e.vars.has(name)) return true;
      e = e.parent;
    }
    return false;
  }
  set(name, value) {
    let e = this;
    while (e) {
      if (e.vars.has(name)) { e.vars.set(name, value); return; }
      e = e.parent;
    }
    throw new LispError(`cannot set undefined '${name}'`);
  }
  define(name, value) { this.vars.set(name, value); }
}

let gensymCounter = 0;
const gensym = (prefix = 'g') => sym(` ${prefix}#${++gensymCounter} `); // space-prefixed: unreadable, uncapturable

// ---- symbol walker used by hygiene ----

function walkSymbols(expr, fn) {
  if (Array.isArray(expr)) {
    let newExpr = expr;
    let changed = false;
    const out = expr.map((x) => walkSymbols(x, fn));
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== expr[i]) { changed = true; break; }
    }
    if (changed) newExpr = out;
    return changed ? newExpr : expr;
  }
  if (expr && expr.type === 'sym') {
    const renamed = fn(expr.name);
    return renamed ? sym(renamed) : expr;
  }
  return expr;
}

/** Rename template bindings (+ their bound references) with fresh names. */
function hygienize(template, argNames) {
  // pass 1: collect binding positions introduced by the template
  const renames = new Map();
  const fresh = (name) => {
    if (!renames.has(name)) renames.set(name, ` ${name}~${++gensymCounter} `);
    return renames.get(name);
  };
  const bindings = [];
  const scan = (expr) => {
    if (!Array.isArray(expr)) return;
    const head = expr[0];
    if (isSym(head, 'lambda') || isSym(head, 'fn')) {
      for (const p of expr[1]) if (p.type === 'sym') bindings.push([p, expr]);
      expr.slice(2).forEach(scan);
      return;
    }
    if (isSym(head, 'let') && Array.isArray(expr[1])) {
      for (const pair of expr[1]) if (pair[0].type === 'sym') bindings.push([pair[0], expr]);
      expr[1].forEach((pair) => scan(pair[1]));
      expr.slice(2).forEach(scan);
      return;
    }
    if (isSym(head, 'define') && expr[1] && expr[1].type === 'sym') {
      bindings.push([expr[1], expr]);
      expr.slice(2).forEach(scan);
      return;
    }
    expr.forEach(scan);
  };
  scan(template);
  if (!bindings.length) return template;

  // a binding is "template-local" only if its name does not shadow a macro
  // argument (arguments must stay visible to the expansion site)
  const local = bindings.filter(([s]) => !argNames.has(s.name));
  if (!local.length) return template;
  local.forEach(([s]) => fresh(s.name));

  // pass 2: rename consistently — walk with scope awareness
  const renameScope = (expr, bound) => {
    if (!Array.isArray(expr)) return expr;
    const head = expr[0];
    if (isSym(head, 'lambda') || isSym(head, 'fn')) {
      const params = expr[1].map((p) =>
        p.type === 'sym' && renames.has(p.name) ? sym(renames.get(p.name)) : p);
      const newBound = new Set(bound);
      params.forEach((p) => p.type === 'sym' && newBound.add(p.name));
      return [head, params, ...expr.slice(2).map((x) => renameScope(x, newBound))];
    }
    if (isSym(head, 'let') && Array.isArray(expr[1])) {
      // parallel let: value exprs see the OUTER scope; renamed bindings are
      // visible to the body
      const bodyBound = new Set(bound);
      const pairs = expr[1].map((pair) => {
        const renamedName = pair[0].type === 'sym' && renames.has(pair[0].name)
          ? sym(renames.get(pair[0].name)) : pair[0];
        if (renamedName.type === 'sym') bodyBound.add(renamedName.name);
        return [renamedName, renameScope(pair[1], bound)];
      });
      return [head, pairs, ...expr.slice(2).map((x) => renameScope(x, bodyBound))];
    }
    if (isSym(head, 'define') && expr[1] && expr[1].type === 'sym' && renames.has(expr[1].name)) {
      const renamedName = sym(renames.get(expr[1].name));
      const newBound = new Set(bound);
      newBound.add(renamedName.name); // references rename to match the header
      return [head, renamedName, ...expr.slice(2).map((x) => renameScope(x, newBound))];
    }
    return expr.map((x) => {
      if (x && x.type === 'sym') {
        if (renames.has(x.name) && !bound.has(x.name)) return sym(renames.get(x.name));
        return x;
      }
      return renameScope(x, bound);
    });
  };
  return renameScope(template, new Set());
}

// ---- quasiquote ----

function quasiquote(x, env, depth) {
  if (!Array.isArray(x)) return x;
  if (x.length && isSym(x[0], 'unquote')) {
    if (depth === 1) return evalExpr(x[1], env);
    return [x[0], quasiquote(x[1], env, depth - 1)];
  }
  if (x.length && isSym(x[0], 'quasiquote')) return [x[0], quasiquote(x[1], env, depth + 1)];

  const out = [];
  for (const item of x) {
    if (Array.isArray(item) && item.length && isSym(item[0], 'unquote-splicing') && depth === 1) {
      const spliced = evalExpr(item[1], env);
      if (!Array.isArray(spliced)) throw new LispError('unquote-splicing needs a list');
      out.push(...spliced);
    } else {
      out.push(quasiquote(item, env, depth));
    }
  }
  return out;
}

// ---- evaluator ----

const fold = (init, fn) => (...xs) => xs.reduce(fn, init);
const chain = (cmp) => (...xs) => {
  for (let i = 0; i + 1 < xs.length; i++) if (!cmp(xs[i], xs[i + 1])) return false;
  return true;
};

const BUILTINS = new Map([
  ['+', fold(0, (a, b) => a + b)],
  ['-', (...xs) => xs.length === 1 ? -xs[0] : xs.reduce((a, b) => a - b)],
  ['*', fold(1, (a, b) => a * b)],
  ['/', (...xs) => xs.reduce((a, b) => {
    if (b === 0) throw new LispError('division by zero');
    return Math.floor(a / b);
  })],
  ['%', (a, b) => { if (b === 0) throw new LispError('modulo by zero'); return a % b; }],
  ['<', chain((a, b) => a < b)],
  ['>', chain((a, b) => a > b)],
  ['<=', chain((a, b) => a <= b)],
  ['>=', chain((a, b) => a >= b)],
  ['=', chain((a, b) => a === b)],
  ['not', (a) => !a],
  ['cons', (a, b) => [a, ...(b ?? [])]],
  ['car', (a) => { if (!Array.isArray(a) || !a.length) throw new LispError('car of empty list'); return a[0]; }],
  ['cdr', (a) => { if (!Array.isArray(a) || !a.length) throw new LispError('cdr of empty list'); return a.slice(1); }],
  ['null?', (a) => Array.isArray(a) && a.length === 0],
  ['pair?', (a) => Array.isArray(a)],
  ['length', (a) => a.length],
  ['display', (a) => { BUILTINS_OUTPUT.push(display(a).replace(/^"|"$/g, '')); return null; }],
  ['newline', () => { BUILTINS_OUTPUT.push('\n'); return null; }],
]);

export const BUILTINS_OUTPUT = [];

export function makeEnv() {
  const env = new Env(null);
  for (const [name, fn] of BUILTINS) env.define(name, fn);
  env.define('list', (...xs) => xs);
  env.define('gensym', (prefix) => gensym(prefix ?? 'g'));
  env.define('nil', null);
  env.define('apply', (fn, args) => {
    if (fn && fn.type === 'macro') throw new LispError('cannot apply a macro as a function');
    const callEnv = new Env(fn.env);
    fn.params.forEach((p, i) => callEnv.define(p, args[i]));
    let result = null;
    for (const expr of fn.body) result = evalExpr(expr, callEnv);
    return result;
  });
  return env;
}

function makeClosure(params, body, env, name) {
  return { type: 'fn', params: params.map((p) => p.name), body, env, name };
}

function evalBody(body, env) {
  let result = null;
  for (const expr of body) result = evalExpr(expr, env);
  return result;
}

export function evalExpr(expr, env) {
  while (true) { // TCO loop
    if (Array.isArray(expr) && expr.length === 0) return null; // () is nil
    if (expr && expr.type === 'sym') return env.lookup(expr.name);
    if (!Array.isArray(expr)) return expr; // numbers, strings, booleans

    const head = expr[0];
    if (head && head.type === 'sym') {
      switch (head.name) {
        case 'quote': return expr[1];
        case 'quasiquote': return quasiquote(expr[1], env, 1);
        case 'if': {
          const cond = evalExpr(expr[1], env);
          if (cond !== false && cond !== null && cond !== undefined) { expr = expr[2]; continue; }
          if (expr.length > 3) { expr = expr[3]; continue; }
          return null;
        }
        case 'define': {
          if (Array.isArray(expr[1])) {
            const name = expr[1][0].name;
            const fn = makeClosure(expr[1].slice(1), expr.slice(2), env, name);
            env.define(name, fn);
            return null;
          }
          env.define(expr[1].name, evalExpr(expr[2], env));
          return null;
        }
        case 'set': {
          env.set(expr[1].name, evalExpr(expr[2], env));
          return null;
        }
        case 'fn': case 'lambda':
          return makeClosure(expr[1], expr.slice(2), env);
        case 'let': {
          const letEnv = new Env(env);
          for (const pair of expr[1]) letEnv.define(pair[0].name, evalExpr(pair[1], env));
          env = letEnv;
          expr = [sym('begin'), ...expr.slice(2)];
          continue;
        }
        case 'begin': case 'do': {
          if (expr.length === 1) return null;
          for (let i = 1; i < expr.length - 1; i++) evalExpr(expr[i], env);
          expr = expr[expr.length - 1];
          continue;
        }
        case 'and': {
          let v = true;
          for (let i = 1; i < expr.length; i++) {
            v = evalExpr(expr[i], env);
            if (v === false) return false;
          }
          return v;
        }
        case 'or': {
          for (let i = 1; i < expr.length; i++) {
            const v = evalExpr(expr[i], env);
            if (v !== false) return v;
          }
          return false;
        }
        case 'defmacro': {
          const name = expr[1].name;
          const params = expr[2].map((p) => p.name);
          const template = expr[3];
          env.define(name, {
            type: 'macro', name, params,
            expand: (args, callEnv) => {
              const macroEnv = new Env(null);
              params.forEach((p, i) => macroEnv.define(p, args[i]));
              // the template is stored as (quasiquote <body>) — expand the BODY
              const tpl = Array.isArray(template) && isSym(template[0], 'quasiquote')
                ? template[1] : template;
              const hyg = hygienize(tpl, new Set(params));
              return expandQuasiquoteTemplate(hyg, macroEnv, callEnv);
            },
          });
          return null;
        }
      }

      // macro call: expand with UNEVALUATED args, then evaluate the expansion
      if (env.defined(head.name)) {
        const value = env.lookup(head.name);
        if (value && value.type === 'macro') {
          expr = value.expand(expr.slice(1), env);
          continue;
        }
      }

      // function call (tail position → loop)
      const fn = evalExpr(head, env);
      const args = expr.slice(1).map((a) => evalExpr(a, env));
      if (typeof fn === 'function') return fn(...args);
      if (!fn || fn.type !== 'fn') throw new LispError(`not callable: ${display(fn)}`);
      const callEnv = new Env(fn.env);
      if (args.length !== fn.params.length) {
        throw new LispError(`arity mismatch: ${fn.name ?? 'fn'} wants ${fn.params.length}, got ${args.length}`);
      }
      fn.params.forEach((p, i) => callEnv.define(p, args[i]));
      expr = [sym('begin'), ...fn.body];
      env = callEnv;
      continue;
    }

    throw new LispError(`cannot evaluate ${display(expr)}`);
  }
}

/** Template bodies are implicit quasiquotes — evaluate only unquotes. */
function expandQuasiquoteTemplate(template, macroEnv, callEnv) {
  const qq = (x) => {
    if (!Array.isArray(x)) return x;
    if (isSym(x[0], 'unquote')) return evalExprIn(x[1], macroEnv, callEnv);
    if (isSym(x[0], 'quasiquote')) return [x[0], qq(x[1])];
    const out = [];
    for (const item of x) {
      if (Array.isArray(item) && item.length && isSym(item[0], 'unquote-splicing')) {
        const spliced = evalExprIn(item[1], macroEnv, callEnv);
        if (!Array.isArray(spliced)) throw new LispError('unquote-splicing needs a list');
        out.push(...spliced);
      } else {
        out.push(qq(item));
      }
    }
    return out;
  };
  return qq(template);
}

// unquotes may reference macro parameters (macro env) or runtime values (call env)
function evalExprIn(expr, macroEnv, callEnv) {
  try {
    return evalExpr(expr, macroEnv);
  } catch (err) {
    if (err instanceof LispError && /undefined variable/.test(err.message)) {
      return evalExpr(expr, callEnv);
    }
    throw err;
  }
}

/** Evaluate a whole program (array of forms); returns the last value. */
export function evalProgram(forms, env = makeEnv()) {
  let result = null;
  for (const form of forms) result = evalExpr(form, env);
  return result;
}

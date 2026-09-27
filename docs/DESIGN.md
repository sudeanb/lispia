# λ Lispia — Design Document

Lispia is a small Lisp with tail-call optimization and hygienic macros. The
interpreter, the macro expander and the standard library live in this repo;
the stdlib is written **in Lispia itself**.

## 1. Data model

| Reader form | Runtime value |
|---|---|
| `42`, `2.5` | JS number |
| `"str"` | `{type:'str', value}` |
| `sym` | `{type:'sym', name}` |
| `(a b c)` | JS array (proper lists — no dotted pairs) |
| `#t` / `#f` | `true` / `false` |
| `()` | `null` at runtime (the empty list is nil) |

## 2. Reader

Recursive descent over parenthesized forms, `;` line comments, `'` quote
sugar plus `` ` ``/`,`/`,@` (quasiquote, unquote, splicing). Errors carry
line numbers. Strings support `\n` `\t` `\"` escapes.

## 3. Evaluator with TCO

`evalExpr` is a `while (true)` loop. The **tail positions** — the taken
branch of `if`, the last expression of `begin`/`let`, and closure calls —
rebind `expr`/`env` and `continue` instead of recursing:

```
(call f x)  →  bind x in a closure env, expr = body, loop
```

A million-deep tail loop runs in constant JavaScript stack (tested: 1,000,000
iterations). Non-tail positions — operands and conditions — recurse normally,
which is exactly the Scheme contract: recursion through the tail position is
iteration, anything else consumes stack.

## 4. Hygienic macros

`defmacro` stores the unevaluated template (a quasiquote form). At the call
site the expansion happens in two steps:

1. **Hygienic renaming** — every binding introduced by the template
   (lambda params, `let` bindings, `define` names) plus its bound
   references is renamed with a fresh counter (`tmp` → ` tmp~7 `). Symbols
   that name macro *parameters* are exempt (they must resolve to the
   caller's argument forms).
2. **Template substitution** — `unquote` evaluates in the macro
   environment (where the parameters live), `unquote-splicing` splices
   lists; anything else is copied verbatim, so caller code cannot be
   captured.

The result is spliced back and evaluated as ordinary code:

```lisp
(defmacro with-tmp (val body)
  `(let ((tmp ,val)) ,body))
(define tmp 99)
(with-tmp 1 tmp)    ; => 99  — a non-hygienic macro would wrongly yield 1
```

This is binding-level hygiene: it defeats the classic capture problem
without full syntax-object machinery. `gensym` is also exposed for manual
hygiene in fancier macros.

## 5. Self-hosting stdlib

`lib/list.lsp` and `lib/functional.lsp` are written in Lispia — `map`,
`filter`, `reduce`, `range`, `reverse`, `append2`, `compose`, `curry2`,
and the `while` macro (whose internal `loop` binding is protected by the
hygiene system). The Node CLI, the tests and the browser playground all
load them the same way.

## 6. Testing

- reader shapes (numbers, symbols, strings, quote sugar, empty lists)
- closures, variadic arithmetic, comparison chains
- **TCO proof**: 1,000,000-iteration tail loop + tail position through
  `let`/`begin`
- macro expansion, splicing, and the capture tests above
- stdlib behaviour (map/filter/reduce against hand-computed results)

## 7. Roadmap

- dotted pairs & immutable linked lists (O(1) `cdr`)
- `letrec` + mutual recursion without declaration order
- string/symbol interning table for faster lookup
- compile-to-closure optimization (partial evaluation)

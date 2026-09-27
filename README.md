# λ Lispia

**A tiny Lisp with tail-call optimization and hygienic macros — plus a
standard library written in Lispia itself. Zero dependencies.**

[![CI](https://github.com/sudeanb/lispia/actions/workflows/ci.yml/badge.svg)](https://github.com/sudeanb/lispia/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)](package.json)

▶ **[Open the browser REPL →](https://sudeanb.github.io/lispia/)**

```lisp
; closures + TCO + hygienic macros, all in one program
(define (make-adder n) (fn (x) (+ x n)))
(define (count n) (if (= n 0) 'done (count (- n 1))))

(count 1000000)               ; => done   (constant JS stack — real TCO)

(defmacro with-tmp (val body)
  `(let ((tmp ,val)) ,body))
(define tmp 99)
(with-tmp 1 tmp)              ; => 99    (hygiene: the macro's `tmp`
                                          cannot capture yours)
```

## What's inside

- **Reader** — s-expressions with `'` `` ` `` `,` `,@` sugar, strings,
  line comments, line-precise errors
- **Evaluator** — iterative tail-position loop: a million-deep tail call
  uses constant JavaScript stack; closures capture their defining
  environment
- **Hygienic `defmacro`** — templates are quasiquote forms; binding
  positions introduced by the template are renamed with fresh gensyms per
  expansion, so macros can never capture caller variables (see
  [docs/DESIGN.md §4](docs/DESIGN.md#4-hygienic-macros) for the exact rule)
- **Self-hosting stdlib** — `map`, `filter`, `reduce`, `range`, `reverse`,
  `compose`, `curry2` and the `while` macro, all written in Lispia
  ([lib/](lib/))
- **REPLs** — Node CLI and browser playground

## Quick start

```bash
git clone https://github.com/sudeanb/lispia.git
cd lispia
node --test                                   # 13 tests
node bin/lispia.js                            # REPL
node bin/lispia.js run lib/list.lsp           # load + run a file
```

REPL session:

```
lispia> (define sq (fn (x) (* x x)))
lispia> (map sq '(1 2 3))
=> (1 4 9)
```

## Design decisions worth reading about

- [docs/DESIGN.md §3](docs/DESIGN.md#3-evaluator-with-tco) — how the
  TCO loop rebinds `expr`/`env` instead of recursing, and why
  non-tail recursion *should* still consume stack
- [§4](docs/DESIGN.md#4-hygienic-macros) — binding-level hygiene via
  scope-aware renaming: the classic `(let ((tmp …)) …)` capture bug,
  and why it can't happen here
- Honest limitations (no dotted pairs, no `letrec` yet) listed in the
  roadmap

## License

[MIT](LICENSE)

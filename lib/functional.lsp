; functional.lsp — macros and higher-order helpers
; `while` macro: gensym-hygienic — the internal loop binding cannot capture
; the caller's variables (see docs/DESIGN.md §4)
(defmacro while (cond body)
  `(begin
    (define loop (fn () (if ,cond (do ,body (loop)) nil)))
    (loop)))

(define (compose f g) (fn (x) (f (g x))))
(define (curry2 f x) (fn (y) (f x y)))

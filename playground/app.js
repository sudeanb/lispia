// Lispia playground — browser REPL.

import { makeRuntime, evaluate, display } from '../src/index.js';

// the self-hosting stdlib, inlined for the browser
const LIB_SOURCES = {
  list: `; list utilities, written in Lispia
(define (map f xs)
  (if (null? xs) ()
      (cons (f (car xs)) (map f (cdr xs)))))
(define (filter pred xs)
  (if (null? xs) ()
      (if (pred (car xs))
          (cons (car xs) (filter pred (cdr xs)))
          (filter pred (cdr xs)))))
(define (reduce f acc xs)
  (if (null? xs) acc
      (reduce f (f acc (car xs)) (cdr xs))))
(define (range a b)
  (if (> a b) () (cons a (range (+ a 1) b))))`,
  functional: `; macros and higher-order helpers
(defmacro while (cond body)
  \`(begin
    (define loop (fn () (if ,cond (do ,body (loop)) nil)))
    (loop)))
(define (compose f g) (fn (x) (f (g x))))`,
};

const DEFAULT = `; Lispia — tail-call optimized Lisp with hygienic macros
(define (map f xs)
  (if (null? xs) ()
      (cons (f (car xs)) (map f (cdr xs)))))

(define sq (fn (x) (* x x)))
(display (map sq '(1 2 3 4 5)))
(newline)

; TCO: a million iterations, no stack overflow
(define (count n) (if (= n 0) 'done (count (- n 1))))
(count 1000000)

; hygienic macro: its internal 'tmp' cannot capture yours
(defmacro with-tmp (val body)
  \`(let ((tmp ,val)) ,body))
(define tmp 99)
(with-tmp 1 tmp)               ; => 99 (not 1)`;

const srcEl = document.getElementById('src');
const outEl = document.getElementById('out');

const runtime = makeRuntime(LIB_SOURCES);

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

import { BUILTINS_OUTPUT } from '../src/index.js';

function runSource() {
  const line = document.createElement('div');
  BUILTINS_OUTPUT.length = 0;
  try {
    const value = evaluate(srcEl.value, runtime.env);
    line.innerHTML = esc(BUILTINS_OUTPUT.join('')) + (value !== null && value !== undefined
      ? `<span class="val">=> ${esc(display(value))}</span>` : '');
  } catch (err) {
    line.innerHTML = `<span class="err">${esc(err.message)}</span>`;
  }
  outEl.appendChild(line);
}

document.getElementById('run').addEventListener('click', runSource);
document.getElementById('clear').addEventListener('click', () => { outEl.textContent = ''; });
srcEl.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runSource();
});

srcEl.value = DEFAULT;
runSource();

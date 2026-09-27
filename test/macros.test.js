import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { run, display } from '../src/index.js';

test('macro-introduced bindings cannot capture caller variables (hygiene)', () => {
  const r = run(`
    (defmacro with-tmp (val body)
      \`(let ((tmp ,val)) ,body))
    (define tmp 99)
    (with-tmp 1 tmp)
  `);
  // unhygienic expansion would be (let ((tmp 1)) tmp) -> 1
  assert.equal(r.value, 99);
});

test('hygiene is consistent: template references share the renamed binding', () => {
  const r = run(`
    (defmacro twice-init () \`(let ((x 5)) (+ x x)))
    (define x 1)
    (twice-init)
  `);
  assert.equal(r.value, 10);
});

test('macro arguments stay visible to the expansion', () => {
  const r = run(`
    (defmacro set-if-smaller (a b) \`(let ((tmp ,b)) (if (< tmp ,a) (set ,a tmp))))
    (define best 10)
    (set-if-smaller best 3)
    best
  `);
  assert.equal(r.value, 3);
});

test('stdlib while macro works (self-hosting hygiene)', () => {
  const r = run(`
    (defmacro while (cond body)
      \`(begin
        (define loop (fn () (if ,cond (do ,body (loop)) nil)))
        (loop)))
    (define i 0)
    (define total 0)
    (while (< i 10) (begin (set total (+ total i)) (set i (+ i 1))))
    total
  `);
  assert.equal(r.value, 45);
});

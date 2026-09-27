import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { read, display } from '../src/reader.js';
import { run, evalProgram, makeEnv, evalExpr } from '../src/index.js';

test('reader: numbers, symbols, lists, strings, booleans', () => {
  const forms = read('(+ 1 2.5) foo "bar\\n" #t ()');
  assert.deepEqual(forms[0], [{ type: 'sym', name: '+' }, 1, 2.5]);
  assert.deepEqual(forms[1], { type: 'sym', name: 'foo' });
  assert.deepEqual(forms[4], []);
  assert.deepEqual(forms[2], { type: 'str', value: 'bar\n' });
  assert.equal(forms[3], true);
  assert.deepEqual(forms[4], []);
});

test('reader: quote sugar expands', () => {
  const forms = read("'(a b)");
  assert.deepEqual(forms[0][0], { type: 'sym', name: 'quote' });
  assert.deepEqual(forms[0][1], [{ type: 'sym', name: 'a' }, { type: 'sym', name: 'b' }]);
});

test('eval: arithmetic and comparison', () => {
  assert.equal(run('(+ 1 2 3)').value, 6);
  assert.equal(run('(* 2 (- 10 4))').value, 12);
  assert.equal(run('(< 1 2)').value, true);
});

test('closures capture their defining environment', () => {
  const r = run(`
    (define (make-adder n) (fn (x) (+ x n)))
    (define add10 (make-adder 10))
    (add10 5)
  `);
  assert.equal(r.value, 15);
});

test('TCO: million-iteration tail loop runs in constant JS stack', () => {
  const r = run(`
    (define (count n) (if (= n 0) 'done (count (- n 1))))
    (count 1000000)
  `);
  assert.equal(display(r.value), 'done');
});

test('TCO through begin and let tail positions', () => {
  const r = run(`
    (define (go n)
      (if (= n 0) 'ok
          (let ((m (- n 1)))
            (begin (go m)))))
    (go 100000)
  `);
  assert.equal(display(r.value), 'ok');
});

test('non-tail recursion still uses the stack (and finishes)', () => {
  const r = run(`
    (define (sum n) (if (= n 0) 0 (+ n (sum (- n 1)))))
    (sum 1000)
  `);
  assert.equal(r.value, 500500);
});

test('quasiquote, unquote and splicing', () => {
  assert.deepEqual(run('`(1 ,(+ 1 1) 3)').value, [1, 2, 3]);
  assert.deepEqual(run('`(1 ,@(list 2 3) 4)').value, [1, 2, 3, 4]);
});

test('defmacro expands at call time', () => {
  const r = run(`
    (defmacro unless (c a b) \`(if ,c ,b ,a))
    (unless #f 'yes 'no)
  `);
  assert.equal(display(r.value), 'yes');
});

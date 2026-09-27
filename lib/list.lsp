; list.lsp — list utilities, written in Lispia (self-hosting stdlib)
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

(define (append2 a b)
  (if (null? a) b
      (cons (car a) (append2 (cdr a) b))))

(define (reverse xs)
  (define (go xs acc)
    (if (null? xs) acc (go (cdr xs) (cons (car xs) acc))))
  (go xs ()))

(define (range a b)
  (if (> a b) () (cons a (range (+ a 1) b))))

// Lispia reader — source text → s-expressions.
//
// Data shapes:
//   numbers      → JS numbers
//   strings      → { type: 'str', value }
//   symbols      → { type: 'sym', name }
//   lists        → JS arrays
//   quote forms  → [sym('quote'), x], [sym('quasiquote'), x],
//                  [sym('unquote'), x], [sym('unquote-splicing'), x]
// Dotted pairs are not supported (documented: lists are proper arrays).

export class ReadError extends Error {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message);
    this.line = line;
  }
}

const sym = (name) => ({ type: 'sym', name });
const ATOM_END = new Set([')', "'", '`', ',', ';']);

export function read(source) {
  let i = 0;
  let line = 1;

  const skip = () => {
    while (i < source.length) {
      const c = source[i];
      if (c === ';') { while (i < source.length && source[i] !== '\n') i++; continue; }
      if (/\s/.test(c)) { if (c === '\n') line++; i++; continue; }
      break;
    }
  };

  function readExpr() {
    skip();
    if (i >= source.length) throw new ReadError('unexpected end of input', line);
    const c = source[i];

    if (c === '(' || c === '[') {
      const close = c === '(' ? ')' : ']';
      i++;
      const list = [];
      skip();
      while (i < source.length && source[i] !== close) {
        list.push(readExpr());
        skip();
      }
      if (i >= source.length) throw new ReadError(`missing closing '${close}'`, line);
      i++;
      return list;
    }
    if (c === ')' || c === ']') throw new ReadError(`unexpected '${c}'`, line);

    if (c === "'") { i++; return [sym('quote'), readExpr()]; }
    if (c === '`') { i++; return [sym('quasiquote'), readExpr()]; }
    if (c === ',') {
      i++;
      if (source[i] === '@') { i++; return [sym('unquote-splicing'), readExpr()]; }
      return [sym('unquote'), readExpr()];
    }

    if (c === '"') {
      i++;
      let s = '';
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') {
          i++;
          const e = source[i];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
        } else s += source[i];
        i++;
      }
      if (i >= source.length) throw new ReadError('unterminated string', line);
      i++;
      return { type: 'str', value: s };
    }

    // atom
    let start = i;
    while (i < source.length && !/\s/.test(source[i]) && !ATOM_END.has(source[i]) && source[i] !== '(' && source[i] !== '[') i++;
    const token = source.slice(start, i);
    if (/^[+-]?\d+(\.\d+)?$/.test(token)) return Number(token);
    if (token === '#t') return true;
    if (token === '#f') return false;
    return sym(token);
  }

  const forms = [];
  skip();
  while (i < source.length) {
    forms.push(readExpr());
    skip();
  }
  return forms;
}

export function display(x) {
  if (x === true) return '#t';
  if (x === false) return '#f';
  if (x === null) return '()';
  if (typeof x === 'number') return String(x);
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) return '(' + x.map(display).join(' ') + ')';
  if (x.type === 'sym') return x.name;
  if (x.type === 'str') return JSON.stringify(x.value);
  if (x.type === 'fn') return '<fn' + (x.name ? ':' + x.name : '') + '>';
  if (x.type === 'macro') return '<macro:' + x.name + '>';
  return String(x);
}

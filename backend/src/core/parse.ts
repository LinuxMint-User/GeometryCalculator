// 字符串 → 表达式树
// 支持：+ - * / ^ 括号、隐式乘法（2x、2(x+1)、(a)(b)、x2）、
//       小数转分数、常数 e/pi、函数 sin/cos/tan/exp/ln/sqrt

import { add, fn, mul, num, pow, rat, sqrt, sym, type Expr, type FnName, type Rat } from './expr.js'

const FN_NAMES: ReadonlySet<string> = new Set(['sin', 'cos', 'tan', 'exp', 'ln', 'sqrt', 'acos'])

export class ParseError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message)
    this.name = 'ParseError'
  }
}

type Tok =
  | { kind: 'num'; value: number; pos: number }
  | { kind: 'ident'; name: string; pos: number }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '^'; pos: number }
  | { kind: 'lparen'; pos: number }
  | { kind: 'rparen'; pos: number }

function tokenize(input: string): Tok[] {
  const tokens: Tok[] = []
  let i = 0
  while (i < input.length) {
    const c = input[i]!
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c >= '0' && c <= '9') {
      const start = i
      let dot = false
      while (i < input.length) {
        const d = input[i]!
        if (d >= '0' && d <= '9') {
          i++
        } else if (d === '.' && !dot) {
          dot = true
          i++
        } else {
          break
        }
      }
      tokens.push({ kind: 'num', value: Number(input.slice(start, i)), pos: start })
      continue
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      const start = i
      while (i < input.length) {
        const d = input[i]!
        if ((d >= 'a' && d <= 'z') || (d >= 'A' && d <= 'Z')) i++
        else break
      }
      tokens.push({ kind: 'ident', name: input.slice(start, i), pos: start })
      continue
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      tokens.push({ kind: 'op', op: c, pos: i })
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen', pos: i })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', pos: i })
      i++
      continue
    }
    throw new ParseError(`无法识别的字符 "${c}"`, i)
  }
  return tokens
}

/** 有限小数转分数节点 */
function numFromNumber(value: number): Expr {
  if (!Number.isFinite(value)) throw new ParseError('非法数字', 0)
  if (Number.isInteger(value)) return num(BigInt(value))
  const s = value.toString()
  const dotIdx = s.indexOf('.')
  const fracPart = s.slice(dotIdx + 1)
  const digits = BigInt(s.slice(0, dotIdx) + fracPart)
  const den = 10n ** BigInt(fracPart.length)
  return num(digits, den)
}

class Parser {
  private pos = 0

  constructor(private readonly tokens: Tok[]) {}

  private peek(): Tok | undefined {
    return this.tokens[this.pos]
  }

  private next(): Tok | undefined {
    return this.tokens[this.pos++]
  }

  private atEnd(): boolean {
    return this.pos >= this.tokens.length
  }

  parse(): Expr {
    const e = this.parseAdd()
    if (!this.atEnd()) {
      const t = this.peek()!
      throw new ParseError(`意外的符号 "${describe(t)}"`, t.pos)
    }
    return e
  }

  private parseAdd(): Expr {
    let left = this.parseMul()
    for (;;) {
      const t = this.peek()
      if (t === undefined || t.kind !== 'op' || (t.op !== '+' && t.op !== '-')) return left
      this.next()
      const right = this.parseMul()
      left = t.op === '+' ? add(left, right) : add(left, mul(num(-1), right))
    }
  }

  private parseMul(): Expr {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      if (t === undefined) return left
      if (t.kind === 'op' && (t.op === '*' || t.op === '/')) {
        this.next()
        const right = this.parseUnary()
        left = t.op === '*' ? mul(left, right) : mul(left, pow(right, rat(-1)))
        continue
      }
      // 隐式乘法：下一个 token 能开始一个因子
      if (t.kind === 'num' || t.kind === 'ident' || t.kind === 'lparen') {
        const right = this.parseUnary()
        left = mul(left, right)
        continue
      }
      return left
    }
  }

  private parseUnary(): Expr {
    const t = this.peek()
    if (t !== undefined && t.kind === 'op' && (t.op === '-' || t.op === '+')) {
      this.next()
      const inner = this.parseUnary()
      return t.op === '-' ? mul(num(-1), inner) : inner
    }
    return this.parsePow()
  }

  private parsePow(): Expr {
    const base = this.parsePrimary()
    const t = this.peek()
    if (t !== undefined && t.kind === 'op' && t.op === '^') {
      this.next()
      const exp = this.parseUnary() // 右结合：x^2^3 = x^(2^3)
      return pow(base, requireIntExp(exp, t.pos))
    }
    return base
  }

  private parsePrimary(): Expr {
    const t = this.next()
    if (t === undefined) throw new ParseError('表达式不完整', 0)
    switch (t.kind) {
      case 'num':
        return numFromNumber(t.value)
      case 'lparen': {
        const inner = this.parseAdd()
        const close = this.next()
        if (close === undefined || close.kind !== 'rparen') {
          throw new ParseError('缺少右括号', t.pos)
        }
        return inner
      }
      case 'ident': {
        if (FN_NAMES.has(t.name)) {
          if (this.peek()?.kind !== 'lparen') throw new ParseError(`函数 ${t.name} 后需要括号`, t.pos)
          this.next()
          const arg = this.parseAdd()
          const close = this.next()
          if (close === undefined || close.kind !== 'rparen') throw new ParseError('缺少右括号', t.pos)
          if (t.name === 'sqrt') return sqrt(arg)
          return fn(t.name as FnName, arg)
        }
        if (t.name === 'pi') return sym('pi')
        if (t.name === 'e') return sym('e')
        return sym(t.name)
      }
      default:
        throw new ParseError(`意外的符号 "${describe(t)}"`, t.pos)
    }
  }
}

function requireIntExp(e: Expr, pos: number): Rat {
  if (e.kind === 'num' && e.rat.d === 1n) return e.rat
  throw new ParseError('指数必须为整数', pos)
}

function describe(t: Tok): string {
  switch (t.kind) {
    case 'num':
      return `数字 ${t.value}`
    case 'ident':
      return `标识符 "${t.name}"`
    case 'op':
      return `运算符 "${t.op}"`
    case 'lparen':
      return '"("'
    case 'rparen':
      return '")"'
  }
}

export function parse(input: string): Expr {
  return new Parser(tokenize(input)).parse()
}

// 一元多项式代数与公式法求根（P2）
// 几何约束消元后生成的多项式方程是主战场：P2 覆盖一次/二次公式法，
// 三次及以上不实现通用根式公式（红灯区），交由数值兜底（P4 numeric.ts）。
// 系数一律用有理数（Rat）精确表示，不引入浮点。

import {
  add,
  addRat,
  divRat,
  extractSquare,
  isZeroRat,
  mul,
  mulRat,
  neg,
  negRat,
  num,
  rat,
  sqrt,
  subRat,
  type Expr,
  type Rat,
} from './expr.js'

// ---------- 多项式表示 ----------

/** 一元多项式：coeffs[i] = x^i 的系数（低次在前），尾部去零（最高次非零）；零多项式为 [] */
export type Poly = Rat[]

/** 去掉尾部零系数，规整为规范形 */
function norm(p: Rat[]): Poly {
  let len = p.length
  while (len > 0 && isZeroRat(p[len - 1]!)) len--
  return p.slice(0, len)
}

/** 次数：零多项式为 -1 */
export function polyDegree(p: Poly): number {
  return p.length - 1
}

/** 最高次项系数：零多项式为 null */
export function polyLeading(p: Poly): Rat | null {
  return p.length === 0 ? null : p[p.length - 1]!
}

// ---------- 多项式运算 ----------

export function polyAdd(a: Poly, b: Poly): Poly {
  const len = Math.max(a.length, b.length)
  const out: Rat[] = []
  for (let i = 0; i < len; i++) {
    const ca = a[i] ?? { n: 0n, d: 1n }
    const cb = b[i] ?? { n: 0n, d: 1n }
    out.push(addRat(ca, cb))
  }
  return norm(out)
}

export function polySub(a: Poly, b: Poly): Poly {
  const len = Math.max(a.length, b.length)
  const out: Rat[] = []
  for (let i = 0; i < len; i++) {
    const ca = a[i] ?? { n: 0n, d: 1n }
    const cb = b[i] ?? { n: 0n, d: 1n }
    out.push(subRat(ca, cb))
  }
  return norm(out)
}

/** 每项乘常数 k */
export function polyScale(p: Poly, k: Rat): Poly {
  return p.map((c) => mulRat(c, k))
}

/** 卷积乘法 */
export function polyMul(a: Poly, b: Poly): Poly {
  if (a.length === 0 || b.length === 0) return []
  const out: Rat[] = new Array(a.length + b.length - 1).fill({ n: 0n, d: 1n })
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      out[i + j] = addRat(out[i + j]!, mulRat(a[i]!, b[j]!))
    }
  }
  return norm(out)
}

/** 整数次幂（指数非负） */
export function polyPow(p: Poly, e: number): Poly {
  if (!Number.isInteger(e) || e < 0) throw new Error('polyPow 指数必须是非负整数')
  let acc: Poly = [rat(1)]
  for (let i = 0; i < e; i++) acc = polyMul(acc, p)
  return acc
}

/** 有理数求值（Horner 法） */
export function polyEval(p: Poly, x: Rat): Rat {
  let acc: Rat = { n: 0n, d: 1n }
  for (let i = p.length - 1; i >= 0; i--) {
    acc = addRat(mulRat(acc, x), p[i]!)
  }
  return acc
}

/** 多项式逐系数比较（测试辅助） */
export function polyEq(a: Poly, b: Poly): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.n !== b[i]!.n || a[i]!.d !== b[i]!.d) return false
  }
  return true
}

/** 调试输出：按数学习惯降幂排列（如 "2x^3 - x + 1"） */
export function polyToString(p: Poly): string {
  if (p.length === 0) return '0'
  const parts: string[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i]!
    if (isZeroRat(c)) continue
    const absN = c.n < 0n ? -c.n : c.n
    // 系数 ±1 且带变量时省略 "1"
    let coeffStr: string
    if (i > 0 && absN === 1n && c.d === 1n) coeffStr = ''
    else coeffStr = c.d === 1n ? `${absN}` : `${absN}/${c.d}`
    const varStr = i === 0 ? '' : i === 1 ? 'x' : `x^${i}`
    const term = `${coeffStr}${varStr}`
    const negative = c.n < 0n
    if (parts.length === 0) parts.push(negative ? `-${term}` : term)
    else parts.push(negative ? ` - ${term}` : ` + ${term}`)
  }
  return parts.join('')
}

// ---------- 表达式 → 多项式 ----------

/**
 * 把表达式展开为关于 varName 的一元多项式。
 * 返回 null 表示超出 P2 能力：含其他符号（符号参数/超越常数）、sqrt、函数、负幂、分数幂。
 */
export function polyFromExpr(e: Expr, varName: string): Poly | null {
  switch (e.kind) {
    case 'num':
      return norm([e.rat])
    case 'sym': {
      if (e.name === varName) return [rat(0), rat(1)]
      return null // e/pi/其他符号不能进入有理系数多项式（符号参数不处理）
    }
    case 'add': {
      let acc: Poly = []
      for (const t of e.terms) {
        const p = polyFromExpr(t, varName)
        if (p === null) return null
        acc = polyAdd(acc, p)
      }
      return acc
    }
    case 'mul': {
      // 系数直接作为第一个因子乘入
      let acc: Poly = [e.coeff]
      for (const f of e.factors) {
        const p = polyFromExpr(f, varName)
        if (p === null) return null
        acc = polyMul(acc, p)
      }
      return acc
    }
    case 'pow': {
      const exp = e.exp
      if (exp.d !== 1n || exp.n < 0n) return null // 分数幂 / 负幂不是多项式
      const base = polyFromExpr(e.base, varName)
      if (base === null) return null
      return polyPow(base, Number(exp.n))
    }
    default:
      return null // sqrt / fn 不是多项式
  }
}

// ---------- 一元求根（公式法） ----------

export type SolveResult =
  | { kind: 'root'; roots: Expr[] } // 精确根（有理数或 a + b√c 形式）
  | { kind: 'identity' } // 0 = 0，恒等
  | { kind: 'contradiction' } // 0 = k（k ≠ 0），矛盾
  | { kind: 'noReal' } // 二次方程判别式 < 0，无实数解
  | { kind: 'unsupported' } // 次数 ≥ 3，留给数值兜底

/** 整数平方根（BigInt 牛顿迭代） */
function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('isqrt 输入必须非负')
  if (n < 2n) return n
  let x = n
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + n / x) / 2n
  }
  return x
}

/** 非负整数是否为完全平方 */
function isPerfectSquare(n: bigint): boolean {
  if (n < 0n) return false
  const s = isqrt(n)
  return s * s === n
}

/** sqrt(r)（r ≥ 0）提取为 coeff·sqrt(radical)，radical 为正无平方因子整数 */
function sqrtRat(r: Rat): { coeff: Rat; radical: Rat } {
  if (r.n < 0n) throw new Error('负数没有实数平方根')
  if (isZeroRat(r)) return { coeff: rat(0), radical: rat(1) }
  // sqrt(n/d) = sqrt(n·d)/d = k·sqrt(m)/d
  const nd = r.n * r.d
  const [k, m] = extractSquare(nd)
  return { coeff: rat(k, r.d), radical: rat(m) }
}

/** 解 a·x + b = 0 */
export function solveLinear(a: Rat, b: Rat): SolveResult {
  if (isZeroRat(a)) {
    return isZeroRat(b) ? { kind: 'identity' } : { kind: 'contradiction' }
  }
  const r = divRat(negRat(b), a)
  return { kind: 'root', roots: [num(r.n, r.d)] }
}

/** 解 a·x² + b·x + c = 0（公式法，实数域） */
export function solveQuadratic(a: Rat, b: Rat, c: Rat): SolveResult {
  if (isZeroRat(a)) return solveLinear(b, c)
  const twoA = mulRat(rat(2), a)
  const disc = subRat(mulRat(b, b), mulRat(rat(4), mulRat(a, c)))
  if (disc.n < 0n) return { kind: 'noReal' }
  if (isZeroRat(disc)) {
    const r = divRat(negRat(b), twoA)
    return { kind: 'root', roots: [num(r.n, r.d)] }
  }
  const { coeff, radical } = sqrtRat(disc)
  // Δ 是完全平方 → sqrt(Δ) 是有理数，两根直接算
  if (radical.d === 1n && isPerfectSquare(radical.n)) {
    const s = mulRat(coeff, rat(isqrt(radical.n)))
    const r1 = divRat(addRat(negRat(b), s), twoA)
    const r2 = divRat(subRat(negRat(b), s), twoA)
    return { kind: 'root', roots: [num(r1.n, r1.d), num(r2.n, r2.d)] }
  }
  // 否则根为 u ± v·√m 形式（绿灯区 a + b√c 输出）
  const u = divRat(negRat(b), twoA)
  const v = divRat(coeff, twoA)
  const rad: Expr = sqrt(num(radical.n))
  const pos = add(num(u.n, u.d), mul(num(v.n, v.d), rad))
  const negR = add(num(u.n, u.d), neg(mul(num(v.n, v.d), rad)))
  return { kind: 'root', roots: [pos, negR] }
}

/** 解一元多项式方程 p(x) = 0 */
export function solvePoly(p: Poly): SolveResult {
  const n = polyDegree(p)
  if (n < 0) return { kind: 'identity' } // 0 = 0
  if (n === 0) return { kind: 'contradiction' } // 非零常数 = 0
  const a = p[n]!
  if (n === 1) return solveLinear(a, p[0]!)
  if (n === 2) return solveQuadratic(a, p[1]!, p[0]!)
  return { kind: 'unsupported' }
}

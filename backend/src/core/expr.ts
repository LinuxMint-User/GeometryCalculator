// 表达式树与有理数运算
// 规范形（canonical form）约定：
//   - num  有理数，已约分，分母 > 0
//   - add  terms 不含 add、不含 num 项（纯常数独立存放于末尾），同类项已合并，已排序
//   - mul  factors 不含 num、不含 mul、无 0/1，同底幂已合并，已排序；系数为 0 时整个为 num(0)
//   - pow  指数为整数（绿灯区约束），base 不重复构造
//   - sqrt 仅参数为 num 时做平方因子提取；其余保持
//   - fn   初等函数节点

/** 有理数：BigInt 分子/分母，已约分，分母 > 0 */
export interface Rat {
  n: bigint
  d: bigint
}

export type Sign = 'positive' | 'nonnegative' | 'negative' | 'nonpositive' | 'nonzero' | 'real'

export type FnName = 'sin' | 'cos' | 'tan' | 'exp' | 'ln' | 'acos'

export type Expr =
  | { kind: 'num'; rat: Rat }
  | { kind: 'sym'; name: string; sign: Sign | null }
  | { kind: 'add'; terms: Expr[] }
  | { kind: 'mul'; coeff: Rat; factors: Expr[] }
  | { kind: 'pow'; base: Expr; exp: Rat }
  | { kind: 'sqrt'; arg: Expr }
  | { kind: 'fn'; name: FnName; arg: Expr }

// ---------- 有理数 ----------

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b !== 0n) {
    const t = a % b
    a = b
    b = t
  }
  return a
}

/** 构造有理数并约分，分母规范化到正 */
export function rat(n: bigint | number, d: bigint | number = 1): Rat {
  let bn = typeof n === 'bigint' ? n : BigInt(n)
  let bd = typeof d === 'bigint' ? d : BigInt(d)
  if (bd === 0n) throw new Error('有理数分母不能为零')
  if (bd < 0n) {
    bn = -bn
    bd = -bd
  }
  const g = gcd(bn, bd)
  return { n: bn / g, d: bd / g }
}

export const isZeroRat = (r: Rat) => r.n === 0n
export const isOneRat = (r: Rat) => r.n === 1n && r.d === 1n
export const isNegRat = (r: Rat) => r.n < 0n
export const isIntRat = (r: Rat) => r.d === 1n

export const negRat = (r: Rat): Rat => ({ n: -r.n, d: r.d })
export const invRat = (r: Rat): Rat => {
  if (r.n === 0n) throw new Error('零没有倒数')
  return r.n > 0n ? { n: r.d, d: r.n } : { n: -r.d, d: -r.n }
}
export const addRat = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d)
export const subRat = (a: Rat, b: Rat): Rat => addRat(a, negRat(b))
export const mulRat = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d)
export const divRat = (a: Rat, b: Rat): Rat => mulRat(a, invRat(b))

/** 整数次幂（BigInt），指数非负时直接算，负指数由调用方转为倒数 */
export function powRat(base: bigint, e: bigint): bigint {
  if (e < 0n) throw new Error('powRat 只接受非负指数')
  if (e === 0n) return 1n
  let result = 1n
  let b = base
  let x = e
  while (x > 0n) {
    if (x & 1n) result *= b
    b *= b
    x >>= 1n
  }
  return result
}

export function compareRat(a: Rat, b: Rat): number {
  const l = a.n * b.d
  const r = b.n * a.d
  return l < r ? -1 : l > r ? 1 : 0
}

export function ratToNumber(r: Rat): number {
  return Number(r.n) / Number(r.d)
}

/** 提取平方因子：返回 [k, m] 使 n = k²·m，m 无平方因子（n ≥ 0） */
export function extractSquare(n: bigint): [bigint, bigint] {
  let k = 1n
  let m = n
  for (let p = 2n; p * p <= m; ) {
    if (m % p === 0n) {
      let cnt = 0n
      while (m % p === 0n) {
        m /= p
        cnt++
      }
      const e = cnt / 2n
      if (e > 0n) k *= p ** e
      // 奇数个因子时 m 保留一个 p（无平方因子），但必须推进 p，避免在同一质数上死循环
      if (cnt % 2n === 1n) m *= p
    }
    p += p === 2n ? 1n : 2n
  }
  return [k, m]
}

// ---------- 常量 ----------

export const ZERO: Expr = { kind: 'num', rat: { n: 0n, d: 1n } }
export const ONE: Expr = { kind: 'num', rat: { n: 1n, d: 1n } }
export const NEG_ONE: Expr = { kind: 'num', rat: { n: -1n, d: 1n } }

// ---------- 工厂 ----------

/** 有理数节点 */
export function num(n: bigint | number, d: bigint | number = 1): Expr {
  return { kind: 'num', rat: rat(n, d) }
}

/** 符号节点，可带取值范围假设 */
export function sym(name: string, sign: Sign | null = null): Expr {
  return { kind: 'sym', name, sign }
}

export function fn(name: FnName, arg: Expr): Expr {
  return { kind: 'fn', name, arg }
}

/** sqrt 节点：参数为有理数时提取平方因子（绿灯区规则） */
export function sqrt(arg: Expr): Expr {
  if (arg.kind === 'num') {
    const { n, d } = arg.rat
    if (n < 0n) return { kind: 'sqrt', arg } // 实数域无定义，保留
    if (n === 0n) return ZERO
    // sqrt(n/d) = sqrt(n·d)/d = k·sqrt(m)/d
    const nd = n * d
    const [k, m] = extractSquare(nd)
    if (m === 1n) return num(k, d)
    const coeff = rat(k, d)
    const radical: Expr = { kind: 'sqrt', arg: num(m) }
    return isOneRat(coeff) ? radical : mul(num(coeff.n, coeff.d), radical)
  }
  return { kind: 'sqrt', arg }
}

/** 负号 */
export function neg(e: Expr): Expr {
  return mul(NEG_ONE, e)
}

function splitCoeff(e: Expr): { coeff: Rat; rest: Expr } {
  if (e.kind === 'num') return { coeff: e.rat, rest: ONE }
  if (e.kind === 'mul') return { coeff: e.coeff, rest: mulFromFactors(e.factors) }
  return { coeff: { n: 1n, d: 1n }, rest: e }
}

function mulFromFactors(factors: Expr[]): Expr {
  return factors.length === 1 ? factors[0]! : { kind: 'mul', coeff: { n: 1n, d: 1n }, factors }
}

function withCoeff(coeff: Rat, rest: Expr): Expr {
  if (isOneRat(coeff)) return rest
  if (rest.kind === 'mul') return { kind: 'mul', coeff, factors: rest.factors }
  return { kind: 'mul', coeff, factors: [rest] }
}

/** 规范化比较键：mul 忽略系数（供同类项归组与排序） */
export function keyOf(e: Expr): string {
  switch (e.kind) {
    case 'num':
      return `N${e.rat.n}:${e.rat.d}`
    case 'sym':
      return `S${e.name}`
    case 'add':
      return `A(${e.terms.map(keyOf).join(',')})`
    case 'mul':
      return `M(${e.factors.map(keyOf).join(',')})`
    case 'pow':
      return `P(${keyOf(e.base)}^${e.exp.n}:${e.exp.d})`
    case 'sqrt':
      return `R(${keyOf(e.arg)})`
    case 'fn':
      return `F${e.name}(${keyOf(e.arg)})`
  }
}

function byKey(a: Expr, b: Expr): number {
  const ka = keyOf(a)
  const kb = keyOf(b)
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

/** 加法：平铺、合并常数与同类项、丢弃零项、排序 */
export function add(...items: Expr[]): Expr {
  const flat: Expr[] = []
  for (const e of items) {
    if (e.kind === 'num' && isZeroRat(e.rat)) continue
    if (e.kind === 'add') flat.push(...e.terms)
    else flat.push(e)
  }
  const groups = new Map<string, { coeff: Rat; rest: Expr }>()
  let constPart: Rat = { n: 0n, d: 1n }
  for (const e of flat) {
    const { coeff, rest } = splitCoeff(e)
    if (rest.kind === 'num') {
      constPart = addRat(constPart, coeff)
      continue
    }
    const key = keyOf(rest)
    const g = groups.get(key)
    if (g !== undefined) g.coeff = addRat(g.coeff, coeff)
    else groups.set(key, { coeff, rest })
  }
  const terms: Expr[] = []
  for (const { coeff, rest } of groups.values()) {
    if (isZeroRat(coeff)) continue
    terms.push(withCoeff(coeff, rest))
  }
  terms.sort(byKey)
  if (!isZeroRat(constPart)) terms.push(num(constPart.n, constPart.d))
  if (terms.length === 0) return ZERO
  if (terms.length === 1) return terms[0]!
  return { kind: 'add', terms }
}

/** 乘法：平铺、合并系数与同底幂、丢弃 0/1、排序 */
export function mul(...items: Expr[]): Expr {
  let coeff: Rat = { n: 1n, d: 1n }
  const rawFactors: Expr[] = []
  for (const e of items) {
    if (e.kind === 'num') {
      if (isZeroRat(e.rat)) return ZERO
      coeff = mulRat(coeff, e.rat)
      continue
    }
    if (e.kind === 'mul') {
      coeff = mulRat(coeff, e.coeff)
      rawFactors.push(...e.factors)
      continue
    }
    rawFactors.push(e)
  }
  const byBase = new Map<string, { base: Expr; exp: Rat }>()
  for (const f of rawFactors) {
    const base = f.kind === 'pow' ? f.base : f
    const exp = f.kind === 'pow' ? f.exp : { n: 1n, d: 1n }
    const key = keyOf(base)
    const g = byBase.get(key)
    if (g !== undefined) g.exp = addRat(g.exp, exp)
    else byBase.set(key, { base, exp })
  }
  const factors: Expr[] = []
  for (const { base, exp } of byBase.values()) {
    if (isZeroRat(exp)) continue
    factors.push(isOneRat(exp) ? base : { kind: 'pow', base, exp })
  }
  factors.sort(byKey)
  // 系数合并后无因子（如 3^-1 化简为 1/3）：直接返回有理数
  if (factors.length === 0) return num(coeff.n, coeff.d)
  if (isOneRat(coeff)) {
    if (factors.length === 1) return factors[0]!
  }
  return { kind: 'mul', coeff, factors }
}

/** 幂：指数必须是整数（绿灯区约束） */
export function pow(base: Expr, exp: Rat): Expr {
  if (exp.d !== 1n) throw new Error(`幂的指数必须为整数，收到 ${exp.n}/${exp.d}`)
  if (isZeroRat(exp)) return ONE
  if (isOneRat(exp)) return base
  if (base.kind === 'num') {
    if (base.rat.n === 0n && exp.n < 0n) throw new Error('零的负次幂无定义')
    const e = exp.n
    if (e >= 0n) return num(powRat(base.rat.n, e), powRat(base.rat.d, e))
    return num(powRat(base.rat.d, -e), powRat(base.rat.n, -e))
  }
  return { kind: 'pow', base, exp }
}

// ---------- 调试输出 ----------

/** 简单可读字符串（非 LaTeX，用于测试与日志） */
export function debugString(e: Expr): string {
  switch (e.kind) {
    case 'num':
      return e.rat.d === 1n ? `${e.rat.n}` : `${e.rat.n}/${e.rat.d}`
    case 'sym':
      return e.name
    case 'add':
      return e.terms.map(debugString).join(' + ')
    case 'mul': {
      const c = e.coeff
      const head = c.d === 1n ? `${c.n}` : `${c.n}/${c.d}`
      return e.factors.length > 0 ? `${head}*${e.factors.map(debugString).join('*')}` : head
    }
    case 'pow':
      return `${debugString(e.base)}^${debugString(num(e.exp.n, e.exp.d))}`
    case 'sqrt':
      return `sqrt(${debugString(e.arg)})`
    case 'fn':
      return `${e.name}(${debugString(e.arg)})`
  }
}

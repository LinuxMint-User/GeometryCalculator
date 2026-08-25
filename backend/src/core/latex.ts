// 表达式 → LaTeX
// 约定：系数与变量间无乘号（2x）、变量间用空格分隔、分数用 \frac、负幂归入分母

import { isIntRat, isNegRat, isOneRat, isZeroRat, type Expr, type Rat } from './expr.js'

const GREEK: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  epsilon: '\\epsilon',
  zeta: '\\zeta',
  eta: '\\eta',
  theta: '\\theta',
  iota: '\\iota',
  kappa: '\\kappa',
  lambda: '\\lambda',
  mu: '\\mu',
  nu: '\\nu',
  xi: '\\xi',
  omicron: 'o',
  rho: '\\rho',
  sigma: '\\sigma',
  tau: '\\tau',
  upsilon: '\\upsilon',
  phi: '\\phi',
  chi: '\\chi',
  psi: '\\psi',
  omega: '\\omega',
  pi: '\\pi',
}

/** 符号名 → LaTeX：希腊拼写转希腊字母；xA 形式转下标 x_A */
export function symNameToLatex(name: string): string {
  const greek = GREEK[name]
  if (greek !== undefined) return greek
  if (name.length > 1) {
    const m = /^([a-z])([A-Z]+)$/.exec(name)
    if (m !== null) return `${m[1]}_{${m[2]}}`
  }
  return name
}

function latexNum(r: Rat): string {
  if (isIntRat(r)) return `${r.n}`
  const abs = r.n < 0n ? -r.n : r.n
  return `\\frac{${abs}}{${r.d}}`
}

function ratToStr(r: Rat): string {
  return r.d === 1n ? `${r.n}` : `${r.n}/${r.d}`
}

/** 单因子打印（乘法语境，需要括号时加括号） */
function latexFactor(e: Expr): string {
  switch (e.kind) {
    case 'num':
      return latexNum(e.rat)
    case 'sym':
      return symNameToLatex(e.name)
    case 'add':
      return `\\left(${latexAdd(e)}\right)`
    case 'mul':
      return `\\left(${latexMul(e)}\right)`
    case 'pow':
      return latexPow(e)
    case 'sqrt':
      return latexSqrt(e)
    case 'fn':
      return latexFn(e)
  }
}

function latexPow(e: Extract<Expr, { kind: 'pow' }>): string {
  return `${latexFactor(e.base)}^{${ratToStr(e.exp)}}`
}

function latexSqrt(e: Extract<Expr, { kind: 'sqrt' }>): string {
  return `\\sqrt{${latexExpr(e.arg)}}`
}

function latexFn(e: Extract<Expr, { kind: 'fn' }>): string {
  const arg = latexExpr(e.arg)
  if (e.name === 'exp') return `e^{${arg}}`
  return `\\${e.name}${e.arg.kind === 'add' || e.arg.kind === 'mul' ? `\\left(${arg}\\right)` : `\\left(${arg}\\right)`}`
}

/** mul 打印：拆正幂（分子）与负幂（分母），生成 \frac 或直接式 */
function latexMul(e: Extract<Expr, { kind: 'mul' }>): string {
  const numerFactors: string[] = []
  const denomFactors: string[] = []
  for (const f of e.factors) {
    if (f.kind === 'pow' && f.exp.n < 0n) {
      const expAbs = -f.exp.n
      denomFactors.push(expAbs === 1n ? latexExpr(f.base) : `${latexExpr(f.base)}^{${expAbs}}`)
    } else {
      // 分式分子分母内不再加 \left(\right) 括号
      numerFactors.push(latexExpr(f))
    }
  }
  const coeff = e.coeff
  let sign = ''
  let absCoeff: Rat = coeff
  if (isNegRat(coeff)) {
    sign = '-'
    absCoeff = { n: -coeff.n, d: coeff.d }
  }
  const numerStr = `${numerFactors.join(' ')}`
  const denomStr = denomFactors.join(' ')

  // 分数系数并入分式：1/2·sqrt(2) → \frac{\sqrt{2}}{2}
  if (absCoeff.d !== 1n) {
    const top = `${absCoeff.n === 1n ? '' : absCoeff.n}${numerStr}`
    const bottom = `${absCoeff.d === 1n ? '' : absCoeff.d}${denomStr}`
    return `${sign}\\frac{${top === '' ? '1' : top}}{${bottom === '' ? '1' : bottom}}`
  }
  const coeffStr = absCoeff.n === 1n ? '' : `${absCoeff.n}`
  const head = `${coeffStr}${numerStr}`
  if (denomStr === '') return `${sign}${head === '' ? '1' : head}`
  return `${sign}\\frac{${head === '' ? '1' : head}}{${denomStr}}`
}

/** add 打印：负系数项排后，首项负号直接显示，后续项用 +/- 连接 */
function latexAdd(e: Extract<Expr, { kind: 'add' }>): string {
  // 数学惯例：负系数项放在正系数项之后（a - b 而非 -b + a）
  const ordered = [...e.terms].sort((a, b) => signedNeg(a) - signedNeg(b))
  const parts: string[] = []
  ordered.forEach((t, i) => {
    const s = latexSignedTerm(t)
    if (i === 0) {
      parts.push(s)
    } else if (s.startsWith('-')) {
      parts.push(` - ${s.slice(1)}`)
    } else {
      parts.push(` + ${s}`)
    }
  })
  return parts.join('')
}

function signedNeg(t: Expr): number {
  return t.kind === 'mul' && isNegRat(t.coeff) ? 1 : 0
}

/** 单项带符号打印：提取 mul 系数负号 */
function latexSignedTerm(t: Expr): string {
  if (t.kind === 'mul' && isNegRat(t.coeff)) {
    return `-${latexMul({ kind: 'mul', coeff: { n: -t.coeff.n, d: t.coeff.d }, factors: t.factors })}`
  }
  return latexExpr(t)
}

export function latex(e: Expr): string {
  return latexExpr(e)
}

function latexExpr(e: Expr): string {
  switch (e.kind) {
    case 'num':
      return latexNum(e.rat)
    case 'sym':
      return symNameToLatex(e.name)
    case 'add':
      return latexAdd(e)
    case 'mul':
      return latexMul(e)
    case 'pow':
      return latexPow(e)
    case 'sqrt':
      return latexSqrt(e)
    case 'fn':
      return latexFn(e)
  }
}

/** 生成 ``$$ ... $$`` 包裹的展示 LaTeX */
export function latexDisplay(e: Expr): string {
  return `$$ ${latex(e)} $$`
}

export { isZeroRat }

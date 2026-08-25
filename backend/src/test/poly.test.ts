// P2 测试：多项式运算 + 一元公式法求根

import { describe, expect, it } from 'vitest'
import { add, debugString, mul, rat, type Expr } from '../core/expr.js'
import { latex } from '../core/latex.js'
import { parse } from '../core/parse.js'
import {
  polyAdd,
  polyEq,
  polyEval,
  polyFromExpr,
  polyMul,
  polyPow,
  polySub,
  polyToString,
  solveLinear,
  solvePoly,
  solveQuadratic,
  type Poly,
  type SolveResult,
} from '../core/poly.js'

// 辅助：解析并转一元多项式（失败即报错）
function p(input: string): Poly {
  const poly = polyFromExpr(parse(input), 'x')
  if (poly === null) throw new Error(`无法转多项式: ${input}`)
  return poly
}

// 辅助：取求根结果中的根
function rootsOf(r: SolveResult): Expr[] {
  if (r.kind !== 'root') throw new Error(`期望求根结果，实际 ${r.kind}`)
  return r.roots
}

// 辅助：Expr → 浮点值（数值验证用）
function evalFloat(e: Expr): number {
  switch (e.kind) {
    case 'num':
      return Number(e.rat.n) / Number(e.rat.d)
    case 'sym':
      return e.name === 'pi' ? Math.PI : e.name === 'e' ? Math.E : NaN
    case 'add':
      return e.terms.reduce((s, t) => s + evalFloat(t), 0)
    case 'mul':
      return (Number(e.coeff.n) / Number(e.coeff.d)) * e.factors.reduce((s, f) => s * evalFloat(f), 1)
    case 'pow':
      return Math.pow(evalFloat(e.base), Number(e.exp.n) / Number(e.exp.d))
    case 'sqrt':
      return Math.sqrt(evalFloat(e.arg))
    case 'fn':
      return NaN
  }
}

// 辅助：多项式浮点求值（Horner）
function evalPolyFloat(poly: Poly, x: number): number {
  let acc = 0
  for (let i = poly.length - 1; i >= 0; i--) {
    acc = acc * x + Number(poly[i]!.n) / Number(poly[i]!.d)
  }
  return acc
}

// 断言一组根全部满足 p(x) = 0（数值验证）
function expectRootsSatisfy(poly: Poly, roots: Expr[]): void {
  for (const root of roots) {
    expect(Math.abs(evalPolyFloat(poly, evalFloat(root)))).toBeLessThan(1e-9)
  }
}

describe('polyFromExpr：表达式 → 多项式', () => {
  it('x^2 - 2x + 1', () => {
    expect(p('x^2 - 2x + 1')).toEqual([rat(1), rat(-2), rat(1)])
  })
  it('2x + 3', () => {
    expect(p('2x + 3')).toEqual([rat(3), rat(2)])
  })
  it('(x+1)(x-1) 展开为 x^2 - 1', () => {
    expect(p('(x+1)(x-1)')).toEqual([rat(-1), rat(0), rat(1)])
  })
  it('含分数系数：x^2 + x/2', () => {
    expect(p('x^2 + x/2')).toEqual([rat(0), rat(1, 2), rat(1)])
  })
  it('常量 5', () => {
    expect(p('5')).toEqual([rat(5)])
  })
  it('x^0 为 1', () => {
    expect(p('x^0')).toEqual([rat(1)])
  })
  it('x^2 - 4', () => {
    expect(p('x^2 - 4')).toEqual([rat(-4), rat(0), rat(1)])
  })
  it('零多项式', () => {
    expect(p('0')).toEqual([])
  })

  it('含其他符号（参数）→ null', () => {
    expect(polyFromExpr(parse('x + a'), 'x')).toBeNull()
  })
  it('含超越常数 e → null', () => {
    expect(polyFromExpr(parse('x + e'), 'x')).toBeNull()
  })
  it('sqrt → null', () => {
    expect(polyFromExpr(parse('sqrt(x)'), 'x')).toBeNull()
  })
  it('函数 → null', () => {
    expect(polyFromExpr(parse('sin(x)'), 'x')).toBeNull()
  })
  it('负幂 → null', () => {
    expect(polyFromExpr(parse('1/x'), 'x')).toBeNull()
  })
})

describe('多项式运算', () => {
  it('polyAdd', () => {
    expect(polyEq(polyAdd([rat(1), rat(2)], [rat(3), rat(4)]), [rat(4), rat(6)])).toBe(true)
  })
  it('polySub', () => {
    const a = [rat(1), rat(2)] as Poly
    const b = [rat(3), rat(4)] as Poly
    expect(polyToString(polySub(a, b))).toBe('-2x - 2')
  })
  it('polyMul 卷积：(1+x)(1-x) = 1 - x^2', () => {
    expect(polyToString(polyMul([rat(1), rat(1)], [rat(1), rat(-1)]))).toBe('-x^2 + 1')
  })
  it('polyPow', () => {
    expect(polyToString(polyPow([rat(1), rat(1)], 2))).toBe('x^2 + 2x + 1')
  })
  it('polyEval Horner', () => {
    // [1,2] = 1 + 2x，x = 3 → 7
    expect(polyEval([rat(1), rat(2)], rat(3))).toEqual(rat(7))
  })
  it('polyToString 降幂 + 负项', () => {
    expect(polyToString([rat(1), rat(-2), rat(1)])).toBe('x^2 - 2x + 1')
    expect(polyToString([rat(1, 2), rat(0), rat(1)])).toBe('x^2 + 1/2')
    expect(polyToString([])).toBe('0')
  })
})

describe('solveLinear 一次方程', () => {
  it('2x + 4 = 0 → -2', () => {
    expect(debugString(rootsOf(solveLinear(rat(2), rat(4)))[0]!)).toBe('-2')
  })
  it('0 = 0 恒等', () => {
    expect(solveLinear(rat(0), rat(0)).kind).toBe('identity')
  })
  it('0 = 3 矛盾', () => {
    expect(solveLinear(rat(0), rat(3)).kind).toBe('contradiction')
  })
})

describe('solveQuadratic 二次公式法', () => {
  it('x^2 - 4 = 0 → ±2（完全平方判别式）', () => {
    const roots = rootsOf(solveQuadratic(rat(1), rat(0), rat(-4)))
    expect(roots.map(debugString).sort()).toEqual(['-2', '2'])
  })
  it('2x^2 - 3x + 1 = 0 → 1 与 1/2（分数有理根）', () => {
    const roots = rootsOf(solveQuadratic(rat(2), rat(-3), rat(1)))
    expect(roots.map(debugString).sort()).toEqual(['1', '1/2'])
  })
  it('x^2 - 2x + 1 = 0 → 重根 1', () => {
    expect(debugString(rootsOf(solveQuadratic(rat(1), rat(-2), rat(1)))[0]!)).toBe('1')
  })
  it('x^2 + 1 = 0 → 无实数解', () => {
    expect(solveQuadratic(rat(1), rat(0), rat(1)).kind).toBe('noReal')
  })
  it('x^2 - 2 = 0 → ±√2（a + b√c 形式）', () => {
    const roots = rootsOf(solveQuadratic(rat(1), rat(0), rat(-2)))
    expect(roots.map(latex).sort()).toEqual(['-\\sqrt{2}', '\\sqrt{2}'])
  })
  it('x^2 - 2x - 1 = 0 → 1 ± √2（常数项排后）', () => {
    const roots = rootsOf(solveQuadratic(rat(1), rat(-2), rat(-1)))
    expect(roots.map(latex).sort()).toEqual(['1 - \\sqrt{2}', '\\sqrt{2} + 1'])
  })
  it('3x^2 - 2 = 0 → ±√6/3（分数系数带根号）', () => {
    const roots = rootsOf(solveQuadratic(rat(3), rat(0), rat(-2)))
    expect(roots.map(latex).sort()).toEqual(['-\\frac{\\sqrt{6}}{3}', '\\frac{\\sqrt{6}}{3}'])
  })
  it('x^2 - 6x + 7 = 0 → 3 ± √2（分子带系数）', () => {
    // Δ = 36 - 28 = 8 → sqrt(8) = 2√2，u = 3，v = 1
    const roots = rootsOf(solveQuadratic(rat(1), rat(-6), rat(7)))
    expect(roots.map(latex).sort()).toEqual(['3 - \\sqrt{2}', '\\sqrt{2} + 3'])
  })
})

describe('solvePoly 端到端', () => {
  it('x^2 - 2x - 1 = 0：回代验证 + LaTeX 输出', () => {
    const poly = p('x^2 - 2x - 1')
    const roots = rootsOf(solvePoly(poly))
    expect(roots.map(latex).sort()).toEqual(['1 - \\sqrt{2}', '\\sqrt{2} + 1'])
    expectRootsSatisfy(poly, roots)
  })
  it('2x^2 - 3x + 1 = 0：回代验证', () => {
    const poly = p('2x^2 - 3x + 1')
    const roots = rootsOf(solvePoly(poly))
    expectRootsSatisfy(poly, roots)
  })
  it('x^2 - 5 = 0：回代验证', () => {
    const poly = p('x^2 - 5')
    const roots = rootsOf(solvePoly(poly))
    expectRootsSatisfy(poly, roots)
  })
  it('x - 7 = 0：线性端到端', () => {
    const poly = p('x - 7')
    expect(debugString(rootsOf(solvePoly(poly))[0]!)).toBe('7')
  })
  it('0 = 0 恒等', () => {
    expect(solvePoly([]).kind).toBe('identity')
  })
  it('5 = 0 矛盾', () => {
    expect(solvePoly([rat(5)]).kind).toBe('contradiction')
  })
  it('x^3 + 1 = 0 → unsupported（三次以上留数值兜底）', () => {
    expect(solvePoly(p('x^3 + 1')).kind).toBe('unsupported')
  })
  it('x^2 + 2 = 0 → noReal', () => {
    expect(solvePoly(p('x^2 + 2')).kind).toBe('noReal')
  })
})

describe('根的表达一致性（add/mul 工厂配合）', () => {
  it('x^2 - 2x - 1 两根之和为 2（同类根式合并）', () => {
    const roots = rootsOf(solveQuadratic(rat(1), rat(-2), rat(-1)))
    expect(debugString(add(roots[0]!, roots[1]!))).toBe('2')
  })
  it('x^2 - 2 两根之和为 0', () => {
    const roots = rootsOf(solveQuadratic(rat(1), rat(0), rat(-2)))
    expect(debugString(add(roots[0]!, roots[1]!))).toBe('0')
  })
  it('x^2 - 2x - 1 两根之积为 -1（mul 保留根式结构，数值验证）', () => {
    const roots = rootsOf(solveQuadratic(rat(1), rat(-2), rat(-1)))
    // mul 不展开分配律，保留根式结构；数值上乘积应为 -1
    const prod = mul(roots[0]!, roots[1]!)
    expect(prod.kind).toBe('mul')
    expect(Math.abs(evalFloat(prod) - -1)).toBeLessThan(1e-9)
  })
})

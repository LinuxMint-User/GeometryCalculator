// P3 测试：方程组求解（线性 Gaussian + 代换 + 一元求根）

import { describe, expect, it } from 'vitest'
import { debugString, type Sign } from '../core/expr.js'
import { parse } from '../core/parse.js'
import {
  solveNumerically,
  solveSystem,
  substitute,
  toLinearEq,
  type SystemSolution,
  type SolveSystemResult,
} from '../core/solve.js'

const signs = (...pairs: Array<[string, Sign]>): Map<string, Sign> => new Map(pairs)

function sol(eqs: string[], vars: string[]): SolveSystemResult {
  return solveSystem(eqs.map((s) => parse(s)), vars)
}

/** 解转成 "var=expr" 的可比较形式 */
function dump(s: SystemSolution): string {
  return [...s.entries()].map(([k, v]) => `${k}=${debugString(v)}`).sort().join('; ')
}

describe('toLinearEq 多变量线性提取', () => {
  it('2x - 3y + 1 = 0', () => {
    const le = toLinearEq(parse('2x - 3y + 1'), new Set(['x', 'y']))
    expect(le).not.toBeNull()
    expect(le!.coeffs.get('x')).toEqual({ n: 2n, d: 1n })
    expect(le!.coeffs.get('y')).toEqual({ n: -3n, d: 1n })
    expect(le!.const).toEqual({ n: 1n, d: 1n })
  })
  it('x/2 - 1/3 = 0（分数系数）', () => {
    const le = toLinearEq(parse('x/2 - 1/3'), new Set(['x']))
    expect(le!.coeffs.get('x')).toEqual({ n: 1n, d: 2n })
    expect(le!.const).toEqual({ n: -1n, d: 3n })
  })
  it('x^2 非线性 → null', () => {
    expect(toLinearEq(parse('x^2'), new Set(['x']))).toBeNull()
  })
  it('xy 非线性 → null', () => {
    expect(toLinearEq(parse('xy'), new Set(['x', 'y']))).toBeNull()
  })
  it('x + e 非线性（e 不能进有理系数）→ null', () => {
    expect(toLinearEq(parse('x + e'), new Set(['x']))).toBeNull()
  })
  it('sqrt(x) 非线性 → null', () => {
    expect(toLinearEq(parse('sqrt(x)'), new Set(['x']))).toBeNull()
  })
})

describe('substitute 代换', () => {
  it('x^2 + x + 1 代入 x=2 → 7', () => {
    expect(debugString(substitute(parse('x^2 + x + 1'), 'x', parse('2')))).toBe('7')
  })
  it('x^2 + y 代入 x=3 → y + 9', () => {
    expect(debugString(substitute(parse('x^2 + y'), 'x', parse('3')))).toBe('y + 9')
  })
  it('嵌套替换 sqrt(x+1) 代入 x=3 → 2', () => {
    expect(debugString(substitute(parse('sqrt(x + 1)'), 'x', parse('3')))).toBe('2')
  })
})

describe('纯线性系统', () => {
  it('x + y = 3, x - y = 1 → x=2, y=1', () => {
    const r = sol(['x + y - 3', 'x - y - 1'], ['x', 'y'])
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') expect(dump(r.solutions[0]!)).toBe('x=2; y=1')
  })
  it('欠定：x + y = 3 → x = 3 - y', () => {
    const r = sol(['x + y - 3'], ['x', 'y'])
    expect(r.kind).toBe('solutions')
    // debugString 契约：系数显式、负项不后置（与 expr.test.ts 一致）
    if (r.kind === 'solutions') expect(dump(r.solutions[0]!)).toBe('x=-1*y + 3; y=y')
  })
  it('矛盾：x = 1, x = 2 → contradiction', () => {
    expect(sol(['x - 1', 'x - 2'], ['x']).kind).toBe('contradiction')
  })
  it('分数解：2x = 1 → x = 1/2', () => {
    const r = sol(['2x - 1'], ['x'])
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') expect(dump(r.solutions[0]!)).toBe('x=1/2')
  })
})

describe('线性 + 二次（代换消元）', () => {
  it('x + y = 3, x^2 + y^2 = 5 → (1,2) 与 (2,1)', () => {
    const r = sol(['x + y - 3', 'x^2 + y^2 - 5'], ['x', 'y'])
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') {
      const dumps = r.solutions.map(dump).sort()
      expect(dumps).toEqual(['x=1; y=2', 'x=2; y=1'])
    }
  })
  it('几何：B 到原点距离 5 且在 y = x + 1 上 → (-4,-3) 与 (3,4)', () => {
    const r = sol(['x^2 + y^2 - 25', 'y - x - 1'], ['x', 'y'])
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') {
      const dumps = r.solutions.map(dump).sort()
      expect(dumps).toEqual(['x=-4; y=-3', 'x=3; y=4'])
    }
  })
  it('平行四边形：AB = DC（A(0,0) B(2,0) D(1,3)）→ C(3,3)', () => {
    // 对边向量相等：(2,0) = (x_C - 1, y_C - 3)
    const r = sol(['x - 1 - 2', 'y - 3'], ['x', 'y'])
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') expect(dump(r.solutions[0]!)).toBe('x=3; y=3')
  })
  it('垂直/斜率：x_A + 2y_A = 0 且 x_A - y_A = 3 → (2, -1)', () => {
    const r = sol(['x + 2y', 'x - y - 3'], ['x', 'y'])
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') expect(dump(r.solutions[0]!)).toBe('x=2; y=-1')
  })
})

describe('符号假设筛根（P4 sign）', () => {
  it('a^2 = 4 且 a 为正 → 只留 a=2', () => {
    const r = solveSystem([parse('a^2 - 4')], ['a'], signs(['a', 'positive']))
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') {
      expect(r.solutions.map(dump)).toEqual(['a=2'])
    }
  })
  it('a^2 = 4 且 a 非正 → a=-2', () => {
    const r = solveSystem([parse('a^2 - 4')], ['a'], signs(['a', 'nonpositive']))
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') expect(r.solutions.map(dump)).toEqual(['a=-2'])
  })
  it('a^2 = 4 无假设 → ±2', () => {
    const r = sol(['a^2 - 4'], ['a'])
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') expect(r.solutions.map(dump).sort()).toEqual(['a=-2', 'a=2'])
  })
  it('线性变量也按 sign 筛：x = -3 且 x 为正 → 无解', () => {
    const r = solveSystem([parse('x + 3')], ['x'], signs(['x', 'positive']))
    expect(r.kind).toBe('contradiction')
  })
})

describe('边界情况', () => {
  it('含 sqrt 的方程 → unsupported（留给数值兜底）', () => {
    expect(sol(['sqrt(x) - 2'], ['x']).kind).toBe('unsupported')
  })
  it('多自由变量非线性 → unsupported', () => {
    expect(sol(['x^2 + y^2 - 1'], ['x', 'y']).kind).toBe('unsupported')
  })
  it('0 = 0 恒等 → solutions（自由变量）', () => {
    const r = sol(['0'], ['x'])
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') expect(dump(r.solutions[0]!)).toBe('x=x')
  })
  it('矛盾：x^2 + 2 = 0（无实数解）', () => {
    expect(sol(['x^2 + 2'], ['x']).kind).toBe('contradiction')
  })
})

describe('数值兜底 solveNumerically（P4 黄灯区）', () => {
  it('sqrt(x) - 2 → x ≈ 4（符号层 unsupported 后兜底）', () => {
    const r = solveNumerically([parse('sqrt(x) - 2')], ['x'])
    expect(r.kind).toBe('roots')
    if (r.kind === 'roots') {
      expect(r.roots.some((m) => Math.abs(m.get('x')! - 4) < 1e-6)).toBe(true)
    }
  })
  it('x^3 - 2 → x ≈ ∛2（三次无公式法）', () => {
    const r = solveNumerically([parse('x^3 - 2')], ['x'])
    expect(r.kind).toBe('roots')
    if (r.kind === 'roots') {
      expect(r.roots.some((m) => Math.abs(m.get('x')! - Math.cbrt(2)) < 1e-6)).toBe(true)
    }
  })
  it('x^2 + y^2 = 1, x = y → 两个解 ±(√2/2, √2/2)', () => {
    const r = solveNumerically([parse('x^2 + y^2 - 1'), parse('x - y')], ['x', 'y'])
    expect(r.kind).toBe('roots')
    if (r.kind === 'roots') {
      const s = Math.SQRT1_2
      expect(r.roots.some((m) => Math.abs(m.get('x')! - s) < 1e-6 && Math.abs(m.get('y')! - s) < 1e-6)).toBe(true)
      expect(r.roots.some((m) => Math.abs(m.get('x')! + s) < 1e-6 && Math.abs(m.get('y')! + s) < 1e-6)).toBe(true)
    }
  })
  it('sin(x) - 1/2 → 找到 π/6 或 5π/6', () => {
    const r = solveNumerically([parse('sin(x) - 1/2')], ['x'])
    expect(r.kind).toBe('roots')
    if (r.kind === 'roots') {
      const ok = r.roots.some((m) => {
        const x = m.get('x')!
        return Math.abs(x - Math.PI / 6) < 1e-4 || Math.abs(x - (5 * Math.PI) / 6) < 1e-4
      })
      expect(ok).toBe(true)
    }
  })
  it('无实数解（x^2 + 1）→ failed', () => {
    expect(solveNumerically([parse('x^2 + 1')], ['x']).kind).toBe('failed')
  })
})

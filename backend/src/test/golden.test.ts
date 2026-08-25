// 黄金测试集：按使用文档（frontend/doc/maintainer/guide.md）的几何语义构造典型场景，
// 回归验证「几何约束 → 方程 → 符号解 / 数值兜底」全链路。
// 这是与原版 SymPy 后端对照的验收基准：每个场景在 Python 版应得同样答案。

import { describe, expect, it } from 'vitest'
import { debugString } from '../core/expr.js'
import { parse } from '../core/parse.js'
import { solveNumerically, solveSystem, type SystemSolution } from '../core/solve.js'

/** 解转成 "var=expr" 的可比较形式 */
function dump(s: SystemSolution): string {
  return [...s.entries()].map(([k, v]) => `${k}=${debugString(v)}`).sort().join('; ')
}

/** 符号求解并返回第一个解的 dump（期望恰好一个解时用） */
function symOne(eqs: string[], vars: string[]): string {
  const r = solveSystem(eqs.map((s) => parse(s)), vars)
  expect(r.kind).toBe('solutions')
  if (r.kind !== 'solutions') return ''
  expect(r.solutions).toHaveLength(1)
  return dump(r.solutions[0]!)
}

describe('黄金测试集：解析几何（初高中典型）', () => {
  it('斜率/截距：直线过 A(0,1)、B(2,5)，求 y = kx + b', () => {
    // b = 1（A 在直线上）；5 = 2k + b（B 在直线上）
    expect(symOne(['b - 1', '2k + b - 5'], ['k', 'b'])).toBe('b=1; k=2')
  })

  it('两直线交点：y = 2x + 1 与 y = -x + 4 → (1, 3)', () => {
    expect(symOne(['y - 2x - 1', 'y + x - 4'], ['x', 'y'])).toBe('x=1; y=3')
  })

  it('点到直线距离：x² + y² = 25 上且 3x + 4y = 25 的点 → 切点 (3, 4)', () => {
    // 圆心 (0,0) 半径 5；直线 3x + 4y = 25 与圆相切
    expect(symOne(['x^2 + y^2 - 25', '3x + 4y - 25'], ['x', 'y'])).toBe('x=3; y=4')
  })

  it('垂直斜率：l₁ 斜率 2，l₂ ⊥ l₁ → m·n = -1 得 m = -1/2', () => {
    // n = 2（l₁ 斜率）；m·n = -1（两直线垂直）
    expect(symOne(['n - 2', 'm*n + 1'], ['m', 'n'])).toBe('m=-1/2; n=2')
  })

  it('平行四边形：A(0,0) B(2,0) D(1,3)，对边向量相等 → C(3, 3)', () => {
    expect(symOne(['x - 1 - 2', 'y - 3'], ['x', 'y'])).toBe('x=3; y=3')
  })

  it('重心：三角形 A(0,0) B(4,0) C(0,6) 中线交点 → (4/3, 2)', () => {
    // 中线 AM₁（M₁ 为 BC 中点 (2,3)）：y = 3x/2；中线 BM₂（M₂ 为 AC 中点 (0,3)）：y = -3x/4 + 3
    expect(symOne(['2y - 3x', '4y + 3x - 12'], ['x', 'y'])).toBe('x=4/3; y=2')
  })

  it('直角三角形勾股：斜边 5、一直角边 3 → 另一直角边 ±4', () => {
    const r = solveSystem([parse('a^2 + 9 - 25')], ['a'])
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') expect(r.solutions.map(dump).sort()).toEqual(['a=-4', 'a=4'])
  })

  it('数值兜底：x³ = 2 → x ≈ ∛2（三次无公式法）', () => {
    const r = solveNumerically([parse('x^3 - 2')], ['x'])
    expect(r.kind).toBe('roots')
    if (r.kind === 'roots') {
      expect(r.roots.some((m) => Math.abs(m.get('x')! - Math.cbrt(2)) < 1e-6)).toBe(true)
    }
  })

  it('数值兜底：sin(x) = 1/2 → x ≈ π/6 或 5π/6', () => {
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

  it('sign 假设筛根：勾股腿为正 → 只留 a = 4', () => {
    const r = solveSystem([parse('a^2 + 9 - 25')], ['a'], new Map([['a', 'positive']]))
    expect(r.kind).toBe('solutions')
    if (r.kind === 'solutions') expect(r.solutions.map(dump)).toEqual(['a=4'])
  })
})

// P4 测试：数值兜底（一元求根 / 多维牛顿 / 数值积分 / sign 筛根）

import { describe, expect, it } from 'vitest'
import { num } from '../core/expr.js'
import { parse } from '../core/parse.js'
import {
  bisect,
  evalFloat,
  exprToFunction,
  findRoots,
  gaussLegendre,
  matchesSign,
  multiNewton,
  newton,
  simpson,
} from '../core/numeric.js'

const sqrt2 = Math.SQRT2

describe('evalFloat / exprToFunction', () => {
  it('evalFloat：1/2 + sqrt(2)', () => {
    expect(Math.abs(evalFloat(parse('1/2 + sqrt(2)')) - (0.5 + sqrt2))).toBeLessThan(1e-12)
  })
  it('evalFloat：sin(pi/2) = 1', () => {
    expect(Math.abs(evalFloat(parse('sin(pi/2)')) - 1)).toBeLessThan(1e-12)
  })
  it('exprToFunction：x^2 - 2 在 √2 处为 0', () => {
    const f = exprToFunction(parse('x^2 - 2'), 'x')
    expect(Math.abs(f(sqrt2))).toBeLessThan(1e-12)
    expect(f(0)).toBe(-2)
  })
  it('exprToFunction：含未定符号返回 NaN', () => {
    const f = exprToFunction(parse('x + a'), 'x')
    expect(Number.isNaN(f(1))).toBe(true)
  })
})

describe('一元求根', () => {
  it('bisect：x^2 - 2 在 [1,2] → √2', () => {
    const r = bisect((x) => x * x - 2, 1, 2)
    expect(Math.abs(r - sqrt2)).toBeLessThan(1e-9)
  })
  it('newton：x^2 - 2 从 x0=1 → √2', () => {
    const r = newton((x) => x * x - 2, (x) => 2 * x, 1)
    expect(r).not.toBeNull()
    expect(Math.abs(r! - sqrt2)).toBeLessThan(1e-9)
  })
  it('findRoots：x^2 - 2 自动找 ±√2', () => {
    const r = findRoots(exprToFunction(parse('x^2 - 2'), 'x'), { a: -10, b: 10 })
    expect(r.length).toBe(2)
    expect(Math.abs(Math.abs(r[0]!) - sqrt2)).toBeLessThan(1e-6)
    expect(Math.abs(Math.abs(r[1]!) - sqrt2)).toBeLessThan(1e-6)
  })
  it('findRoots：sin(x) 在 [-10,10] 找 k·π', () => {
    const r = findRoots(Math.sin, { a: -10, b: 10 })
    // -3π, -2π, -π, 0, π, 2π, 3π
    expect(r.length).toBeGreaterThanOrEqual(7)
    const zero = r.find((x) => Math.abs(x) < 1e-6)
    expect(zero).toBeDefined()
    for (let k = -3; k <= 3; k++) {
      const found = r.some((x) => Math.abs(x - k * Math.PI) < 1e-6)
      expect(found).toBe(true)
    }
  })
})

describe('多维牛顿', () => {
  it('x^2 + y^2 = 4, x - y = 0 → (√2, √2)', () => {
    const F = (p: number[]): number[] => [p[0]! * p[0]! + p[1]! * p[1]! - 4, p[0]! - p[1]!]
    const r = multiNewton(F, [1, 1])
    expect(r).not.toBeNull()
    expect(Math.abs(r![0]! - sqrt2)).toBeLessThan(1e-8)
    expect(Math.abs(r![1]! - sqrt2)).toBeLessThan(1e-8)
  })
  it('从另一侧初值 → (-√2, -√2)', () => {
    const F = (p: number[]): number[] => [p[0]! * p[0]! + p[1]! * p[1]! - 4, p[0]! - p[1]!]
    const r = multiNewton(F, [-1, -1])
    expect(r).not.toBeNull()
    expect(Math.abs(r![0]! + sqrt2)).toBeLessThan(1e-8)
  })
})

describe('数值积分', () => {
  it('simpson：∫₀¹ x² dx = 1/3', () => {
    expect(Math.abs(simpson((x) => x * x, 0, 1) - 1 / 3)).toBeLessThan(1e-9)
  })
  it('simpson：∫₀^π sin(x) dx = 2', () => {
    // n=100 复合辛普森对 sin 的理论误差约 2e-8
    expect(Math.abs(simpson(Math.sin, 0, Math.PI) - 2)).toBeLessThan(1e-6)
  })
  it('gaussLegendre：∫₀¹ x² dx = 1/3（16 点对二次多项式精确）', () => {
    expect(Math.abs(gaussLegendre((x) => x * x, 0, 1) - 1 / 3)).toBeLessThan(1e-12)
  })
  it('gaussLegendre：∫₀^π sin(x) dx = 2', () => {
    expect(Math.abs(gaussLegendre(Math.sin, 0, Math.PI) - 2)).toBeLessThan(1e-9)
  })
})

describe('matchesSign 符号假设', () => {
  it('正/非负/负/非正/非零', () => {
    expect(matchesSign(num(2), 'positive')).toBe(true)
    expect(matchesSign(num(-2), 'positive')).toBe(false)
    expect(matchesSign(num(0), 'nonnegative')).toBe(true)
    expect(matchesSign(num(-2), 'nonpositive')).toBe(true)
    expect(matchesSign(num(0), 'nonzero')).toBe(false)
    expect(matchesSign(num(3), 'nonzero')).toBe(true)
  })
  it('根式根：√2 为正', () => {
    expect(matchesSign(parse('sqrt(2)'), 'positive')).toBe(true)
    expect(matchesSign(parse('-sqrt(2)'), 'positive')).toBe(false)
  })
})

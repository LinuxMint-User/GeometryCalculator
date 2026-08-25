import { describe, expect, it } from 'vitest'

import { parse, ParseError } from '../core/parse.js'
import { simplify } from '../core/simplify.js'
import { debugString, num, pow, rat, sqrt, sym } from '../core/expr.js'
import { latex } from '../core/latex.js'

/** 解析 + 化简 + debug 字符串，用于断言 */
function dbg(input: string): string {
  return debugString(simplify(parse(input)))
}

describe('解析与化简（代数）', () => {
  it('合并同类项：2x + 3x = 5x', () => {
    expect(dbg('2x + 3x')).toBe('5*x')
  })

  it('常量合并：1/3 + 1/6 = 1/2', () => {
    expect(dbg('1/3 + 1/6')).toBe('1/2')
  })

  it('同底幂合并：x^2 * x^3 = x^5', () => {
    expect(dbg('x^2 * x^3')).toBe('x^5')
  })

  it('x - x = 0', () => {
    expect(dbg('x - x')).toBe('0')
  })

  it('2/4 约分为 1/2', () => {
    expect(dbg('2/4')).toBe('1/2')
  })

  it('小数转分数：0.5 = 1/2', () => {
    expect(dbg('0.5')).toBe('1/2')
  })

  it('x^0 = 1、x^1 = x', () => {
    expect(dbg('x^0')).toBe('1')
    expect(dbg('x^1')).toBe('x')
  })

  it('幂右结合：2^3^2 = 512', () => {
    expect(dbg('2^3^2')).toBe('512')
  })

  it('隐式乘法：2(x+1) 不展开为乘法结构', () => {
    const e = simplify(parse('2(x+1)'))
    expect(e.kind).toBe('mul')
  })

  it('系数负号：-x + 2', () => {
    expect(dbg('-x + 2')).toBe('-1*x + 2')
  })

  it('多项式乘法暂不展开（P1 约定）', () => {
    const e = simplify(parse('(a+b)(a-b)'))
    expect(e.kind).toBe('mul')
  })
})

describe('sqrt 化简（平方因子提取）', () => {
  it('sqrt(12) = 2·sqrt(3)', () => {
    expect(dbg('sqrt(12)')).toBe('2*sqrt(3)')
  })

  it('sqrt(8) = 2·sqrt(2)', () => {
    expect(dbg('sqrt(8)')).toBe('2*sqrt(2)')
  })

  it('sqrt(4) = 2', () => {
    expect(dbg('sqrt(4)')).toBe('2')
  })

  it('sqrt(2)/2 保持', () => {
    expect(dbg('sqrt(2)/2')).toBe('1/2*sqrt(2)')
  })
})

describe('初等函数精确值', () => {
  it('sin(pi/6) = 1/2', () => {
    expect(dbg('sin(pi/6)')).toBe('1/2')
  })

  it('cos(pi/3) = 1/2', () => {
    expect(dbg('cos(pi/3)')).toBe('1/2')
  })

  it('sin(pi/4) = sqrt(2)/2', () => {
    expect(dbg('sin(pi/4)')).toBe('1/2*sqrt(2)')
  })

  it('tan(pi/4) = 1', () => {
    expect(dbg('tan(pi/4)')).toBe('1')
  })

  it('sin(pi) = 0（周期归约）', () => {
    expect(dbg('sin(pi)')).toBe('0')
  })

  it('sin(0) = 0', () => {
    expect(dbg('sin(0)')).toBe('0')
  })

  it('exp(0) = 1、ln(e) = 1', () => {
    expect(dbg('exp(0)')).toBe('1')
    expect(dbg('ln(e)')).toBe('1')
  })

  it('sin(2) 保留（非特殊点不做精确求值）', () => {
    expect(dbg('sin(2)')).toBe('sin(2)')
  })
})

describe('错误输入', () => {
  it('表达式不完整抛错', () => {
    expect(() => parse('x +')).toThrow(ParseError)
  })

  it('缺少右括号抛错', () => {
    expect(() => parse('(x+1')).toThrow(ParseError)
  })

  it('非法字符抛错', () => {
    expect(() => parse('x!')).toThrow(ParseError)
  })

  it('非整数指数抛错', () => {
    expect(() => parse('x^1.5')).toThrow(ParseError)
  })
})

describe('LaTeX 打印', () => {
  it('2x + 3', () => {
    expect(latex(parse('2x + 3'))).toBe('2x + 3')
  })

  it('分数：1/2', () => {
    expect(latex(parse('1/2'))).toBe('\\frac{1}{2}')
  })

  it('分式：(x+1)/(x-1)', () => {
    expect(latex(parse('(x+1)/(x-1)'))).toBe('\\frac{x + 1}{x - 1}')
  })

  it('sqrt(2)/2', () => {
    expect(latex(parse('sqrt(2)/2'))).toBe('\\frac{\\sqrt{2}}{2}')
  })

  it('希腊字母与常数', () => {
    expect(latex(parse('pi'))).toBe('\\pi')
    expect(latex(parse('theta'))).toBe('\\theta')
  })

  it('下标符号 xA → x_{A}', () => {
    expect(latex(sym('xA'))).toBe('x_{A}')
  })

  it('函数', () => {
    expect(latex(parse('sin(x)'))).toBe('\\sin\\left(x\\right)')
    expect(latex(parse('exp(x)'))).toBe('e^{x}')
  })

  it('x^2', () => {
    expect(latex(parse('x^2'))).toBe('x^{2}')
  })

  it('负项：a - b', () => {
    expect(latex(parse('a - b'))).toBe('a - b')
  })
})

describe('工厂节点直接构造', () => {
  it('sqrt 工厂提取平方因子', () => {
    expect(debugString(sqrt(num(12)))).toBe('2*sqrt(3)')
  })

  it('pow 工厂整数幂', () => {
    expect(debugString(pow(num(2), rat(3)))).toBe('8')
  })
})

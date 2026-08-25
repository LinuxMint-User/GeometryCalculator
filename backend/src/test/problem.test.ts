// gc 层测试：数学对象 / 表达式记号 / 条件生成 / 求解主流程 / 依赖与恢复
// 场景对齐 frontend/doc/maintainer/guide.md 例题与 Python 原版行为

import { describe, expect, it } from 'vitest'
import { Problem } from '../core/gc.js'

function newP(): Problem {
  return new Problem()
}

describe('未知数', () => {
  it('添加与取值', () => {
    const p = newP()
    p.addSymbol('a')
    p.addSymbol('alpha', { negative: false, zero: false, positive: true })
    expect(p.getSymbolNames()).toEqual(['a', 'alpha'])
    const latex = p.getSymbolsLatex()
    expect(latex.length).toBe(2)
    // 默认 R：id 即符号名（删除下拉 / 校验直接用）
    expect(latex[0]).toMatchObject({ id: 'a', latex: 'a \\in \\mathbb{R}' })
    // positive → (0, +∞)
    expect(latex[1]!.id).toBe('alpha')
    expect(latex[1]!.latex).toContain('\\in (0, +\\infty)')
  })

  it('同取值范围的符号各自一条', () => {
    const p = newP()
    p.addSymbol('a', { negative: false, zero: true, positive: true })
    p.addSymbol('b', { negative: false, zero: true, positive: true })
    const latex = p.getSymbolsLatex()
    expect(latex.length).toBe(2)
    expect(latex[0]).toMatchObject({ id: 'a' })
    expect(latex[1]).toMatchObject({ id: 'b' })
  })

  it('非法符号名与重复名由前端校验，这里只负责查表', () => {
    const p = newP()
    p.addSymbol('a')
    expect(() => p.addExprEq('a', 'z')).toThrow('未定义的符号 z')
    expect(() => p.solve('q')).toThrow('未定义的符号 q')
  })
})

describe('点', () => {
  it('直接给坐标', () => {
    const p = newP()
    p.addPoint('A', '1', '2', '', '')
    const pts = p.getPointsLatex()
    expect(pts).toEqual([{ id: 'A', latex: 'A \\left( 1, 2 \\right)' }])
  })

  it('坐标含表达式与符号', () => {
    const p = newP()
    p.addSymbol('a')
    p.addPoint('A', '2a', 'a + 1', '', '')
    expect(p.getPointsLatex()[0]!.latex).toContain('\\left( 2a, a + 1 \\right)')
  })

  it('x / y 占位创建未知数', () => {
    const p = newP()
    p.addPoint('B', 'x', 'y', '', '')
    expect(p.getSymbolNames()).toEqual(['x_B', 'y_B'])
  })

  it('两直线交点', () => {
    const p = newP()
    p.addPoint('A', '0', '0', '', '')
    p.addPoint('B', '2', '2', '', '')
    p.addPoint('C', '0', '2', '', '')
    p.addPoint('D', '2', '0', '', '')
    p.addPoint('P', '', '', 'AB', 'CD')
    expect(p.getPointsLatex()[4]!.latex).toContain('P \\left( 1, 1 \\right)')
  })

  it('约束不足报错且回滚自动创建的未知数', () => {
    const p = newP()
    p.addPoint('A', '0', '0', '', '')
    p.addPoint('B', '2', '2', '', '')
    // 只有一个 x 坐标约束，无法唯一确定 y → 报错并回滚 x_C
    expect(() => p.addPoint('C', 'x', '', '', '')).toThrow()
    expect(p.getSymbolNames()).toEqual([]) // x_C 已回滚
    expect(p.getPointNames()).toEqual(['A', 'B'])
  })
})

describe('条件', () => {
  it('表达式相等', () => {
    const p = newP()
    p.addSymbol('a')
    p.addExprEq('2a', '6')
    const conds = p.getCondsLatex()
    expect(conds.length).toBe(1)
    expect(conds[0]!.id).toBe('2a = 6')
  })

  it('恒等与矛盾', () => {
    const p = newP()
    p.addSymbol('a')
    expect(() => p.addExprEq('a', 'a')).toThrow('该条件一定成立')
    expect(() => p.addExprEq('1', '2')).toThrow('该条件不可能成立')
  })

  it('平行与垂直（一般式系数）', () => {
    const p = newP()
    p.addPoint('A', '0', '0', '', '')
    p.addPoint('B', '1', '0', '', '') // AB 水平
    p.addPoint('C', '0', '1', '', '')
    p.addPoint('D', '0', '2', '', '') // CD 竖直
    p.addPoint('E', '1', '1', '', '')
    p.addPoint('F', '1', '2', '', '') // EF 竖直
    // 两条竖直线平行恒成立 → 报"一定成立"
    expect(() => p.addParallel('CD', 'EF')).toThrow('该条件一定成立')
    // 符号点 P：AP ∥ AB 与 AP ⊥ AB 都是非平凡约束
    p.addPoint('P', 'x', 'y', '', '')
    p.addParallel('AP', 'AB')
    p.addPerp('AP', 'AB')
    expect(p.getCondIds()).toEqual(['AP \\parallel AB', 'AP \\perp AB'])
  })

  it('全等 / 相似', () => {
    const p = newP()
    p.addPoint('A', '0', '0', '', '')
    p.addPoint('B', '3', '0', '', '')
    p.addPoint('C', '0', '4', '', '')
    p.addPoint('D', '0', '0', '', '')
    p.addPoint('E', '3', '0', '', '')
    p.addPoint('F', '0', '4', '', '')
    // 完全相同的三角形：全等恒成立 → 报"一定成立"
    expect(() => p.addCong('ABC', 'DEF')).toThrow('该条件一定成立')
    // 符号点构造非平凡全等约束（IG = CA 恒等被跳过）
    p.addPoint('G', '0', '0', '', '')
    p.addPoint('H', 'x', 'y', '', '')
    p.addPoint('I', '0', '4', '', '')
    p.addCong('ABC', 'GHI')
    const cond = p.getCondsLatex()[0]!
    expect(cond.id).toBe('\\triangle ABC \\cong \\triangle GHI')
    p.addSim('ABC', 'GHI')
    expect(p.getCondIds().length).toBe(2)
  })

  it('平行四边形 / 菱形 / 矩形 / 正方形 / 等边三角形', () => {
    const p = newP()
    // 顶点含符号坐标，约束非平凡
    p.addPoint('A', '0', '0', '', '')
    p.addPoint('B', 'x', 'y', '', '')
    p.addPoint('C', '2', '0', '', '')
    p.addPoint('D', '2', '1', '', '')
    p.addParallelogram('ABCD')
    expect(p.getCondIds()).toEqual(['平行四边形 ABCD'])
    p.addRhombus('ABCD')
    p.addRect('ABCD')
    p.addSquare('ABCD')
    p.addEquilateralTriangle('ABC')
    expect(p.getCondIds().length).toBe(5)
  })
})

describe('表达式记号', () => {
  it('向量点乘与下标', () => {
    const p = newP()
    p.addPoint('A', '0', '0', '', '')
    p.addPoint('B', '2', '0', '', '')
    p.addPoint('C', '0', '2', '', '')
    p.addPoint('D', '2', '2', '', '')
    expect(p.solve('vecAB dot vecCD')).toEqual(['\\overrightarrow{AB} \\cdot \\overrightarrow{CD} = 4'])
    expect(p.solve('vecAB[0]')).toEqual(['\\overrightarrow{AB}_{0} = 2'])
  })

  it('裸向量报错', () => {
    const p = newP()
    p.addPoint('A', '0', '0', '', '')
    p.addPoint('B', '2', '0', '', '')
    expect(() => p.solve('vecAB')).toThrow('向量必须配合 dot 点乘')
  })
})

describe('solve 主流程', () => {
  it('斜率', () => {
    const p = newP()
    p.addPoint('A', '1', '2', '', '')
    p.addPoint('B', '3', '6', '', '')
    expect(p.solve('kAB')).toEqual(['k_{AB} = 2'])
  })

  it('线段长度', () => {
    const p = newP()
    p.addPoint('A', '0', '0', '', '')
    p.addPoint('B', '3', '4', '', '')
    expect(p.solve('AB')).toEqual(['AB = 5'])
  })

  it('点到直线距离', () => {
    const p = newP()
    p.addPoint('A', '3', '4', '', '')
    p.addPoint('B', '0', '0', '', '')
    p.addPoint('C', '5', '0', '', '')
    expect(p.solve('dAtBC')).toEqual(['d_{A 到 BC} = 4'])
  })

  it('勾股：符号假设筛根', () => {
    const p = newP()
    p.addSymbol('a', { negative: false, zero: false, positive: true })
    p.addExprEq('a^2', '16')
    expect(p.solve('a')).toEqual(['a = 4'])
  })

  it('勾股：无假设给全部解', () => {
    const p = newP()
    p.addSymbol('b')
    p.addExprEq('b^2', '16')
    const res = p.solve('b')
    expect(res).toContain('b = 4')
    expect(res).toContain('b = -4')
  })

  it('三次以上转数值兜底并标注近似', () => {
    const p = newP()
    p.addSymbol('a')
    p.addExprEq('a^3', '2')
    const res = p.solve('a')
    expect(res.length).toBe(1)
    expect(res[0]!.startsWith('a \\approx 1.2599')).toBe(true)
  })

  it('角度（acos）与数值兜底', () => {
    const p = newP()
    p.addPoint('A', '1', '0', '', '')
    p.addPoint('B', '0', '0', '', '')
    p.addPoint('C', '0', '1', '', '')
    // ∠B = 90° → acos(0) = π/2
    expect(p.solve('angABC')).toEqual(['\\angle ABC = \\frac{\\pi}{2}'])
  })

  it('非线性方程组转数值兜底', () => {
    const p = newP()
    p.addSymbol('a')
    p.addSymbol('b')
    p.addExprEq('sin(a) + b', '1')
    p.addExprEq('b', '1/2')
    const res = p.solve('a')
    expect(res.length).toBeGreaterThan(0)
    expect(res[0]!.includes('\\approx')).toBe(true)
  })
})

describe('依赖与删除', () => {
  it('条件依赖点，删除时级联', () => {
    const p = newP()
    p.addPoint('A', '0', '0', '', '')
    p.addPoint('B', 'x', 'y', '', '')
    p.addExprEq('kAB', '0')
    const deps = p.getDeeplyRequiredBy('A')
    expect(deps).toContain('k_{AB} = 0')
    p.delObjs(['A', ...deps])
    expect(p.getPointNames()).toEqual(['B'])
    expect(p.getCondIds()).toEqual([])
  })

  it('点与自动创建的未知数互相依赖', () => {
    const p = newP()
    p.addPoint('B', 'x', 'y', '', '')
    expect(p.getDeeplyRequiredBy('B')).toContain('x_B')
    expect(p.getDeeplyRequiredBy('x_B')).toContain('B')
  })

  it('删除未知数后其余对象不受影响', () => {
    const p = newP()
    p.addSymbol('a')
    p.addSymbol('b')
    p.delObjs(['a'])
    expect(p.getSymbolNames()).toEqual(['b'])
  })
})

describe('历史保存 / 恢复', () => {
  it('重放操作可还原状态', () => {
    const p = newP()
    p.addSymbol('a', { negative: false, zero: false, positive: true })
    p.addPoint('A', '0', '0', '', '')
    p.addPoint('B', 'x', 'y', '', '') // 自动创建的 x_B / y_B 随 addPoint 一并重放
    p.addExprEq('a', '3')
    const q = newP()
    q.restoreHistory(p.exportHistory())
    expect(q.getSymbolNames()).toEqual(['a', 'x_B', 'y_B'])
    expect(q.getPointNames()).toEqual(['A', 'B'])
    expect(q.getCondIds()).toEqual(['a = 3'])
    expect(q.solve('a')).toEqual(['a = 3'])
  })
})

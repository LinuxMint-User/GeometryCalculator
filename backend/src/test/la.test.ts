// 线性代数测试：行列式（Bareiss）与求逆（Gauss-Jordan），精确有理数

import { describe, expect, it } from 'vitest'
import { mulRat, rat, type Rat } from '../core/expr.js'
import { matDet, matInvert } from '../core/la.js'

/** 数字数组 → Rat 矩阵 */
function m(rows: number[][]): Rat[][] {
  return rows.map((row) => row.map((v) => rat(v)))
}

describe('行列式 matDet', () => {
  it('2x2：[[1,2],[3,4]] → -2', () => {
    expect(matDet(m([[1, 2], [3, 4]]))).toEqual({ n: -2n, d: 1n })
  })
  it('3x3：[[1,2,3],[0,1,4],[5,6,0]] → 1', () => {
    expect(matDet(m([[1, 2, 3], [0, 1, 4], [5, 6, 0]]))).toEqual({ n: 1n, d: 1n })
  })
  it('奇异 → 0', () => {
    expect(matDet(m([[1, 2], [2, 4]]))).toEqual({ n: 0n, d: 1n })
  })
  it('分数元素：[[1/2, 1/3],[1/4, 1/5]] → 1/10 - 1/12 = 1/60', () => {
    const a: Rat[][] = [
      [rat(1, 2), rat(1, 3)],
      [rat(1, 4), rat(1, 5)],
    ]
    expect(matDet(a)).toEqual({ n: 1n, d: 60n })
  })
  it('非方阵 → null', () => {
    expect(matDet(m([[1, 2, 3], [4, 5, 6]]))).toBeNull()
  })
})

describe('求逆 matInvert', () => {
  it('2x2：[[4,7],[2,6]] 的逆为 [[3/5, -7/10],[-1/5, 2/5]]', () => {
    const inv = matInvert(m([[4, 7], [2, 6]]))!
    expect(inv).toEqual([
      [rat(3, 5), rat(-7, 10)],
      [rat(-1, 5), rat(2, 5)],
    ])
  })
  it('A·A⁻¹ = I（2x2）', () => {
    const a = m([[4, 7], [2, 6]])
    const inv = matInvert(a)!
    const id = matMul(a, inv)
    expect(id).toEqual([
      [rat(1), rat(0)],
      [rat(0), rat(1)],
    ])
  })
  it('3x3 可逆且 A·A⁻¹ = I', () => {
    const a = m([[1, 2, 3], [0, 1, 4], [5, 6, 0]])
    const inv = matInvert(a)!
    const id = matMul(a, inv)
    expect(id).toEqual([
      [rat(1), rat(0), rat(0)],
      [rat(0), rat(1), rat(0)],
      [rat(0), rat(0), rat(1)],
    ])
  })
  it('奇异 → null', () => {
    expect(matInvert(m([[1, 2], [2, 4]]))).toBeNull()
  })
  it('非方阵 → null', () => {
    expect(matInvert(m([[1, 2], [3, 4], [5, 6]]))).toBeNull()
  })
})

/** 矩阵乘法（测试辅助，Rat 直接乘加不求最简） */
function matMul(a: Rat[][], b: Rat[][]): Rat[][] {
  const n = a.length
  const out: Rat[][] = []
  for (let i = 0; i < n; i++) {
    const row: Rat[] = []
    for (let j = 0; j < n; j++) {
      let acc: Rat = { n: 0n, d: 1n }
      for (let k = 0; k < n; k++) {
        acc = addRatLocal(acc, mulRat(a[i]![k]!, b[k]![j]!))
      }
      row.push(rat(acc.n, acc.d)) // 规范化（约分、分母为正）
    }
    out.push(row)
  }
  return out
}

function addRatLocal(x: Rat, y: Rat): Rat {
  return { n: x.n * y.d + y.n * x.d, d: x.d * y.d }
}

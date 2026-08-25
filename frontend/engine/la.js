// 线性代数（矩阵）：精确有理数实现
// 行列式用 Bareiss 算法（中间除法精确整除，避免分数膨胀），求逆用 Gauss-Jordan 消元。
// 矩阵元素必须是具体数字（Rat）；含符号参数的矩阵不在支持范围（红灯区：报错转 null）。
import { divRat, isZeroRat, mulRat, negRat, subRat } from './expr.js';
/** 是否方阵 */
function isSquare(m) {
    return m.length > 0 && m.every((row) => row.length === m.length);
}
/**
 * 方阵行列式（Bareiss 算法，O(n³)）。
 * 非方阵返回 null；奇异地返回 0。
 */
export function matDet(m) {
    if (m.length === 0)
        return { n: 1n, d: 1n }; // 空矩阵行列式为 1
    if (!isSquare(m))
        return null;
    const n = m.length;
    const a = m.map((row) => [...row]);
    let sign = 1n;
    let prev = { n: 1n, d: 1n };
    for (let k = 0; k < n - 1; k++) {
        // 列主元：当前主元为 0 时向下找非零行交换
        if (isZeroRat(a[k][k])) {
            let pr = -1;
            for (let r = k + 1; r < n; r++) {
                if (!isZeroRat(a[r][k])) {
                    pr = r;
                    break;
                }
            }
            if (pr === -1)
                return { n: 0n, d: 1n } // 奇异
                ;
            [a[k], a[pr]] = [a[pr], a[k]];
            sign = -sign;
        }
        const piv = a[k][k];
        for (let i = k + 1; i < n; i++) {
            for (let j = k + 1; j < n; j++) {
                const num = subRat(mulRat(a[i][j], piv), mulRat(a[i][k], a[k][j]));
                a[i][j] = divRat(num, prev);
            }
        }
        prev = piv;
    }
    const det = a[n - 1][n - 1];
    return sign === 1n ? det : negRat(det);
}
/**
 * 方阵求逆（Gauss-Jordan，增广单位阵）。
 * 非方阵或奇异返回 null。
 */
export function matInvert(m) {
    if (m.length === 0)
        return [];
    if (!isSquare(m))
        return null;
    const n = m.length;
    const one = { n: 1n, d: 1n };
    const zero = { n: 0n, d: 1n };
    // 增广 [A | I]
    const aug = m.map((row, i) => [
        ...row,
        ...new Array(n).fill(zero).map((_, j) => (i === j ? one : zero)),
    ]);
    for (let col = 0; col < n; col++) {
        // 找非零主元行
        let pr = -1;
        for (let r = col; r < n; r++) {
            if (!isZeroRat(aug[r][col])) {
                pr = r;
                break;
            }
        }
        if (pr === -1)
            return null // 奇异
            ;
        [aug[col], aug[pr]] = [aug[pr], aug[col]];
        // 归一化主元行
        const piv = aug[col][col];
        for (let j = col; j < 2 * n; j++)
            aug[col][j] = divRat(aug[col][j], piv);
        // 消去其他行的该列
        for (let r = 0; r < n; r++) {
            if (r === col)
                continue;
            const f = aug[r][col];
            if (isZeroRat(f))
                continue;
            for (let j = col; j < 2 * n; j++) {
                aug[r][j] = subRat(aug[r][j], mulRat(f, aug[col][j]));
            }
        }
    }
    return aug.map((row) => row.slice(n));
}

// 数值兜底（P4）
// 匹配不上符号模板时用标准数值算法兜底：
//   - 一元求根：区间扫描 + 二分/牛顿精化
//   - 多维牛顿（雅可比，数值差分）
//   - 数值积分：辛普森 / 高斯-勒让德（16 点）
// 任何 Expr 都能经 exprToFunction 转数值函数，从而"匹配不上就投降转数值"。
import { ratToNumber } from './expr.js';
// ---------- Expr → 数值 ----------
/** 表达式数值求值（测试/筛根/回代用）；未定义符号返回 NaN */
export function evalFloat(e) {
    switch (e.kind) {
        case 'num':
            return ratToNumber(e.rat);
        case 'sym':
            return e.name === 'pi' ? Math.PI : e.name === 'e' ? Math.E : NaN;
        case 'add':
            return e.terms.reduce((s, t) => s + evalFloat(t), 0);
        case 'mul':
            return ratToNumber(e.coeff) * e.factors.reduce((s, f) => s * evalFloat(f), 1);
        case 'pow':
            return Math.pow(evalFloat(e.base), Number(e.exp.n) / Number(e.exp.d));
        case 'sqrt':
            return Math.sqrt(evalFloat(e.arg));
        case 'fn': {
            const v = evalFloat(e.arg);
            switch (e.name) {
                case 'sin':
                    return Math.sin(v);
                case 'cos':
                    return Math.cos(v);
                case 'tan':
                    return Math.tan(v);
                case 'exp':
                    return Math.exp(v);
                case 'ln':
                    return Math.log(v);
                case 'acos':
                    return Math.acos(v);
            }
        }
    }
}
/** 把关于 varName 的表达式预编译为数值函数 f(x) */
export function exprToFunction(e, varName) {
    const go = (node) => {
        switch (node.kind) {
            case 'num': {
                const v = ratToNumber(node.rat);
                return () => v;
            }
            case 'sym':
                if (node.name === varName)
                    return (x) => x;
                return () => evalFloat(node);
            case 'add': {
                const fs = node.terms.map(go);
                return (x) => fs.reduce((s, f) => s + f(x), 0);
            }
            case 'mul': {
                const c = ratToNumber(node.coeff);
                const fs = node.factors.map(go);
                return (x) => c * fs.reduce((s, f) => s * f(x), 1);
            }
            case 'pow': {
                const b = go(node.base);
                const e = Number(node.exp.n) / Number(node.exp.d);
                return (x) => Math.pow(b(x), e);
            }
            case 'sqrt': {
                const a = go(node.arg);
                return (x) => Math.sqrt(a(x));
            }
            case 'fn': {
                const a = go(node.arg);
                switch (node.name) {
                    case 'sin':
                        return (x) => Math.sin(a(x));
                    case 'cos':
                        return (x) => Math.cos(a(x));
                    case 'tan':
                        return (x) => Math.tan(a(x));
                    case 'exp':
                        return (x) => Math.exp(a(x));
                    case 'ln':
                        return (x) => Math.log(a(x));
                    case 'acos':
                        return (x) => Math.acos(a(x));
                }
            }
        }
    };
    return go(e);
}
/** 多变量版：把关于 varNames 的表达式预编译为 F(xs)，xs[i] 对应 varNames[i] */
export function exprToFunctionN(e, varNames) {
    const go = (node) => {
        switch (node.kind) {
            case 'num': {
                const v = ratToNumber(node.rat);
                return () => v;
            }
            case 'sym': {
                const i = varNames.indexOf(node.name);
                if (i >= 0)
                    return (xs) => xs[i];
                return () => evalFloat(node); // e/pi/其他符号按常数求值，否则 NaN
            }
            case 'add': {
                const fs = node.terms.map(go);
                return (xs) => fs.reduce((s, f) => s + f(xs), 0);
            }
            case 'mul': {
                const c = ratToNumber(node.coeff);
                const fs = node.factors.map(go);
                return (xs) => c * fs.reduce((s, f) => s * f(xs), 1);
            }
            case 'pow': {
                const b = go(node.base);
                const e = Number(node.exp.n) / Number(node.exp.d);
                return (xs) => Math.pow(b(xs), e);
            }
            case 'sqrt': {
                const a = go(node.arg);
                return (xs) => Math.sqrt(a(xs));
            }
            case 'fn': {
                const a = go(node.arg);
                switch (node.name) {
                    case 'sin':
                        return (xs) => Math.sin(a(xs));
                    case 'cos':
                        return (xs) => Math.cos(a(xs));
                    case 'tan':
                        return (xs) => Math.tan(a(xs));
                    case 'exp':
                        return (xs) => Math.exp(a(xs));
                    case 'ln':
                        return (xs) => Math.log(a(xs));
                    case 'acos':
                        return (xs) => Math.acos(a(xs));
                }
            }
        }
    };
    return go(e);
}
// ---------- 一元求根 ----------
/** 二分法求根：要求 f(a)·f(b) < 0 */
export function bisect(f, a, b, tol = 1e-12) {
    const fa = f(a);
    const fb = f(b);
    if (fa === 0)
        return a;
    if (fb === 0)
        return b;
    if (fa * fb > 0)
        throw new Error('二分法要求两端点函数值异号');
    let lo = a;
    let hi = b;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (Math.abs(fm) < tol || (hi - lo) / 2 < tol)
            return mid;
        if (fm * f(lo) < 0)
            hi = mid;
        else
            lo = mid;
    }
    return (lo + hi) / 2;
}
/** 牛顿法求根：从初值迭代，收敛失败返回 null */
export function newton(f, fPrime, x0, tol = 1e-12, maxIter = 100) {
    let x = x0;
    for (let i = 0; i < maxIter; i++) {
        const fx = f(x);
        if (Math.abs(fx) < tol)
            return x;
        const df = fPrime(x);
        if (df === 0)
            return null;
        const nx = x - fx / df;
        if (!Number.isFinite(nx))
            return null;
        if (Math.abs(nx - x) < tol)
            return nx;
        x = nx;
    }
    return null;
}
/**
 * 在区间内找 f 的所有根：均匀扫描检测变号区间 → 二分精化。
 * 重根（曲线相切不変号）会漏掉——初高中几何场景根都是单根，可接受。
 */
export function findRoots(f, opts = {}) {
    const a = opts.a ?? -100;
    const b = opts.b ?? 100;
    const n = opts.n ?? 400;
    const tol = opts.tol ?? 1e-12;
    const roots = [];
    let prevX = a;
    let prevY = f(a);
    for (let i = 1; i <= n; i++) {
        const x = a + ((b - a) * i) / n;
        const y = f(x);
        if (Math.abs(y) < tol && i < n) {
            // 函数值本身接近 0（重根或根恰在采样点）
            if (roots.length === 0 || Math.abs(x - roots[roots.length - 1]) > 1e-6)
                roots.push(x);
        }
        else if (prevY * y < 0) {
            roots.push(bisect(f, prevX, x, tol));
        }
        prevX = x;
        prevY = y;
    }
    // 去重相邻根
    const out = [];
    for (const r of roots) {
        if (out.length === 0 || Math.abs(r - out[out.length - 1]) > 1e-6)
            out.push(r);
    }
    return out;
}
// ---------- 多维牛顿 ----------
/** 浮点高斯消元解线性方程组（返回 null 表示奇异） */
function gaussSolveFloat(aug, n) {
    for (let col = 0; col < n; col++) {
        let pr = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(aug[r][col]) > Math.abs(aug[pr][col]))
                pr = r;
        }
        if (Math.abs(aug[pr][col]) < 1e-14)
            return null;
        [aug[col], aug[pr]] = [aug[pr], aug[col]];
        const piv = aug[col][col];
        for (let j = col; j <= n; j++)
            aug[col][j] = aug[col][j] / piv;
        for (let r = 0; r < n; r++) {
            if (r === col)
                continue;
            const f = aug[r][col];
            if (f === 0)
                continue;
            for (let j = col; j <= n; j++)
                aug[r][j] = aug[r][j] - f * aug[col][j];
        }
    }
    return aug.map((row) => row[n]);
}
/**
 * 多维牛顿法：F: Rⁿ → Rⁿ，数值差分雅可比。
 * 从初值迭代，收敛失败（奇异/发散）返回 null。
 */
export function multiNewton(F, x0, opts = {}) {
    const n = x0.length;
    const tol = opts.tol ?? 1e-10;
    const maxIter = opts.maxIter ?? 100;
    const h = 1e-7;
    let x = [...x0];
    for (let iter = 0; iter < maxIter; iter++) {
        const fx = F(x);
        if (fx.every((v) => Math.abs(v) < tol))
            return x;
        const J = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                const xp = [...x];
                xp[j] += h;
                const xm = [...x];
                xm[j] -= h;
                row.push((F(xp)[i] - F(xm)[i]) / (2 * h));
            }
            J.push(row);
        }
        const aug = J.map((row, i) => [...row, -fx[i]]);
        const delta = gaussSolveFloat(aug, n);
        if (delta === null)
            return null;
        const nx = x.map((v, i) => v + delta[i]);
        if (!nx.every(Number.isFinite))
            return null;
        if (delta.every((d) => Math.abs(d) < tol))
            return nx;
        x = nx;
    }
    return null;
}
// ---------- 数值积分 ----------
/** 复合辛普森法则（n 需为偶数，自动向上取偶） */
export function simpson(f, a, b, n = 100) {
    if (n % 2 !== 0)
        n++;
    const h = (b - a) / n;
    let s = f(a) + f(b);
    for (let i = 1; i < n; i++) {
        s += (i % 2 === 0 ? 2 : 4) * f(a + (i * h));
    }
    return (s * h) / 3;
}
// 16 点高斯-勒让德：对称节点 ±x 与权重 w（Abramowitz & Stegun 25.4.32）
const GL16 = [
    [0.09501250983763744, 0.1894506104550685],
    [0.2816035507792589, 0.1826034150449236],
    [0.4580167776572274, 0.1691565193950025],
    [0.6178762444026438, 0.1495959888165767],
    [0.755404408355003, 0.1246289712555339],
    [0.8656312023878318, 0.0951585116824928],
    [0.9445750230732326, 0.0622535239386479],
    [0.9894009349916499, 0.0271524594117541],
];
/** 16 点高斯-勒让德求积 */
export function gaussLegendre(f, a, b) {
    const mid = (a + b) / 2;
    const half = (b - a) / 2;
    let s = 0;
    for (const [xi, wi] of GL16) {
        s += wi * f(mid + half * xi);
        s += wi * f(mid - half * xi);
    }
    return s * half;
}
// ---------- 符号假设筛根 ----------
/** 按 sign 标签过滤根：root 的数值需满足假设 */
export function matchesSign(root, sign) {
    const v = evalFloat(root);
    if (!Number.isFinite(v))
        return false;
    switch (sign) {
        case 'positive':
            return v > 0;
        case 'nonnegative':
            return v >= 0;
        case 'negative':
            return v < 0;
        case 'nonpositive':
            return v <= 0;
        case 'nonzero':
            return v !== 0;
        case 'real':
            return true;
    }
}

// 一元多项式代数与公式法求根（P2）
// 几何约束消元后生成的多项式方程是主战场：P2 覆盖一次/二次公式法，
// 三次及以上不实现通用根式公式（红灯区），交由数值兜底（P4 numeric.ts）。
// 系数一律用有理数（Rat）精确表示，不引入浮点。
import { add, addRat, divRat, extractSquare, isOneRat, isZeroRat, mul, mulRat, neg, negRat, num, rat, sqrt, subRat, } from './expr.js';
/** 去掉尾部零系数，规整为规范形 */
function norm(p) {
    let len = p.length;
    while (len > 0 && isZeroRat(p[len - 1]))
        len--;
    return p.slice(0, len);
}
/** 次数：零多项式为 -1 */
export function polyDegree(p) {
    return p.length - 1;
}
/** 最高次项系数：零多项式为 null */
export function polyLeading(p) {
    return p.length === 0 ? null : p[p.length - 1];
}
// ---------- 多项式运算 ----------
export function polyAdd(a, b) {
    const len = Math.max(a.length, b.length);
    const out = [];
    for (let i = 0; i < len; i++) {
        const ca = a[i] ?? { n: 0n, d: 1n };
        const cb = b[i] ?? { n: 0n, d: 1n };
        out.push(addRat(ca, cb));
    }
    return norm(out);
}
export function polySub(a, b) {
    const len = Math.max(a.length, b.length);
    const out = [];
    for (let i = 0; i < len; i++) {
        const ca = a[i] ?? { n: 0n, d: 1n };
        const cb = b[i] ?? { n: 0n, d: 1n };
        out.push(subRat(ca, cb));
    }
    return norm(out);
}
/** 每项乘常数 k */
export function polyScale(p, k) {
    return p.map((c) => mulRat(c, k));
}
/** 卷积乘法 */
export function polyMul(a, b) {
    if (a.length === 0 || b.length === 0)
        return [];
    const out = new Array(a.length + b.length - 1).fill({ n: 0n, d: 1n });
    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            out[i + j] = addRat(out[i + j], mulRat(a[i], b[j]));
        }
    }
    return norm(out);
}
/** 整数次幂（指数非负） */
export function polyPow(p, e) {
    if (!Number.isInteger(e) || e < 0)
        throw new Error('polyPow 指数必须是非负整数');
    let acc = [rat(1)];
    for (let i = 0; i < e; i++)
        acc = polyMul(acc, p);
    return acc;
}
/** 有理数求值（Horner 法） */
export function polyEval(p, x) {
    let acc = { n: 0n, d: 1n };
    for (let i = p.length - 1; i >= 0; i--) {
        acc = addRat(mulRat(acc, x), p[i]);
    }
    return acc;
}
/** 多项式逐系数比较（测试辅助） */
export function polyEq(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].n !== b[i].n || a[i].d !== b[i].d)
            return false;
    }
    return true;
}
/** 调试输出：按数学习惯降幂排列（如 "2x^3 - x + 1"） */
export function polyToString(p) {
    if (p.length === 0)
        return '0';
    const parts = [];
    for (let i = p.length - 1; i >= 0; i--) {
        const c = p[i];
        if (isZeroRat(c))
            continue;
        const absN = c.n < 0n ? -c.n : c.n;
        // 系数 ±1 且带变量时省略 "1"
        let coeffStr;
        if (i > 0 && absN === 1n && c.d === 1n)
            coeffStr = '';
        else
            coeffStr = c.d === 1n ? `${absN}` : `${absN}/${c.d}`;
        const varStr = i === 0 ? '' : i === 1 ? 'x' : `x^${i}`;
        const term = `${coeffStr}${varStr}`;
        const negative = c.n < 0n;
        if (parts.length === 0)
            parts.push(negative ? `-${term}` : term);
        else
            parts.push(negative ? ` - ${term}` : ` + ${term}`);
    }
    return parts.join('');
}
// ---------- 表达式 → 多项式 ----------
/**
 * 把表达式展开为关于 varName 的一元多项式。
 * 返回 null 表示超出 P2 能力：含其他符号（符号参数/超越常数）、sqrt、函数、负幂、分数幂。
 */
export function polyFromExpr(e, varName) {
    switch (e.kind) {
        case 'num':
            return norm([e.rat]);
        case 'sym': {
            if (e.name === varName)
                return [rat(0), rat(1)];
            return null; // e/pi/其他符号不能进入有理系数多项式（符号参数不处理）
        }
        case 'add': {
            let acc = [];
            for (const t of e.terms) {
                const p = polyFromExpr(t, varName);
                if (p === null)
                    return null;
                acc = polyAdd(acc, p);
            }
            return acc;
        }
        case 'mul': {
            // 系数直接作为第一个因子乘入
            let acc = [e.coeff];
            for (const f of e.factors) {
                const p = polyFromExpr(f, varName);
                if (p === null)
                    return null;
                acc = polyMul(acc, p);
            }
            return acc;
        }
        case 'pow': {
            const exp = e.exp;
            if (exp.d !== 1n || exp.n < 0n)
                return null; // 分数幂 / 负幂不是多项式
            const base = polyFromExpr(e.base, varName);
            if (base === null)
                return null;
            return polyPow(base, Number(exp.n));
        }
        default:
            return null; // sqrt / fn 不是多项式
    }
}
/** 整数平方根（BigInt 牛顿迭代） */
function isqrt(n) {
    if (n < 0n)
        throw new Error('isqrt 输入必须非负');
    if (n < 2n)
        return n;
    let x = n;
    let y = (x + 1n) / 2n;
    while (y < x) {
        x = y;
        y = (x + n / x) / 2n;
    }
    return x;
}
/** 非负整数是否为完全平方 */
function isPerfectSquare(n) {
    if (n < 0n)
        return false;
    const s = isqrt(n);
    return s * s === n;
}
/** sqrt(r)（r ≥ 0）提取为 coeff·sqrt(radical)，radical 为正无平方因子整数 */
function sqrtRat(r) {
    if (r.n < 0n)
        throw new Error('负数没有实数平方根');
    if (isZeroRat(r))
        return { coeff: rat(0), radical: rat(1) };
    // sqrt(n/d) = sqrt(n·d)/d = k·sqrt(m)/d
    const nd = r.n * r.d;
    const [k, m] = extractSquare(nd);
    return { coeff: rat(k, r.d), radical: rat(m) };
}
/** 解 a·x + b = 0 */
export function solveLinear(a, b) {
    if (isZeroRat(a)) {
        return isZeroRat(b) ? { kind: 'identity' } : { kind: 'contradiction' };
    }
    const r = divRat(negRat(b), a);
    return { kind: 'root', roots: [num(r.n, r.d)] };
}
/** 解 a·x² + b·x + c = 0（公式法，实数域） */
export function solveQuadratic(a, b, c) {
    if (isZeroRat(a))
        return solveLinear(b, c);
    const twoA = mulRat(rat(2), a);
    const disc = subRat(mulRat(b, b), mulRat(rat(4), mulRat(a, c)));
    if (disc.n < 0n)
        return { kind: 'noReal' };
    if (isZeroRat(disc)) {
        const r = divRat(negRat(b), twoA);
        return { kind: 'root', roots: [num(r.n, r.d)] };
    }
    const { coeff, radical } = sqrtRat(disc);
    // Δ 是完全平方 → sqrt(Δ) 是有理数，两根直接算
    if (radical.d === 1n && isPerfectSquare(radical.n)) {
        const s = mulRat(coeff, rat(isqrt(radical.n)));
        const r1 = divRat(addRat(negRat(b), s), twoA);
        const r2 = divRat(subRat(negRat(b), s), twoA);
        return { kind: 'root', roots: [num(r1.n, r1.d), num(r2.n, r2.d)] };
    }
    // 否则根为 u ± v·√m 形式（绿灯区 a + b√c 输出）
    const u = divRat(negRat(b), twoA);
    const v = divRat(coeff, twoA);
    const rad = sqrt(num(radical.n));
    const pos = add(num(u.n, u.d), mul(num(v.n, v.d), rad));
    const negR = add(num(u.n, u.d), neg(mul(num(v.n, v.d), rad)));
    return { kind: 'root', roots: [pos, negR] };
}
/** 解一元多项式方程 p(x) = 0 */
export function solvePoly(p) {
    const n = polyDegree(p);
    if (n < 0)
        return { kind: 'identity' }; // 0 = 0
    if (n === 0)
        return { kind: 'contradiction' }; // 非零常数 = 0
    const a = p[n];
    if (n === 1)
        return solveLinear(a, p[0]);
    if (n === 2)
        return solveQuadratic(a, p[1], p[0]);
    return { kind: 'unsupported' };
}
// ---------- 多项式长除 / GCD / 因式分解 ----------
/** 多项式带余除法：a = q·b + r（系数为精确有理数）；b 为零多项式返回 null */
export function polyDivMod(a, b) {
    a = norm(a);
    b = norm(b);
    if (b.length === 0)
        return null;
    let q = [];
    let r = a;
    const dB = polyDegree(b);
    const lcB = b[dB];
    while (r.length > 0 && polyDegree(r) >= dB) {
        const dR = polyDegree(r);
        const k = divRat(r[dR], lcB);
        const term = new Array(dR - dB + 1).fill(rat(0));
        term[dR - dB] = k;
        q = polyAdd(q, term);
        r = polySub(r, polyMul(term, b));
    }
    return { q: norm(q), r: norm(r) };
}
/** 化为首一多项式（除以最高次系数） */
function monic(p) {
    if (p.length === 0)
        return p;
    const lc = p[p.length - 1];
    if (isOneRat(lc))
        return p;
    const inv = divRat(rat(1), lc);
    return norm(p.map((c) => mulRat(c, inv)));
}
/** 多项式的最大公因式（Euclidean 算法，首一化输出） */
export function polyGcd(a, b) {
    let x = norm(a);
    let y = norm(b);
    while (y.length > 0) {
        const d = polyDivMod(x, y);
        if (d === null)
            break; // 不会发生：y 非零
        x = y;
        y = d.r;
    }
    return x.length === 0 ? [] : monic(x);
}
function gcdBig(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) {
        ;
        [a, b] = [b, a % b];
    }
    return a;
}
/** 正整数 n 的全部正因子（不含 0） */
function divisors(n) {
    n = n < 0n ? -n : n;
    const out = [];
    for (let d = 1n; d * d <= n; d++) {
        if (n % d === 0n) {
            out.push(d);
            if (d !== n / d)
                out.push(n / d);
        }
    }
    return out;
}
/** 二次 a·x² + b·x + c（整数系数）是否可约成一次因子；不可约返回 null */
function factorQuadratic(a, b, c) {
    const twoA = mulRat(rat(2), a);
    const disc = subRat(mulRat(b, b), mulRat(rat(4), mulRat(a, c)));
    if (disc.n < 0n)
        return null;
    if (isZeroRat(disc)) {
        const r = divRat(negRat(b), twoA);
        return [[negRat(r), rat(1)]];
    }
    const { coeff, radical } = sqrtRat(disc);
    if (radical.d === 1n && isPerfectSquare(radical.n)) {
        const s = mulRat(coeff, rat(isqrt(radical.n)));
        const r1 = divRat(addRat(negRat(b), s), twoA);
        const r2 = divRat(subRat(negRat(b), s), twoA);
        return [[negRat(r1), rat(1)], [negRat(r2), rat(1)]];
    }
    return null;
}
/** 从候选有理根里找第一个真正的根（polyEval 精确验证） */
function findRationalRoot(p) {
    const deg = polyDegree(p);
    const a0 = p[0];
    const an = p[deg];
    const candidates = new Set();
    for (const nf of divisors(a0.n)) {
        for (const df of divisors(an.n)) {
            const r = { n: nf, d: df };
            candidates.add(`${r.n}/${r.d}`);
            candidates.add(`${-r.n}/${r.d}`);
        }
    }
    for (const key of candidates) {
        const [n, d] = key.split('/').map(BigInt);
        const r = { n, d };
        if (isZeroRat(polyEval(p, r)))
            return r;
    }
    return null;
}
/**
 * 整数系数多项式的因式分解（有理数系数先提公因子再转整数）。
 * 边界：次数 ≤ 4；用有理根定理提取一次因子，剩余二次按判别式判断可约性。
 * 返回 content 与因子列表（乘积 = content · Π factor^mult）；超边界返回 null。
 */
export function factorPolyInt(p) {
    p = norm(p);
    if (p.length === 0)
        return null;
    if (polyDegree(p) > 4)
        return null; // 超出"整数系数 ≤ 4 次"边界
    // 转整数系数：通分 + 提公因子（content 符号使首项为正）
    let L = 1n;
    for (const c of p)
        L = (L / gcdBig(L, c.d)) * c.d; // lcm 分母
    const ints = p.map((c) => c.n * (L / c.d));
    let g = 0n;
    for (const c of ints)
        g = g === 0n ? (c < 0n ? -c : c) : gcdBig(g, c);
    if (g === 0n)
        return null;
    if (ints[ints.length - 1] < 0n)
        g = -g; // 首项取正
    const content = { n: g, d: L };
    const prim = ints.map((c) => ({ n: c / g, d: 1n }));
    const factors = [];
    let cur = norm(prim);
    // 提 x（常数项为 0）
    let zeroMult = 0;
    while (cur.length > 0 && isZeroRat(cur[0])) {
        cur = cur.slice(1);
        zeroMult++;
    }
    if (zeroMult > 0)
        factors.push({ poly: [rat(0), rat(1)], mult: zeroMult });
    // 循环提取一次因子
    while (cur.length - 1 >= 1) {
        if (cur.length - 1 === 1)
            break; // 已是一次因子
        let lin;
        if (cur.length - 1 === 2) {
            const fq = factorQuadratic(cur[2], cur[1], cur[0]);
            if (fq === null)
                break; // 不可约二次
            lin = fq;
        }
        else {
            const r = findRationalRoot(cur);
            if (r === null)
                break; // 三次/四次无有理根 → 保留（超能力边界）
            lin = [[negRat(r), rat(1)]];
        }
        for (const f of lin) {
            let mult = 0;
            while (true) {
                const d = polyDivMod(cur, f);
                if (d === null || d.r.length !== 0)
                    break;
                cur = d.q;
                mult++;
            }
            if (mult > 0)
                factors.push({ poly: norm(f), mult });
        }
    }
    // 剩余非常数部分作为不可约因子（本原多项式剩余常数只能是 ±1，跳过）
    if (cur.length > 1)
        factors.push({ poly: cur, mult: 1 });
    return { content, factors };
}

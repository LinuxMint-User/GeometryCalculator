// 化简：递归规范化 + 初等函数在特殊点的精确求值
// 代数合并（同类项、同底幂、平方因子提取）已在 expr.ts 的工厂中完成
import { add, isOneRat, isZeroRat, mul, num, pow, rat, sqrt, sym } from './expr.js';
import { evalFloat } from './numeric.js';
/** 检测参数是否为 k·π 形式（k 为有理数），返回 k；不是则返回 null */
function piMultipleOf(e) {
    if (e.kind === 'sym' && e.name === 'pi')
        return rat(1);
    if (e.kind === 'mul' && e.factors.length === 1 && e.factors[0].kind === 'sym' && e.factors[0].name === 'pi') {
        return e.coeff;
    }
    // 数值参数仅在为 0 时视为 0·π（其余弧度值不做精确求值，如 sin(2)）
    if (e.kind === 'num' && isZeroRat(e.rat))
        return rat(0);
    return null;
}
const TRIG_TABLE = {
    '0/1': { sin: '0', cos: '1', tan: '0' },
    '1/6': { sin: '1/2', cos: 'sqrt3/2', tan: 'sqrt3/3' },
    '1/4': { sin: 'sqrt2/2', cos: 'sqrt2/2', tan: '1' },
    '1/3': { sin: 'sqrt3/2', cos: '1/2', tan: 'sqrt3' },
    '1/2': { sin: '1', cos: '0', tan: null },
    '2/3': { sin: 'sqrt3/2', cos: '-1/2', tan: '-sqrt3' },
    '3/4': { sin: 'sqrt2/2', cos: '-sqrt2/2', tan: '-1' },
    '5/6': { sin: '1/2', cos: '-sqrt3/2', tan: '-sqrt3/3' },
    '1/1': { sin: '0', cos: '-1', tan: '0' },
    '7/6': { sin: '-1/2', cos: '-sqrt3/2', tan: 'sqrt3/3' },
    '5/4': { sin: '-sqrt2/2', cos: '-sqrt2/2', tan: '1' },
    '4/3': { sin: '-sqrt3/2', cos: '-1/2', tan: 'sqrt3' },
    '3/2': { sin: '-1', cos: '0', tan: null },
    '5/3': { sin: '-sqrt3/2', cos: '1/2', tan: '-sqrt3' },
    '7/4': { sin: '-sqrt2/2', cos: 'sqrt2/2', tan: '-1' },
    '11/6': { sin: '-1/2', cos: 'sqrt3/2', tan: '-sqrt3/3' },
};
const SQRT2 = () => sqrt(num(2));
const SQRT3 = () => sqrt(num(3));
/** 把标记串转成 Expr（如 "sqrt3/2" → sqrt(3)/2，"1/2" → 1/2） */
function valueFromTag(tag) {
    const neg = tag.startsWith('-');
    const body = neg ? tag.slice(1) : tag;
    let e;
    if (body === '1')
        e = num(1);
    else if (body === '0')
        e = num(0);
    else if (body.startsWith('sqrt')) {
        const radical = body.startsWith('sqrt3') ? SQRT3() : SQRT2();
        const rest = body.slice('sqrt3'.length);
        if (rest === '')
            e = radical;
        else if (rest.startsWith('/'))
            e = mul(radical, num(1, Number(rest.slice(1))));
        else
            e = mul(radical, num(1)); // 不应发生
    }
    else if (body.includes('/')) {
        const [n, d] = body.split('/').map(Number);
        e = num(n, d);
    }
    else {
        e = num(Number(body));
    }
    return neg ? mul(num(-1), e) : e;
}
/** 归一化 k 到 [0, 2)，用于查表 */
function normK(k) {
    const two = rat(2);
    let r = { n: k.n, d: k.d };
    // 模 2：r = k - 2*floor(k/2)
    while (r.n < 0n) {
        r = { n: r.n + 2n * r.d, d: r.d };
    }
    while (r.n >= 2n * r.d) {
        r = { n: r.n - 2n * r.d, d: r.d };
    }
    return rat(r.n, r.d);
}
/** 初等函数在特殊点的精确求值；不能精确求值返回 null */
function exactFnValue(name, arg) {
    if (name === 'exp') {
        if (arg.kind === 'num' && isZeroRat(arg.rat))
            return num(1);
        return null;
    }
    if (name === 'ln') {
        if (arg.kind === 'num' && isOneRat(arg.rat))
            return num(0);
        if (arg.kind === 'sym' && arg.name === 'e')
            return num(1);
        return null;
    }
    // 反余弦：特殊值精确求值（数值匹配避免符号比对的复杂度），其余数值兜底
    if (name === 'acos') {
        const v = evalFloat(arg);
        if (!Number.isFinite(v))
            return null;
        // 特殊角表：acos 值 → (n/d)·π
        const table = [
            [1, 0, 1],
            [-1, 1, 1],
            [0, 1, 2],
            [1 / 2, 1, 3],
            [Math.SQRT2 / 2, 1, 4],
            [Math.sqrt(3) / 2, 1, 6],
            [-1 / 2, 2, 3],
            [-Math.SQRT2 / 2, 3, 4],
            [-Math.sqrt(3) / 2, 5, 6],
        ];
        for (const [target, n, d] of table) {
            if (Math.abs(v - target) < 1e-9) {
                return n === 0 ? num(0) : mul(sym('pi'), num(n, d));
            }
        }
        return null;
    }
    // sin / cos / tan：参数须为 k·π
    const k = piMultipleOf(arg);
    if (k === null)
        return null;
    const entry = TRIG_TABLE[`${normK(k).n}/${normK(k).d}`];
    if (entry === undefined)
        return null;
    const tag = entry[name];
    if (tag === null)
        return null;
    return valueFromTag(tag);
}
export function simplify(e) {
    switch (e.kind) {
        case 'num':
        case 'sym':
            return e;
        case 'fn': {
            const arg = simplify(e.arg);
            const v = exactFnValue(e.name, arg);
            if (v !== null)
                return v;
            return arg === e.arg ? e : { kind: 'fn', name: e.name, arg };
        }
        case 'sqrt': {
            const arg = simplify(e.arg);
            if (arg === e.arg)
                return e;
            return sqrt(arg);
        }
        case 'pow': {
            const base = simplify(e.base);
            // sqrt(x)^2 = x（对 num 参数安全；符号参数保守不化简）
            if (base.kind === 'sqrt' && e.exp.n === 2n && e.exp.d === 1n && base.arg.kind === 'num') {
                return base.arg;
            }
            if (base === e.base)
                return e;
            return pow(base, e.exp);
        }
        case 'add':
            return add(...e.terms.map(simplify));
        case 'mul':
            return mul(num(e.coeff.n, e.coeff.d), ...e.factors.map(simplify));
    }
}

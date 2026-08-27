// 几何计算器核心（迁移自 legacy Python 后端 problem.py / data / cond / vec_parse_utils）
// 职责：数学对象注册与依赖追踪、用户表达式解析（含几何记号）、条件生成、求解主流程。
//
// 表达式记号（与 Python 版一致）：
//   单小写字母 / 希腊拼写  → 已注册未知数（如 a、alpha）
//   x_A / y_A              → 点 A 的横/纵坐标
//   AB                     → 线段 AB 的长度
//   vecAB                  → 向量 AB（配合 dot 点乘或 [0]/[1] 下标）
//   angABC                 → 角 ABC（∠B）
//   StABC                  → 三角形 ABC 的面积
//   kAB / bAB              → 直线 AB 的斜率 / 截距
//   dAtBC                  → 点 A 到直线 BC 的距离
//   (a, b)                 → 向量坐标（配合 dot 或下标）
//   deg                    → 角度制（30deg = 30°）
import { add, fn, isZeroRat, mul, neg, num, pow, rat, sqrt, sym, } from './expr.js';
import { latex, symNameToLatex } from './latex.js';
import { ParseError, parse } from './parse.js';
import { simplify } from './simplify.js';
import { solveNumerically, solveSystem } from './solve.js';
// 合法未知数名：单小写字母（x, y 除外，它们留给点坐标的局部变量）+ 希腊字母英文拼写（除 pi）
const VALID_GREEK_SPELLINGS = new Set([
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
    'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron',
    'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
]);
function isUnknownName(name) {
    return /^[a-z]$/.test(name) || VALID_GREEK_SPELLINGS.has(name);
}
/** 取值范围三布尔 → [latex 显示, sign 假设] */
function domainInfo(domain) {
    const d = domain ?? { negative: true, zero: true, positive: true };
    const [n, z, p] = [d.negative, d.zero, d.positive];
    if (n && z && p)
        return { domainLatex: '\\mathbb{R}', sign: null };
    if (n && !z && !p)
        return { domainLatex: '(-\\infty, 0)', sign: 'negative' };
    if (n && z && !p)
        return { domainLatex: '(-\\infty, 0]', sign: 'nonpositive' };
    if (!n && !z && p)
        return { domainLatex: '(0, +\\infty)', sign: 'positive' };
    if (!n && z && p)
        return { domainLatex: '[0, +\\infty)', sign: 'nonnegative' };
    if (n && !z && p)
        return { domainLatex: '(-\\infty, 0) \\cup (0, +\\infty)', sign: 'nonzero' };
    // 前端已做合法性检查，理论上到不了这里
    return { domainLatex: '\\mathbb{R}', sign: null };
}
class GCSymbol {
    id;
    requiredBy = new Set();
    domainLatex;
    sign;
    constructor(id, domain) {
        this.id = id;
        const info = domainInfo(domain);
        this.domainLatex = info.domainLatex;
        this.sign = info.sign;
    }
    addRequiredBy(id) {
        this.requiredBy.add(id);
    }
    get nameLatex() {
        return symNameToLatex(this.id);
    }
}
class GCPoint {
    id;
    x;
    y;
    requiredBy = new Set();
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
    }
    addRequiredBy(id) {
        this.requiredBy.add(id);
    }
}
class GcCond {
    id;
    eqs;
    requiredBy = new Set();
    constructor(id, // 原始 LaTeX
    eqs) {
        this.id = id;
        this.eqs = eqs;
    }
    addRequiredBy(id) {
        this.requiredBy.add(id);
    }
}
// ---------- Problem ----------
export class Problem {
    mathObjs = new Map();
    symbolNames = [];
    pointNames = [];
    condIds = [];
    /** 正在添加的新对象依赖了哪些对象（按 id） */
    tracker = new Set();
    /** 操作历史（保存 / 恢复） */
    history = [];
    record(op, args) {
        this.history.push({ op, args });
    }
    /** 记录依赖：本次添加的对象访问了 name 对应的对象 */
    require(name) {
        this.tracker.add(name);
    }
    /** 添加数学对象：把 tracker 里记录的对象"被新对象依赖"关系落盘 */
    addMathObj(obj) {
        this.mathObjs.set(obj.id, obj);
        for (const r of this.tracker) {
            const dep = this.mathObjs.get(r);
            if (dep !== undefined)
                dep.addRequiredBy(obj.id);
        }
        this.tracker.clear();
    }
    // ---------- 查询对象 ----------
    symbolOf(name) {
        this.require(name);
        const obj = this.mathObjs.get(name);
        if (obj === undefined || !(obj instanceof GCSymbol))
            throw new Error(`未定义的符号 ${name}`);
        return sym(name, obj.sign);
    }
    pointOf(name) {
        this.require(name);
        const obj = this.mathObjs.get(name);
        if (obj === undefined || !(obj instanceof GCPoint))
            throw new Error(`未定义的点 ${name}`);
        return obj;
    }
    /** 直线 AB 的向量：B - A */
    vecOf(name) {
        const a = this.pointOf(name[0]);
        const b = this.pointOf(name[1]);
        return [add(b.x, neg(a.x)), add(b.y, neg(a.y))];
    }
    /** 线段 AB 的长度 */
    distOf(name) {
        const [vx, vy] = this.vecOf(name);
        return sqrt(add(pow(vx, rat(2)), pow(vy, rat(2))));
    }
    /** 角 ABC：顶点为 B，acos(BA·BC / (|BA|·|BC|)) */
    angleOf(name) {
        const v1 = this.vecOf(name[1] + name[0]); // BA
        const v2 = this.vecOf(name[1] + name[2]); // BC
        const dot = add(mul(v1[0], v2[0]), mul(v1[1], v2[1]));
        const n1 = sqrt(add(pow(v1[0], rat(2)), pow(v1[1], rat(2))));
        const n2 = sqrt(add(pow(v2[0], rat(2)), pow(v2[1], rat(2))));
        return fn('acos', mul(dot, pow(mul(n1, n2), rat(-1))));
    }
    /** 三角形 ABC 面积：sqrt(行列式²)/2（避免引入 Abs 节点，实数域等价） */
    triAreaOf(name) {
        const a = this.pointOf(name[0]);
        const b = this.pointOf(name[1]);
        const c = this.pointOf(name[2]);
        const det = add(mul(a.x, add(b.y, neg(c.y))), mul(b.x, add(c.y, neg(a.y))), mul(c.x, add(a.y, neg(b.y))));
        return mul(sqrt(pow(det, rat(2))), num(1, 2));
    }
    /** 直线 AB 系数 [a, b, c]：a·x + b·y + c = 0（竖直线 b = 0） */
    lineCoeffs(name) {
        const a = this.pointOf(name[0]);
        const b = this.pointOf(name[1]);
        return [
            add(a.y, neg(b.y)),
            add(b.x, neg(a.x)),
            add(mul(a.x, b.y), neg(mul(b.x, a.y))),
        ];
    }
    /** 直线 AB 的斜率；竖直报错 */
    slopeOf(name) {
        const a = this.pointOf(name[0]);
        const b = this.pointOf(name[1]);
        const dx = add(b.x, neg(a.x));
        if (dx.kind === 'num' && isZeroRat(dx.rat))
            throw new Error(`直线 ${name} 竖直，无法获取斜率！`);
        return mul(add(b.y, neg(a.y)), pow(dx, rat(-1)));
    }
    /** 直线 AB 的截距（y = kx + b 的 b）；竖直报错 */
    interceptOf(name) {
        const [, bb, c] = this.lineCoeffs(name);
        if (bb.kind === 'num' && isZeroRat(bb.rat))
            throw new Error(`直线 ${name} 竖直，无法获取截距！`);
        return mul(neg(c), pow(bb, rat(-1)));
    }
    /** 点 P 到直线 AB 的距离：|a·x0 + b·y0 + c| / sqrt(a² + b²) */
    distPL(point, line) {
        const p = this.pointOf(point);
        const [a, b, c] = this.lineCoeffs(line);
        const d = add(mul(a, p.x), mul(b, p.y), c);
        return mul(sqrt(pow(d, rat(2))), pow(sqrt(add(pow(a, rat(2)), pow(b, rat(2)))), rat(-1)));
    }
    // ---------- 表达式解析 ----------
    /**
     * 字符串预处理：把几何记号替换成纯字母占位符，得到可直接 parse 的文本。
     * 点乘（dot）会单独收集到 ctx.dotMap，由 resolve 阶段构造点乘表达式。
     */
    preprocess(input, ctx) {
        let s = input;
        // 1. 点坐标 x_A / y_A → gcpxA / gcpyA（必须先于其他替换，避免下划线报错）
        s = s.replace(/\b(x|y)([A-Z])\b/g, (_m, xy, p) => (xy === 'x' ? `gcpx${p}` : `gcpy${p}`));
        // 2. 向量点乘：vecAB dot vecCD / (a, b) dot (c, d) → gcdotN
        const DOT_RE = /((?:vec[A-Z]{2}|\([^()]*,[^()]*\)))\s*dot\s*((?:vec[A-Z]{2}|\([^()]*,[^()]*\)))/g;
        for (;;) {
            const next = s.replace(DOT_RE, (_m, l, r) => {
                // 占位符须为纯字母标识符（tokenizer 中数字会截断标识符，如 gcdot0 → gcdot·0）
                const ph = `gcdot${String.fromCharCode(65 + ctx.dotCount++)}`; // gcdotA, gcdotB, …
                ctx.dotMap.set(ph, { l: this.vecSpec(l, ctx), r: this.vecSpec(r, ctx) });
                return ph;
            });
            if (next === s)
                break;
            s = next;
        }
        // 占位符 gcdotN 含子串 "dot"，须用词边界判断剩余未转换的 dot
        if (/\bdot\b/.test(s))
            throw new Error('向量点乘 dot 用法错误');
        // 3. 向量下标 vecAB[0] / [1] → 分量
        s = s.replace(/\bvec([A-Z]{2})\[([01])\]/g, (_m, n, k) => (k === '0' ? `gcvx${n}` : `gcvy${n}`));
        // 4. 裸向量 vecAB → gcvAB
        s = s.replace(/\bvec([A-Z]{2})\b/g, 'gcv$1');
        // 5. 裸坐标元组无法处理，报错
        if (/\([^()]*,[^()]*\)/.test(s))
            throw new Error('向量坐标必须配合 dot 点乘或 [0]/[1] 下标使用');
        // 6. 角 / 面积 / 斜率 / 截距 / 点到直线距离
        s = s.replace(/\bang([A-Z]{3})\b/g, 'gca$1');
        s = s.replace(/\bSt([A-Z]{3})\b/g, 'gcs$1');
        s = s.replace(/\b(k|b)([A-Z]{2})\b/g, (_m, kb, n) => `gc${kb}${n}`);
        s = s.replace(/\bd([A-Z])t([A-Z]{2})\b/g, 'gcd$1t$2');
        // 7. 距离 AB → gcdAB（后视断言排除已替换占位符内部的大写，如 gcvAB / gcdAtBC）
        s = s.replace(/(?<![A-Za-z])([A-Z]{2})(?![A-Za-z_])/g, 'gcd$1');
        // 8. 角度制：30deg → 30*pi/180
        s = s.replace(/(\d+)deg/g, '$1* pi / 180');
        return s;
    }
    vecSpec(spec, ctx) {
        const v = /^vec([A-Z]{2})$/.exec(spec);
        if (v !== null)
            return { kind: 'vec', name: v[1] };
        const c = /^\(([^()]*),([^()]*)\)$/.exec(spec);
        if (c !== null) {
            // 元组内容继续走完整预处理（可能含 x_A、AB 等记号），resolve 时再解析
            return { kind: 'coord', parts: [this.preprocess(c[1], ctx), this.preprocess(c[2], ctx)] };
        }
        throw new Error(`无法解析向量表达式：${spec}`);
    }
    /** 把占位符符号替换为真实几何表达式；同时校验用户符号 */
    resolve(e, dotMap) {
        switch (e.kind) {
            case 'num':
                return e;
            case 'sym':
                return this.resolveSym(e.name, dotMap);
            case 'add':
                return add(...e.terms.map((t) => this.resolve(t, dotMap)));
            case 'mul':
                return mul(...e.factors.map((f) => this.resolve(f, dotMap)), num(e.coeff.n, e.coeff.d));
            case 'pow':
                return pow(this.resolve(e.base, dotMap), e.exp);
            case 'sqrt':
                return sqrt(this.resolve(e.arg, dotMap));
            case 'fn':
                return fn(e.name, this.resolve(e.arg, dotMap));
        }
    }
    resolveSym(name, dotMap) {
        // 点乘占位：l·r = l.x·r.x + l.y·r.y
        if (/^gcdot[A-Z]$/.test(name)) {
            const spec = dotMap.get(name);
            if (spec === undefined)
                throw new Error('内部错误：点乘占位符缺失');
            const l = this.vecToExpr(spec.l, dotMap);
            const r = this.vecToExpr(spec.r, dotMap);
            return add(mul(l[0], r[0]), mul(l[1], r[1]));
        }
        // 点坐标
        let m = /^gcpx([A-Z])$/.exec(name);
        if (m !== null)
            return this.pointOf(m[1]).x;
        m = /^gcpy([A-Z])$/.exec(name);
        if (m !== null)
            return this.pointOf(m[1]).y;
        // 向量分量
        m = /^gcvx([A-Z]{2})$/.exec(name);
        if (m !== null)
            return this.vecOf(m[1])[0];
        m = /^gcvy([A-Z]{2})$/.exec(name);
        if (m !== null)
            return this.vecOf(m[1])[1];
        // 裸向量（未配合 dot / 下标）
        m = /^gcv([A-Z]{2})$/.exec(name);
        if (m !== null)
            throw new Error('向量必须配合 dot 点乘或 [0]/[1] 下标使用');
        // 点到直线距离
        m = /^gcd([A-Z])t([A-Z]{2})$/.exec(name);
        if (m !== null)
            return this.distPL(m[1], m[2]);
        // 距离
        m = /^gcd([A-Z]{2})$/.exec(name);
        if (m !== null)
            return this.distOf(m[1]);
        // 角度
        m = /^gca([A-Z]{3})$/.exec(name);
        if (m !== null)
            return this.angleOf(m[1]);
        // 面积
        m = /^gcs([A-Z]{3})$/.exec(name);
        if (m !== null)
            return this.triAreaOf(m[1]);
        // 斜率 / 截距
        m = /^gck([A-Z]{2})$/.exec(name);
        if (m !== null)
            return this.slopeOf(m[1]);
        m = /^gcb([A-Z]{2})$/.exec(name);
        if (m !== null)
            return this.interceptOf(m[1]);
        // 常数
        if (name === 'pi' || name === 'e')
            return sym(name);
        // 未知数（查表并记录依赖）
        if (isUnknownName(name))
            return this.symbolOf(name);
        throw new Error(`无法识别的符号 ${name}`);
    }
    vecToExpr(spec, dotMap) {
        if (spec.kind === 'vec')
            return this.vecOf(spec.name);
        const parts = spec.parts.map((p) => this.resolve(parse(p), dotMap));
        return [parts[0], parts[1]];
    }
    /** 解析用户字符串表达式（含几何记号）为 Expr */
    evalStrExpr(input) {
        const ctx = { dotMap: new Map(), dotCount: 0 };
        const text = this.preprocess(input, ctx);
        let e;
        try {
            e = parse(text);
        }
        catch (err) {
            if (err instanceof ParseError)
                throw new Error(`表达式解析失败：${err.message}`);
            throw err;
        }
        return this.resolve(e, ctx.dotMap);
    }
    /** 生成用户输入的 LaTeX 展示（条件 id 与求解左侧） */
    toRawLatex(input) {
        let s = input;
        // 三字母大写先转三角形，避免 ang/St 等规则二次处理已生成的内容（如 \angle ABC 里的 ABC）
        s = s.replace(/\b([A-Z]{3})\b/g, '\\triangle $1');
        s = s.replace(/\bvec([A-Z]{2})\[([01])\]/g, '\\overrightarrow{$1}_{$2}');
        s = s.replace(/\bvec([A-Z]{2})\b/g, '\\overrightarrow{$1}');
        s = s.replace(/\bang([A-Z]{3})\b/g, '\\angle $1');
        s = s.replace(/\bSt([A-Z]{3})\b/g, 'S_{\\triangle $1}');
        s = s.replace(/\b(k|b)([A-Z]{2})\b/g, '$1_{$2}');
        s = s.replace(/\bd([A-Z])t([A-Z]{2})\b/g, 'd_{$1 到 $2}');
        s = s.replace(/\b(x|y)([A-Z])\b/g, '$1_$2');
        s = s.replace(/(\d+)deg/g, '$1^{\\circ}');
        s = s.replace(/\s*dot\s*/g, ' \\cdot ');
        return s;
    }
    // ---------- 对象添加 ----------
    addSymbol(name, domainSettings = null) {
        this.addMathObj(new GCSymbol(name, domainSettings));
        this.symbolNames.push(name);
        this.record('addSymbol', [name, domainSettings]);
    }
    addPoint(name, xStr, yStr, line1, line2) {
        const historyStart = this.history.length;
        const created = []; // 自动创建的未知数 x_A / y_A（失败时回滚）
        try {
            // 设未知数（不单独记历史：随 addPoint 重放时一并重建，避免重复）
            if (xStr === 'x') {
                this.createUnknown(`x_${name}`);
                created.push(`x_${name}`);
            }
            if (yStr === 'y') {
                this.createUnknown(`y_${name}`);
                created.push(`y_${name}`);
            }
            const requiredByNew = new Set(); // 点被这些自动创建的符号"反向依赖"
            // 收集线性约束 a·x + b·y + c = 0；系数可为任意表达式（允许符号坐标）
            const lin = [];
            if (xStr !== '') {
                const rhs = xStr === 'x' ? this.symbolOf(`x_${name}`) : this.evalStrExpr(xStr);
                lin.push({ a: num(1), b: num(0), c: neg(rhs) });
                if (xStr === 'x')
                    requiredByNew.add(`x_${name}`);
            }
            if (yStr !== '') {
                const rhs = yStr === 'y' ? this.symbolOf(`y_${name}`) : this.evalStrExpr(yStr);
                lin.push({ a: num(0), b: num(1), c: neg(rhs) });
                if (yStr === 'y')
                    requiredByNew.add(`y_${name}`);
            }
            for (const l of [line1, line2]) {
                if (l !== '') {
                    const [a, b, c] = this.lineCoeffs(l);
                    lin.push({ a, b, c });
                }
            }
            if (lin.length < 2)
                throw new Error('无法唯一确定点的坐标：约束不足');
            const [px, py] = this.solveXY(lin);
            const point = new GCPoint(name, px, py);
            // 反向依赖：删除点时级联删除其自动创建的未知数
            for (const s of requiredByNew)
                point.addRequiredBy(s);
            this.addMathObj(point);
            this.pointNames.push(name);
            this.record('addPoint', [name, xStr, yStr, line1, line2]);
        }
        catch (err) {
            // 回滚可能已添加的未知数
            for (const n of created) {
                const idx = this.symbolNames.indexOf(n);
                if (idx !== -1)
                    this.symbolNames.splice(idx, 1);
                this.mathObjs.delete(n);
            }
            this.tracker.clear();
            this.history.length = historyStart;
            throw err;
        }
    }
    /** 创建自动未知数（点坐标 x_A / y_A），不单独记录历史（随 addPoint 一起重放） */
    createUnknown(name) {
        this.addMathObj(new GCSymbol(name, null));
        this.symbolNames.push(name);
    }
    /** 解 a·x + b·y + c = 0 的二元线性系统（Cramer 法则，系数可为符号表达式） */
    solveXY(lin) {
        const [e1, e2] = [lin[0], lin[1]];
        const det = simplify(add(mul(e1.a, e2.b), neg(mul(e2.a, e1.b))));
        if (det.kind === 'num' && isZeroRat(det.rat))
            throw new Error('无法唯一确定点的坐标：约束不足或矛盾');
        const x = simplify(mul(add(mul(e1.b, e2.c), neg(mul(e2.b, e1.c))), pow(det, rat(-1))));
        const y = simplify(mul(add(mul(e2.a, e1.c), neg(mul(e1.a, e2.c))), pow(det, rat(-1))));
        // 冗余约束校验：代入应恒为 0
        for (let i = 2; i < lin.length; i++) {
            const e = lin[i];
            const chk = simplify(add(mul(e.a, x), mul(e.b, y), e.c));
            if (chk.kind === 'num' && !isZeroRat(chk.rat))
                throw new Error('点的坐标约束矛盾');
        }
        return [x, y];
    }
    /** 添加条件：化简方程、过滤恒等、矛盾报错 */
    addCond(rawLatex, eqs) {
        const kept = [];
        for (const eq of eqs) {
            const s = simplify(eq);
            if (s.kind === 'num') {
                if (isZeroRat(s.rat))
                    continue; // 恒等，跳过
                throw new Error('该条件不可能成立！');
            }
            kept.push(s);
        }
        if (kept.length === 0)
            throw new Error('该条件一定成立，不需要添加');
        const cond = new GcCond(rawLatex, kept);
        this.addMathObj(cond);
        this.condIds.push(rawLatex);
    }
    addBinCond(op, input1, input2, eqs) {
        this.addCond(`${this.toRawLatex(input1)} ${op} ${this.toRawLatex(input2)}`, eqs);
    }
    addUnaryCond(op, input1, eqs) {
        this.addCond(`${op} ${input1}`, eqs);
    }
    addExprEq(input1, input2) {
        const eq = add(this.evalStrExpr(input1), neg(this.evalStrExpr(input2)));
        this.addBinCond('=', input1, input2, [eq]);
        this.record('addExprEq', [input1, input2]);
    }
    addParallel(input1, input2) {
        const [a1, b1] = this.lineCoeffs(input1);
        const [a2, b2] = this.lineCoeffs(input2);
        this.addBinCond('\\parallel', input1, input2, [add(mul(a1, b2), neg(mul(a2, b1)))]);
        this.record('addParallel', [input1, input2]);
    }
    addPerp(input1, input2) {
        const [a1, b1] = this.lineCoeffs(input1);
        const [a2, b2] = this.lineCoeffs(input2);
        this.addBinCond('\\perp', input1, input2, [add(mul(a1, a2), mul(b1, b2))]);
        this.record('addPerp', [input1, input2]);
    }
    /** 三角形全等（SSS）：三边对应相等 */
    addCong(input1, input2) {
        const s1 = [input1.slice(0, 2), input1.slice(1), input1[0] + input1[2]];
        const s2 = [input2.slice(0, 2), input2.slice(1), input2[0] + input2[2]];
        const eqs = s1.map((x, i) => add(this.distOf(x), neg(this.distOf(s2[i]))));
        this.addBinCond('\\cong', input1, input2, eqs);
        this.record('addCong', [input1, input2]);
    }
    /** 三角形相似（SSS）：三边比例相等 */
    addSim(input1, input2) {
        const s1 = [input1.slice(0, 2), input1.slice(1), input1[0] + input1[2]];
        const s2 = [input2.slice(0, 2), input2.slice(1), input2[0] + input2[2]];
        const ratio = (i) => mul(this.distOf(s1[i]), pow(this.distOf(s2[i]), rat(-1)));
        const eqs = [add(ratio(0), neg(ratio(1))), add(ratio(1), neg(ratio(2)))];
        this.addBinCond('\\sim', input1, input2, eqs);
        this.record('addSim', [input1, input2]);
    }
    /** 平行四边形 ABCD：AB = DC（向量相等） */
    addParallelogram(input1) {
        const v1 = this.vecOf(input1.slice(0, 2)); // AB
        const v2 = this.vecOf(input1[3] + input1[2]); // DC = C - D（对边向量）
        const eqs = [add(v1[0], neg(v2[0])), add(v1[1], neg(v2[1]))];
        this.addUnaryCond('平行四边形', input1, eqs);
        this.record('addParallelogram', [input1]);
    }
    /** 菱形 ABCD：平行四边形 + 邻边相等 */
    addRhombus(input1) {
        const v1 = this.vecOf(input1.slice(0, 2));
        const v2 = this.vecOf(input1[3] + input1[2]); // DC = C - D（对边向量）
        const adjacent = input1.slice(1, 3); // BC
        const eqs = [
            add(v1[0], neg(v2[0])),
            add(v1[1], neg(v2[1])),
            add(this.distOf(input1.slice(0, 2)), neg(this.distOf(adjacent))),
        ];
        this.addUnaryCond('菱形', input1, eqs);
        this.record('addRhombus', [input1]);
    }
    /** 矩形 ABCD：平行四边形 + 邻边垂直 */
    addRect(input1) {
        const v1 = this.vecOf(input1.slice(0, 2));
        const v2 = this.vecOf(input1[3] + input1[2]); // DC = C - D（对边向量）
        const adj = this.vecOf(input1.slice(1, 3)); // BC
        const eqs = [
            add(v1[0], neg(v2[0])),
            add(v1[1], neg(v2[1])),
            add(mul(v1[0], adj[0]), mul(v1[1], adj[1])),
        ];
        this.addUnaryCond('矩形', input1, eqs);
        this.record('addRect', [input1]);
    }
    /** 正方形 ABCD：平行四边形 + 邻边相等 + 邻边垂直 */
    addSquare(input1) {
        const v1 = this.vecOf(input1.slice(0, 2));
        const v2 = this.vecOf(input1[3] + input1[2]); // DC = C - D（对边向量）
        const adj = this.vecOf(input1.slice(1, 3));
        const eqs = [
            add(v1[0], neg(v2[0])),
            add(v1[1], neg(v2[1])),
            add(this.distOf(input1.slice(0, 2)), neg(this.distOf(input1.slice(1, 3)))),
            add(mul(v1[0], adj[0]), mul(v1[1], adj[1])),
        ];
        this.addUnaryCond('正方形', input1, eqs);
        this.record('addSquare', [input1]);
    }
    /** 等边三角形 ABC：三边相等 */
    addEquilateralTriangle(input1) {
        const s1 = this.distOf(input1.slice(0, 2));
        const s2 = this.distOf(input1.slice(1));
        const s3 = this.distOf(input1[0] + input1[2]);
        this.addUnaryCond('等边三角形', input1, [add(s1, neg(s2)), add(s2, neg(s3))]);
        this.record('addEquilateralTriangle', [input1]);
    }
    // ---------- 查询 ----------
    getSymbolNames() {
        return [...this.symbolNames];
    }
    getPointNames() {
        return [...this.pointNames];
    }
    getCondIds() {
        return [...this.condIds];
    }
    getSymbolsLatex() {
        const out = [];
        for (const name of this.symbolNames) {
            const s = this.mathObjs.get(name);
            // 每条一个符号：id 用符号名（删除下拉 / 重复名校验 / delObjs 直接可用）
            out.push({ id: name, latex: `${s.nameLatex} \\in ${s.domainLatex}` });
        }
        return out;
    }
    getPointsLatex() {
        return this.pointNames.map((name) => {
            const p = this.mathObjs.get(name);
            return {
                id: name,
                latex: `${name} \\left( ${latex(p.x)}, ${latex(p.y)} \\right)`,
            };
        });
    }
    getCondsLatex() {
        return this.condIds.map((id) => {
            const cond = this.mathObjs.get(id);
            return {
                id: cond.id,
                // 列表显示条件本身（如 `AB \perp CD`、`平行四边形 ABCD`），
                // 中文段包 \text{} 否则 KaTeX 不认裸中文；背后的代数方程不影响运算
                latex: cond.id.replace(/[^\x00-\x7F]+\s*/g, (m) => `\\text{${m.trim()} }`),
            };
        });
    }
    /** 依赖闭包（BFS）：删除 id 时需一并删除的对象 */
    getDeeplyRequiredBy(identifier) {
        const result = new Set();
        const visited = new Set([identifier]);
        const queue = [identifier];
        while (queue.length > 0) {
            const current = queue.shift();
            const obj = this.mathObjs.get(current);
            if (obj === undefined)
                continue;
            for (const i of obj.requiredBy) {
                if (!visited.has(i)) {
                    result.add(i);
                    visited.add(i);
                    queue.push(i);
                }
            }
        }
        return [...result];
    }
    delObjs(ids) {
        for (const i of ids) {
            this.mathObjs.delete(i);
            const remove = (l) => {
                const idx = l.indexOf(i);
                if (idx !== -1)
                    l.splice(idx, 1);
            };
            remove(this.symbolNames);
            remove(this.pointNames);
            remove(this.condIds);
        }
        for (const obj of this.mathObjs.values()) {
            for (const i of ids)
                obj.requiredBy.delete(i);
        }
        this.record('delObjs', [ids]);
    }
    // ---------- 求解 ----------
    /**
     * 🚀 启动！求解目标表达式（符号解优先，超出符号能力转数值标注近似）
     * @return 解的行 LaTeX（如 "k_{AB} = 2" 或 "a \approx 1.2599"）
     */
    solve(expr) {
        const left = this.toRawLatex(expr);
        const targetExpr = simplify(this.evalStrExpr(expr));
        // 目标为常数（不含未知数，如 acos 特殊角、给定点的距离）→ 直接输出
        if (!exprHasUnknown(targetExpr, this.symbolNames)) {
            return [`${left} = ${latex(targetExpr)}`];
        }
        const targetEq = add(sym('target'), neg(targetExpr)); // target = expr
        const condEqs = [];
        for (const id of this.condIds) {
            const cond = this.mathObjs.get(id);
            condEqs.push(...cond.eqs);
        }
        const vars = ['target', ...this.symbolNames];
        const signs = new Map();
        for (const name of this.symbolNames) {
            const s = this.mathObjs.get(name);
            if (s.sign !== null)
                signs.set(name, s.sign);
        }
        const res = solveSystem([targetEq, ...condEqs], vars, signs);
        switch (res.kind) {
            case 'solutions': {
                const out = new Set();
                for (const sol of res.solutions) {
                    const t = sol.get('target');
                    if (t !== undefined)
                        out.add(`${left} = ${latex(t)}`);
                }
                return [...out];
            }
            case 'contradiction':
            case 'identity':
                return [];
            case 'unsupported': {
                // 黄灯区：数值兜底
                const nr = solveNumerically([targetEq, ...condEqs], vars);
                if (nr.kind !== 'roots')
                    return [];
                const out = [];
                for (const r of nr.roots) {
                    const tv = r.get('target');
                    if (tv !== undefined)
                        out.push(`${left} \\approx ${fmtNumber(tv)}`);
                }
                return out;
            }
        }
    }
    // ---------- 保存 / 恢复 ----------
    exportHistory() {
        return JSON.parse(JSON.stringify(this.history));
    }
    /** 清零：清空全部对象与历史（等价于重放空历史） */
    reset() {
        this.restoreHistory([]);
    }
    restoreHistory(items) {
        this.mathObjs.clear();
        this.symbolNames = [];
        this.pointNames = [];
        this.condIds = [];
        this.tracker.clear();
        this.history = [];
        for (const item of items) {
            const fn = this[item.op];
            if (typeof fn !== 'function')
                throw new Error(`未知的操作 ${item.op}`);
            fn.apply(this, item.args);
        }
    }
}
/** 表达式是否含有未知数（symbolNames 中的符号） */
function exprHasUnknown(e, unknowns) {
    switch (e.kind) {
        case 'num':
            return false;
        case 'sym':
            return unknowns.includes(e.name);
        case 'add':
            return e.terms.some((t) => exprHasUnknown(t, unknowns));
        case 'mul':
            return e.factors.some((f) => exprHasUnknown(f, unknowns));
        case 'pow':
            return exprHasUnknown(e.base, unknowns);
        case 'sqrt':
            return exprHasUnknown(e.arg, unknowns);
        case 'fn':
            return exprHasUnknown(e.arg, unknowns);
    }
}
/** 数值解格式化：去掉尾零，接近整数时直接输出整数 */
function fmtNumber(x) {
    if (!Number.isFinite(x))
        throw new Error('数值求解失败');
    const sign = x < 0 ? '-' : '';
    const abs = Math.abs(x);
    if (abs < 1e-10)
        return '0';
    if (Math.abs(abs - Math.round(abs)) < 1e-9 && abs < 1e12)
        return sign + String(Math.round(abs));
    let s = abs.toFixed(8).replace(/0+$/, '');
    if (s.endsWith('.'))
        s = s.slice(0, -1);
    return sign + s;
}

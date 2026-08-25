// 方程组求解（P3）
// 策略：线性部分 Gaussian 消元（精确有理数）+ 代换消元 + 一元多项式求根（P2）
// 超出符号能力的（多变量非线性、含 sqrt/fn）由 P4 numeric.ts 数值兜底
//
// 几何约束（平行/垂直/共线/距离/全等/相似/平行四边形等）生成的多为
// 线性方程与二次多项式方程的混合，正是本模块的主战场。
import { add, addRat, fn, invRat, isZeroRat, mul, mulRat, num, pow, powRat, rat, sqrt, subRat, sym, } from './expr.js';
import { polyFromExpr, solvePoly } from './poly.js';
import { exprToFunctionN, evalFloat, matchesSign, multiNewton } from './numeric.js';
const RAT0 = { n: 0n, d: 1n };
// ---------- 代换 ----------
/** 把表达式中所有出现的符号 varName 替换为 value（深度替换后重建规范形） */
export function substitute(e, varName, value) {
    switch (e.kind) {
        case 'num':
            return e;
        case 'sym':
            return e.name === varName ? value : e;
        case 'add':
            return add(...e.terms.map((t) => substitute(t, varName, value)));
        case 'mul': {
            const coeff = num(e.coeff.n, e.coeff.d);
            const factors = e.factors.map((f) => substitute(f, varName, value));
            return mul(coeff, ...factors);
        }
        case 'pow':
            return pow(substitute(e.base, varName, value), e.exp);
        case 'sqrt':
            return sqrt(substitute(e.arg, varName, value));
        case 'fn':
            return fn(e.name, substitute(e.arg, varName, value));
    }
}
function productType(factors, vars) {
    let coeff = { n: 1n, d: 1n };
    let varName = null;
    for (const f of factors) {
        if (f.kind === 'num') {
            coeff = mulRat(coeff, f.rat);
            continue;
        }
        if (f.kind === 'sym') {
            if (!vars.has(f.name))
                return null; // e/pi/其他符号进不了有理系数
            if (varName !== null)
                return null; // 两个变量相乘 → 非线性
            varName = f.name;
            continue;
        }
        if (f.kind === 'pow') {
            const { base, exp } = f;
            if (exp.d === 1n && base.kind === 'sym' && vars.has(base.name) && exp.n === 1n) {
                if (varName !== null)
                    return null;
                varName = base.name;
                continue;
            }
            if (exp.d === 1n && exp.n >= 0n && base.kind === 'num') {
                coeff = mulRat(coeff, rat(powRat(base.rat.n, exp.n), powRat(base.rat.d, exp.n)));
                continue;
            }
            return null; // 分数幂/负幂/非 num base
        }
        return null; // add/sqrt/fn/mul 嵌套 → 非线性
    }
    if (varName === null)
        return { kind: 'const', value: coeff };
    return { kind: 'linear', varName, coeff };
}
/** 把 Expr 化为关于 vars 的线性式 Σcoeff·var + const = 0；非线性返回 null */
export function toLinearEq(e, vars) {
    const coeffs = new Map();
    let cnst = RAT0;
    const rec = (x) => {
        switch (x.kind) {
            case 'num':
                cnst = addRat(cnst, x.rat);
                return true;
            case 'sym':
                if (!vars.has(x.name))
                    return false;
                coeffs.set(x.name, addRat(coeffs.get(x.name) ?? RAT0, rat(1)));
                return true;
            case 'add':
                return x.terms.every(rec);
            case 'mul': {
                // 系数单独存在 mul.coeff（如 2x、-3y、x/2），须乘进提取结果
                const p = productType(x.factors, vars);
                if (p === null)
                    return false;
                const c = x.coeff;
                if (p.kind === 'const')
                    cnst = addRat(cnst, mulRat(c, p.value));
                else
                    coeffs.set(p.varName, addRat(coeffs.get(p.varName) ?? RAT0, mulRat(c, p.coeff)));
                return true;
            }
            case 'pow': {
                const { base, exp } = x;
                if (exp.d === 1n && exp.n >= 0n && base.kind === 'num') {
                    cnst = addRat(cnst, rat(powRat(base.rat.n, exp.n), powRat(base.rat.d, exp.n)));
                    return true;
                }
                if (exp.d === 1n && exp.n === 1n && base.kind === 'sym' && vars.has(base.name)) {
                    coeffs.set(base.name, addRat(coeffs.get(base.name) ?? RAT0, rat(1)));
                    return true;
                }
                return false;
            }
            case 'sqrt':
            case 'fn':
                return false;
        }
    };
    return rec(e) ? { coeffs, const: cnst } : null;
}
/** 解线性方程组：Gaussian-Jordan 消元，精确有理数；欠定时用自由变量参数化 */
export function solveLinearSystem(eqs, vars) {
    if (vars.length === 0) {
        // 无变量：检查是否所有方程都是 0=0
        const ok = eqs.every((eq) => isZeroRat(eq.const) && eq.coeffs.size === 0);
        return ok ? { kind: 'solution', solution: new Map() } : { kind: 'contradiction' };
    }
    const cols = vars.length;
    const m = eqs.map((eq) => {
        const row = vars.map((v) => eq.coeffs.get(v) ?? RAT0);
        row.push(eq.const);
        return row;
    });
    const rows = m.length;
    // 行阶梯 + 消元（Gauss-Jordan）
    const pivotCols = new Set();
    let pivotRow = 0;
    for (let col = 0; col < cols && pivotRow < rows; col++) {
        let pr = -1;
        for (let r = pivotRow; r < rows; r++) {
            if (!isZeroRat(m[r][col])) {
                pr = r;
                break;
            }
        }
        if (pr === -1)
            continue;
        pivotCols.add(col);
        [m[pivotRow], m[pr]] = [m[pr], m[pivotRow]];
        const inv = invRat(m[pivotRow][col]);
        for (let j = col; j <= cols; j++)
            m[pivotRow][j] = mulRat(m[pivotRow][j], inv);
        for (let r = 0; r < rows; r++) {
            if (r === pivotRow)
                continue;
            const f = m[r][col];
            if (isZeroRat(f))
                continue;
            for (let j = col; j <= cols; j++)
                m[r][j] = subRat(m[r][j], mulRat(f, m[pivotRow][j]));
        }
        pivotRow++;
    }
    // 矛盾检测：0 = const（const ≠ 0）
    for (let r = 0; r < rows; r++) {
        const allZero = vars.every((_, c) => isZeroRat(m[r][c]));
        if (allZero && !isZeroRat(m[r][cols]))
            return { kind: 'contradiction' };
    }
    const solution = new Map();
    for (let r = 0; r < pivotRow; r++) {
        // 找该行的主元列
        let pc = -1;
        for (let c = 0; c < cols; c++) {
            if (!isZeroRat(m[r][c])) {
                pc = c;
                break;
            }
        }
        if (pc === -1)
            continue;
        // 增广 [A | const] 消元表示 A·x = const，而真实方程是 A·x = -const
        // 因此 v_pc = -b - Σ_{自由列 c} a_c·v_c（非主元列即自由变量）
        const b = m[r][cols];
        const terms = [];
        for (let c = pc + 1; c < cols; c++) {
            const a = m[r][c];
            if (isZeroRat(a) || pivotCols.has(c))
                continue;
            terms.push(mul(num(a.n, a.d), sym(vars[c])));
        }
        let expr = num(-b.n, b.d);
        for (const t of terms)
            expr = add(expr, negRatTerm(t));
        solution.set(vars[pc], expr);
    }
    return { kind: 'solution', solution };
}
/** 负号项：把 t 的系数取负后作为 add 的项 */
function negRatTerm(t) {
    if (t.kind === 'mul')
        return mul(num(-t.coeff.n, t.coeff.d), ...t.factors);
    return mul(num(-1), t);
}
/**
 * 解方程组（每个方程 = 0）。
 * 流程：线性部分 Gaussian 消元 → 线性解代入非线性方程 → 对自由变量逐个一元求根 → 组合解。
 * 支持：线性系统任意规模；非线性方程代换后为单变量多项式（P2 公式法）。
 * signs：变量 → 取值范围假设（Sign），求根后据此筛根（P4）。
 */
export function solveSystem(eqs, vars, signs) {
    const varSet = new Set(vars);
    const linEqs = [];
    const nonLin = [];
    for (const eq of eqs) {
        const le = toLinearEq(eq, varSet);
        if (le !== null) {
            // 0 = 0 恒等方程跳过
            if (le.coeffs.size === 0 && isZeroRat(le.const))
                continue;
            linEqs.push(le);
        }
        else {
            nonLin.push(eq);
        }
    }
    let lin;
    if (linEqs.length === 0) {
        lin = { kind: 'solution', solution: new Map() };
    }
    else {
        lin = solveLinearSystem(linEqs, vars);
        if (lin.kind === 'contradiction')
            return { kind: 'contradiction' };
    }
    const linearSolution = lin.solution;
    if (nonLin.length === 0) {
        // 纯线性系统
        const out = new Map();
        for (const v of vars)
            out.set(v, linearSolution.get(v) ?? sym(v));
        return finalize([out], signs);
    }
    // 已解出的变量；未解出的即自由变量
    const solvedVars = new Set(linearSolution.keys());
    const freeVars = vars.filter((v) => !solvedVars.has(v));
    // 线性解代入非线性方程
    const reduced = nonLin.map((eq) => {
        let r = eq;
        for (const [v, expr] of linearSolution)
            r = substitute(r, v, expr);
        return r;
    });
    // 只有一个自由变量：对每个方程求根取交集
    if (freeVars.length === 1) {
        const target = freeVars[0];
        let roots = null; // null 表示某方程 unsupported
        for (const eq of reduced) {
            // 恒等/矛盾检查：方程化为常数
            if (eq.kind === 'num') {
                if (isZeroRat(eq.rat))
                    continue;
                return { kind: 'contradiction' };
            }
            const poly = polyFromExpr(eq, target);
            if (poly === null) {
                roots = null;
                break;
            }
            const res = solvePoly(poly);
            if (res.kind !== 'root') {
                if (res.kind === 'identity')
                    continue;
                // 二次方程判别式 < 0：实数域无解，即矛盾
                if (res.kind === 'contradiction' || res.kind === 'noReal')
                    return { kind: 'contradiction' };
                roots = null; // unsupported（三次以上）→ 数值兜底
                break;
            }
            const set = new Set(res.roots.map((r) => keyOfExpr(r)));
            if (roots === null) {
                roots = res.roots;
            }
            else {
                roots = roots.filter((r) => set.has(keyOfExpr(r))); // 交集
            }
        }
        if (roots === null)
            return { kind: 'unsupported' };
        const solutions = roots.map((root) => {
            const out = new Map();
            for (const [v, expr] of linearSolution)
                out.set(v, substitute(expr, target, root));
            out.set(target, root);
            return out;
        });
        return finalize(solutions, signs);
    }
    // 多个自由变量：需数值兜底（P4），符号层暂不支持
    return { kind: 'unsupported' };
}
/** 确定性多初值：原点 + 各坐标 ±1/±2/±5/±10 + 对角方向 */
function defaultGuesses(n) {
    const out = [];
    const push = (g) => {
        const dup = out.some((p) => p.every((v, i) => v === g[i]));
        if (!dup)
            out.push(g);
    };
    push(new Array(n).fill(0));
    for (const mag of [1, 2, 5, 10]) {
        for (const sign of [1, -1]) {
            for (let i = 0; i < n; i++) {
                const g = new Array(n).fill(0);
                g[i] = sign * mag;
                push(g);
            }
            push(new Array(n).fill(sign * mag));
        }
    }
    return out;
}
/**
 * 数值兜底求解（黄灯区）：方程组编译成数值函数后多维牛顿迭代。
 * 多初值找多个解并去重；全部初值都不收敛返回 failed。
 * 返回值标注为数值近似解，前端须与符号解区分展示。
 */
export function solveNumerically(eqs, vars, opts = {}) {
    const n = vars.length;
    if (n === 0)
        return eqs.every((eq) => Math.abs(evalFloat(eq)) < 1e-9) ? { kind: 'roots', roots: [new Map()] } : { kind: 'failed' };
    const F = (xs) => eqs.map((eq) => exprToFunctionN(eq, vars)(xs));
    const tol = opts.tol ?? 1e-8;
    const roots = [];
    for (const g of opts.initial ?? defaultGuesses(n)) {
        const r = multiNewton(F, g, { tol, maxIter: opts.maxIter });
        if (r === null)
            continue;
        const dup = roots.some((prev) => {
            let d = 0;
            for (let i = 0; i < n; i++)
                d += Math.abs(prev.get(vars[i]) - r[i]);
            return d < 1e-6;
        });
        if (!dup)
            roots.push(new Map(vars.map((v, i) => [v, r[i]])));
    }
    return roots.length > 0 ? { kind: 'roots', roots } : { kind: 'failed' };
}
/** 符号假设筛根（P4）：丢弃任一变量不满足 sign 标签的解 */
function finalize(solutions, signs) {
    if (signs === undefined || signs.size === 0) {
        return solutions.length === 0 ? { kind: 'contradiction' } : { kind: 'solutions', solutions };
    }
    const filtered = solutions.filter((sol) => {
        for (const [v, s] of signs) {
            const expr = sol.get(v);
            if (expr !== undefined && !matchesSign(expr, s))
                return false;
        }
        return true;
    });
    return filtered.length === 0 ? { kind: 'contradiction' } : { kind: 'solutions', solutions: filtered };
}
function keyOfExpr(e) {
    switch (e.kind) {
        case 'num':
            return `N${e.rat.n}/${e.rat.d}`;
        case 'sym':
            return `S${e.name}`;
        case 'add':
            return `A(${e.terms.map(keyOfExpr).join(',')})`;
        case 'mul':
            return `M(${e.coeff.n}/${e.coeff.d},${e.factors.map(keyOfExpr).join(',')})`;
        case 'pow':
            return `P(${keyOfExpr(e.base)}^${e.exp.n}/${e.exp.d})`;
        case 'sqrt':
            return `R(${keyOfExpr(e.arg)})`;
        case 'fn':
            return `F${e.name}(${keyOfExpr(e.arg)})`;
    }
}

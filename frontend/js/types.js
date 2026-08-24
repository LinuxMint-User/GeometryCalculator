// 类型注册表：对象类型与条件类型的 schema 定义（schema 驱动表单）。
// 加新类型 = 在这里加一条配置，表单渲染 / 校验 / 提交自动适配，无需新增 UI 板块。
//
// 字段 kinds：
//   text     → md-outlined-text-field（label 用 labelKey，placeholder 用 phKey）
//   checkbox → md-checkbox + 文字（md-checkbox 没有 label 属性，用 <label> 包裹）
//   group    → 分组容器（fields 嵌套），如"取值范围"复选框组
//   hint     → 一段说明文字（textKey）
//
// validate(values) 返回错误信息 key（null = 通过）。错误文案在 i18n 字典里。

import { state } from './state.js';

// 合法符号名：小写英文字母（除 x, y 外）+ 希腊字母英文拼写（除 pi 外）
const VALID_UNKNOWN_NAMES = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
  'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p',
  'q', 'r', 's', 't', 'u', 'v', 'w', 'z',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
];

// 多边形名：n 个不重复的大写字母，且都是已有点
function validPolygonName(name, n) {
  if (name.length !== n || new Set(name).size !== n) return false;
  for (const ch of name) {
    if (!state.points.some((p) => p.id === ch)) return false;
  }
  return true;
}

// 直线名：两个不同的大写字母，且都是已有点
function validLineName(name) {
  if (name.length !== 2 || name[0] === name[1]) return false;
  return [...name].every((ch) => state.points.some((p) => p.id === ch));
}

export const OBJ_TYPES = [
  {
    id: 'unknown',
    labelKey: 'addUnknownTitle',
    api: 'add_symbol',
    fields: [
      { kind: 'text', key: 'name', labelKey: 'unknownName', phKey: 'unknownNamePh' },
      {
        kind: 'select', key: 'domain', labelKey: 'domain', default: 'reals',
        options: [
          { value: 'reals', labelKey: 'domainReals' },
          { value: 'positive', labelKey: 'domainPositive' },
          { value: 'nonnegative', labelKey: 'domainNonnegative' },
          { value: 'negative', labelKey: 'domainNegative' },
          { value: 'nonpositive', labelKey: 'domainNonpositive' },
          { value: 'nonzero', labelKey: 'domainNonzero' },
        ],
      },
    ],
    validate(values) {
      const { name } = values;
      if (!VALID_UNKNOWN_NAMES.includes(name)) return 'errSymbolName';
      if (state.unknowns.some((s) => s.id === name)) return 'errDupName';
      return null;
    },
  },
  {
    id: 'point',
    labelKey: 'addPointTitle',
    api: 'add_point',
    fields: [
      { kind: 'text', key: 'name', labelKey: 'pointName', phKey: 'pointNamePh' },
      { kind: 'hint', key: 'pointHint', textKey: 'pointHint' },
      { kind: 'text', key: 'x', labelKey: 'xCoord', phKey: 'xCoordPh' },
      { kind: 'text', key: 'y', labelKey: 'yCoord', phKey: 'yCoordPh' },
      { kind: 'text', key: 'line1', labelKey: 'line1', phKey: 'linePh' },
      { kind: 'text', key: 'line2', labelKey: 'line2', phKey: 'linePh' },
    ],
    validate(values) {
      const { name, x, y, line1, line2 } = values;
      if (state.points.some((p) => p.id === name)) return 'errDupName';
      if (!/^[A-Z]$/.test(name)) return 'errPointName';
      const filled = [x, y, line1, line2].filter((v) => v.length > 0);
      if (filled.length !== 2) return 'errPointFill';
      // 填了直线必须合法
      if (line1 && !validLineName(line1)) return 'errLineName';
      if (line2 && !validLineName(line2)) return 'errLineName';
      return null;
    },
  },
  {
    id: 'cond',
    labelKey: 'addCondTitle',
    condTypes: [
      { id: 'expr_eq', labelKey: 'condEq', relOp: '=', arity: 2, api: 'addExprEq' },
      { id: 'parallel', labelKey: 'condParallel', relOp: '\\parallel', arity: 2, api: 'addParallel' },
      { id: 'perp', labelKey: 'condPerp', relOp: '\\perp', arity: 2, api: 'addPerp' },
      { id: 'cong', labelKey: 'condCong', relOp: '\\cong', arity: 2, triangle: true, api: 'addCong' },
      { id: 'sim', labelKey: 'condSim', relOp: '\\sim', arity: 2, triangle: true, api: 'addSim' },
      { id: 'parallelogram', labelKey: 'condPara', arity: 1, api: 'addParallelogram' },
      { id: 'rhombus', labelKey: 'condRhombus', arity: 1, api: 'addRhombus' },
      { id: 'rect', labelKey: 'condRect', arity: 1, api: 'addRect' },
      { id: 'square', labelKey: 'condSquare', arity: 1, api: 'addSquare' },
      { id: 'equilateral', labelKey: 'condEqui', arity: 1, api: 'addEquilateralTriangle' },
    ],
    // 校验条件输入；condType 为当前条件类型定义
    validateCond(condType, inputs) {
      const [a, b] = inputs;
      if (condType.arity === 1) {
        if (condType.id === 'equilateral') {
          return validPolygonName(a, 3) ? null : 'errTriangleName';
        }
        return validPolygonName(a, 4) ? null : 'errQuadName';
      }
      if (condType.id === 'expr_eq') {
        return a.length > 0 && b.length > 0 ? null : 'errCondInput';
      }
      if (condType.id === 'parallel' || condType.id === 'perp') {
        return validLineName(a) && validLineName(b) ? null : 'errLineName';
      }
      // 全等 / 相似
      return validPolygonName(a, 3) && validPolygonName(b, 3) ? null : 'errTriangleName';
    },
  },
];

export const DEFAULT_OBJ_TYPE = 'unknown';
export const DEFAULT_COND_TYPE = 'expr_eq';

// 取值范围下拉值 → 后端 {negative, zero, positive} 三布尔结构
export const DOMAIN_SETS = {
  reals: { negative: true, zero: true, positive: true },
  positive: { negative: false, zero: false, positive: true },
  nonnegative: { negative: false, zero: true, positive: true },
  negative: { negative: true, zero: false, positive: false },
  nonpositive: { negative: true, zero: true, positive: false },
  nonzero: { negative: true, zero: false, positive: true },
};

export function getObjType(id) {
  return OBJ_TYPES.find((t) => t.id === id);
}

export function getCondType(id) {
  return OBJ_TYPES.find((t) => t.id === 'cond').condTypes.find((c) => c.id === id);
}

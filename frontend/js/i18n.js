// 极简 i18n：一个字典 + data-i18n 属性替换，不引任何库。
// 用法：<span data-i18n="key"></span>、<md-outlined-text-field data-i18n-label="key"></md-outlined-text-field>

const zh = {
  appTitle: '几何计算器',
  menuBtnAria: '打开菜单',
  menuLangLabel: '切换语言',
  themeLabel: '深色模式',
  clearLocal: '清除本地偏好',
  clearedLocal: '已清除本地偏好',
  menuReset: '重置计算器',
  tabAdd: '添加',
  tabSolve: '求解',
  tabDocs: '文档',
  docVersion: '文档版本',
  docGroupOriginal: '原版文档',
  docGroupMaintainer: '维护者文档',
  addUnknownTitle: '未知数',
  addTypeLabel: '类型',
  addTitle: '添加对象',
  unknownName: '名称',
  unknownNamePh: '小写字母或希腊字母拼写（如 a、theta）',
  domain: '取值范围',
  domainNeg: '负数',
  domainZero: '零',
  domainPos: '正数',
  addBtn: '添加',
  addPointTitle: '点',
  pointName: '名称',
  pointNamePh: '单个大写字母',
  pointHint: '点需 2 个独立条件确定：坐标 (x, y)、坐标 + 所在直线、或两条所在直线，恰好填 2 项',
  coordGroup: '坐标',
  xCoord: 'x',
  yCoord: 'y',
  xCoordPh: '表达式（如 2a）或 x 表示未知横坐标',
  yCoordPh: '表达式（如 2a）或 y 表示未知纵坐标',
  lineGroup: '所在直线',
  line1: '直线 1',
  line2: '直线 2',
  linePh: '两个已有点字母，如 AB 表示过 A、B 的直线',
  addCondTitle: '条件',
  condType: '条件类型',
  condEq: '表达式相等 =',
  condParallel: '平行 ∥',
  condPerp: '垂直 ⊥',
  condCong: '三角形全等 ≅',
  condSim: '三角形相似 ∼',
  input1: '输入 1',
  input2: '输入 2',
  condPara: '平行四边形',
  condRhombus: '菱形',
  condRect: '矩形',
  condSquare: '正方形',
  condEqui: '等边三角形',
  input: '输入',
  errUnknownName: '名称必须是合法符号名（小写字母或希腊字母拼写）',
  errSymbolName: '名称必须是合法符号名（小写字母或希腊字母拼写，x/y 为坐标保留）',
  errDupName: '名称已存在',
  errEmptyDomain: '取值范围不能为空（至少勾选负数 / 零 / 正数中的一项）',
  errPointName: '点名称必须是单个大写字母',
  errPointFill: '横/纵坐标与所在直线需恰好填写 2 项',
  errLineName: '直线名必须是两个不同的已有点组成（如 AB）',
  errTriangleName: '必须是合法的三角形名（3 个不重复的已有点）',
  errQuadName: '必须是合法的四边形名（4 个不重复的已有点）',
  errCondInput: '输入不能为空',
  noSolution: '无解',
  solveTimeout: '求解超时（60 秒）',
  objListTitle: '对象列表',
  unknowns: '未知数',
  points: '点',
  conds: '条件',
  delSelect: '选择要删除的对象',
  delBtn: '删除',
  delSuccess: '已删除',
  statusAria: '操作状态',
  statusTitle: '操作状态',
  statusOk: '最近一次操作成功',
  statusWarn: '最近一次操作有警告',
  statusError: '最近一次操作失败',
  errHint: '遇到错误，请点击右上角状态指示器查看详情',
  closeBtn: '关闭',
  errNoDelSelect: '请先选择要删除的对象',
  previewNoDel: '预览模式不支持删除',
  solveTitle: '计算求解',
  solveExpr: '请输入要计算的表达式',
  solveBtn: '🚀 启动！',
  delTitle: '删除对象',
  delDepHint: '将一并删除：',
  resetTitle: '重置计算器',
  resetHint: '将清空所有未知数、点和条件，且不可撤销。',
  resetBtn: '重置',
  resetSuccess: '已重置',
  cancel: '取消',
  confirm: '确认',
  themeAria: '切换浅色/深色主题',
  navAria: '主导航',
  progressAria: '求解进行中',
};

const en = {
  appTitle: 'Geometry Calculator',
  menuBtnAria: 'Open menu',
  menuLangLabel: 'Switch language',
  themeLabel: 'Dark mode',
  clearLocal: 'Clear local preferences',
  clearedLocal: 'Local preferences cleared',
  menuReset: 'Reset calculator',
  tabAdd: 'Add',
  tabSolve: 'Solve',
  tabDocs: 'Docs',
  docVersion: 'Docs version',
  docGroupOriginal: 'Original docs',
  docGroupMaintainer: 'Maintainer docs',
  addUnknownTitle: 'Unknown',
  addTypeLabel: 'Type',
  addTitle: 'Add Object',
  unknownName: 'Name',
  unknownNamePh: 'lowercase letter or Greek name (e.g. a, theta)',
  domain: 'Domain',
  domainNeg: 'Negative',
  domainZero: 'Zero',
  domainPos: 'Positive',
  addBtn: 'Add',
  addPointTitle: 'Point',
  pointName: 'Name',
  pointNamePh: 'single uppercase letter',
  pointHint: 'A point needs 2 independent conditions: coordinates (x, y), a coordinate + a line through it, or two lines through it. Fill exactly 2.',
  coordGroup: 'Coordinates',
  xCoord: 'x',
  yCoord: 'y',
  xCoordPh: 'expression (e.g. 2a) or x for unknown x-coordinate',
  yCoordPh: 'expression (e.g. 2a) or y for unknown y-coordinate',
  lineGroup: 'Lines through the point',
  line1: 'Line 1',
  line2: 'Line 2',
  linePh: 'two existing points, e.g. AB = line through A and B',
  addCondTitle: 'Condition',
  condType: 'Condition Type',
  condEq: 'Equal =',
  condParallel: 'Parallel ∥',
  condPerp: 'Perpendicular ⊥',
  condCong: 'Congruent Triangles ≅',
  condSim: 'Similar Triangles ∼',
  input1: 'Input 1',
  input2: 'Input 2',
  condPara: 'Parallelogram',
  condRhombus: 'Rhombus',
  condRect: 'Rectangle',
  condSquare: 'Square',
  condEqui: 'Equilateral Triangle',
  input: 'Input',
  errUnknownName: 'Name must be a valid symbol name (lowercase letter or Greek name)',
  errSymbolName: 'Name must be a valid symbol name (lowercase letter or Greek name, x/y reserved for coordinates)',
  errDupName: 'Name already exists',
  errPointName: 'Point name must be a single uppercase letter',
  errPointFill: 'Fill exactly 2 of x, y or two lines',
  errLineName: 'Line name must be two distinct existing points (e.g. AB)',
  errTriangleName: 'Must be a valid triangle name (3 distinct existing points)',
  errQuadName: 'Must be a valid quadrilateral name (4 distinct existing points)',
  errCondInput: 'Input cannot be empty',
  errEmptyDomain: 'Domain cannot be empty (check at least one of Negative / Zero / Positive)',
  noSolution: 'No solution',
  solveTimeout: 'Solve timed out (60s)',
  objListTitle: 'Objects',
  unknowns: 'Unknowns',
  points: 'Points',
  conds: 'Conditions',
  delSelect: 'Select object to delete',
  delBtn: 'Delete',
  delSuccess: 'Deleted',
  statusAria: 'Operation status',
  statusTitle: 'Operation Status',
  statusOk: 'Last operation succeeded',
  statusWarn: 'Last operation had a warning',
  statusError: 'Last operation failed',
  errHint: 'An error occurred. Click the status indicator (top-right) for details.',
  closeBtn: 'Close',
  errNoDelSelect: 'Select an object to delete first',
  previewNoDel: 'Deletion is not available in preview mode',
  solveTitle: 'Solve',
  solveExpr: 'Enter expression to solve',
  solveBtn: '🚀 Go!',
  delTitle: 'Delete Object',
  delDepHint: 'Will also be deleted: ',
  resetTitle: 'Reset calculator',
  resetHint: 'This clears all unknowns, points and conditions. This cannot be undone.',
  resetBtn: 'Reset',
  resetSuccess: 'Reset done',
  cancel: 'Cancel',
  confirm: 'OK',
  themeAria: 'Toggle light/dark theme',
  navAria: 'Main navigation',
  progressAria: 'Solving in progress',
};

const dicts = { 'zh-CN': zh, 'en-US': en };

let currentLang = 'zh-CN';

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (!dicts[lang]) lang = 'zh-CN'; // 非法语言值回退中文，避免 dicts[lang] 为 undefined
  currentLang = lang;
  document.documentElement.lang = lang;
  document.title = dicts[lang].appTitle;
  const dict = dicts[lang];
  // 替换普通文本节点
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) el.textContent = dict[key];
  });
  // 替换组件文字（md-button 系：文字走 light DOM slot，label 属性仅用于 aria；
  // md-outlined-text-field 等：label 是 property，setAttribute 有效）
  const MD_BUTTON_TAGS = [
    'MD-TEXT-BUTTON',
    'MD-FILLED-BUTTON',
    'MD-OUTLINED-BUTTON',
    'MD-ELEVATED-BUTTON',
    'MD-TONAL-BUTTON',
  ];
  document.querySelectorAll('[data-i18n-label]').forEach((el) => {
    const key = el.dataset.i18nLabel;
    if (dict[key] === undefined) return;
    if (MD_BUTTON_TAGS.includes(el.tagName)) el.textContent = dict[key];
    else el.setAttribute('label', dict[key]);
  });
  // 替换 aria-label（读屏无障碍）
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.dataset.i18nAria;
    if (dict[key] !== undefined) el.setAttribute('aria-label', dict[key]);
  });
  // 通知其他模块（如动态渲染的列表）
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang, dict } }));
}

export function t(key) {
  return dicts[currentLang][key] ?? key;
}

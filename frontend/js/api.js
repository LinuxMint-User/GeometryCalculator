// 桥接层：前端与计算核心的唯一 IO 出入口。
// 桌面版走 pywebview（window.pywebview.api.problem）；
// 未来网页版接 pyodide 时，只需替换本文件的实现，页面逻辑不动。

function getBridge() {
  return window.pywebview?.api?.problem;
}

// 无桥环境（纯浏览器预览）时打印提示
const bridge = getBridge();
if (!bridge) {
  console.warn('[api] 未检测到 pywebview 桥，运行在浏览器预览模式（操作不会真正生效）');
}

export const api = {
  addUnknown: (name, domainSettings) => bridge.add_symbol(name, domainSettings),
  addPoint: (name, xStr, yStr, line1, line2) =>
    bridge.add_point(name, xStr, yStr, line1, line2),

  addExprEq: (input1, input2) => bridge.add_expr_eq(input1, input2),
  addParallel: (input1, input2) => bridge.add_parallel(input1, input2),
  addPerp: (input1, input2) => bridge.add_perp(input1, input2),
  addCong: (input1, input2) => bridge.add_cong(input1, input2),
  addSim: (input1, input2) => bridge.add_sim(input1, input2),

  addParallelogram: (input1) => bridge.add_parallelogram(input1),
  addRhombus: (input1) => bridge.add_rhombus(input1),
  addRect: (input1) => bridge.add_rect(input1),
  addSquare: (input1) => bridge.add_square(input1),
  addEquilateralTriangle: (input1) => bridge.add_equilateral_triangle(input1),

  getUnknownNames: () => bridge.get_symbol_names(),
  getPointNames: () => bridge.get_point_names(),
  getCondIds: () => bridge.get_cond_ids(),

  getUnknownsLatex: () => bridge.get_symbols_latex(),
  getPointsLatex: () => bridge.get_points_latex(),
  getCondsLatex: () => bridge.get_conds_latex(),

  getDeeplyRequiredBy: (id) =>
    bridge
      ? bridge.get_deeply_required_by(id)
      : Promise.resolve(['B', 'C']), // 预览模式 mock，便于体验删除确认流程
  delObjs: (ids) => bridge.del_objs(ids),

  saveToFile: () => bridge.save_to_file(),
  loadFromFile: () => bridge.load_from_file(),

  solve: (expr) => bridge.solve(expr),
};

export const hasBridge = Boolean(bridge);

// 桥接层：前端与计算核心的唯一 IO 出入口。
// 计算核心为 TS 引擎（backend/src/core 编译产物 frontend/engine/），
// 页面逻辑不感知引擎形态，这里只是把前端调用映射到 Problem 实例方法。

import { Problem } from '../engine/gc.js';

// 问题单例：整个页面生命周期共用一个（跨页面刷新由 localStorage 历史重放恢复）
const problem = new Problem();

// 本地持久化：把操作历史序列化保存，刷新页面后重放恢复
const STORAGE_KEY = 'gc-problem-history';

export const api = {
  addUnknown: (name, domainSettings) => problem.addSymbol(name, domainSettings),
  // types.js 的 api 字段沿用旧桥命名，这里保持兼容
  add_symbol: (name, domainSettings) => problem.addSymbol(name, domainSettings),
  addPoint: (name, xStr, yStr, line1, line2) => problem.addPoint(name, xStr, yStr, line1, line2),
  add_point: (name, xStr, yStr, line1, line2) => problem.addPoint(name, xStr, yStr, line1, line2),

  addExprEq: (input1, input2) => problem.addExprEq(input1, input2),
  addParallel: (input1, input2) => problem.addParallel(input1, input2),
  addPerp: (input1, input2) => problem.addPerp(input1, input2),
  addCong: (input1, input2) => problem.addCong(input1, input2),
  addSim: (input1, input2) => problem.addSim(input1, input2),

  addParallelogram: (input1) => problem.addParallelogram(input1),
  addRhombus: (input1) => problem.addRhombus(input1),
  addRect: (input1) => problem.addRect(input1),
  addSquare: (input1) => problem.addSquare(input1),
  addEquilateralTriangle: (input1) => problem.addEquilateralTriangle(input1),

  getUnknownNames: () => problem.getSymbolNames(),
  getPointNames: () => problem.getPointNames(),
  getCondIds: () => problem.getCondIds(),

  getUnknownsLatex: () => problem.getSymbolsLatex(),
  getPointsLatex: () => problem.getPointsLatex(),
  getCondsLatex: () => problem.getCondsLatex(),

  getDeeplyRequiredBy: (id) => problem.getDeeplyRequiredBy(id),
  delObjs: (ids) => problem.delObjs(ids),

  // 浏览器模式持久化：localStorage 存历史，loadFromFile 重放恢复
  saveToFile: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(problem.exportHistory()));
    } catch (e) {
      // localStorage 不可用（隐私模式等）时静默跳过，不阻塞操作
      console.warn('[api] 历史保存失败', e);
    }
  },
  loadFromFile: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      problem.restoreHistory(JSON.parse(raw));
      return true;
    } catch (e) {
      console.warn('[api] 历史恢复失败', e);
      return false;
    }
  },

  solve: (expr) => problem.solve(expr),
};

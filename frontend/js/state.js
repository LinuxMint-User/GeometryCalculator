// 全局状态 + 刷新编排。数据源是后端（通过 api.js），这里只是缓存与分发。

import { api } from './api.js';

export const state = {
  unknowns: [], // Array<{id, latex}>
  points: [],
  conds: [],
};

let onChange = null;

export function setOnChange(fn) {
  onChange = fn;
}

function notify() {
  onChange?.();
}

// 从后端拉全量数据并通知渲染
export async function refresh() {
  const [unknowns, points, conds] = await Promise.all([
    api.getUnknownsLatex(),
    api.getPointsLatex(),
    api.getCondsLatex(),
  ]);
  state.unknowns = unknowns ?? [];
  state.points = points ?? [];
  state.conds = conds ?? [];
  notify();
}

// 执行一次后端操作后统一刷新
export async function act(fn) {
  await fn();
  await refresh();
}

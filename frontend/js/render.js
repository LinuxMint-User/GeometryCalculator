// DOM 渲染：对象列表、删除下拉、求解结果、添加表单。全部走"全量重建"，避免增量 DOM 的坑。

import katex from 'katex';
import { state } from './state.js';
import { getObjType, getCondType, DEFAULT_COND_TYPE } from './types.js';
import { t } from './i18n.js';

// HTML 转义（所有动态内容拼入 innerHTML 前必须经过这里）
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 渲染一段 LaTeX 为 HTML（display 模式用于公式列表）
export function renderLatex(latexStr, displayMode = true) {
  return katex.renderToString(latexStr, {
    throwOnError: false,
    displayMode,
  });
}

// 把 {id, latex} 列表渲染进容器
export function renderObjList(container, items) {
  container.innerHTML = items
    .map((item) => `<div class="obj-item">${renderLatex(item.latex)}</div>`)
    .join('');
}

// 重建删除下拉框的选项并复位选中态。
// 注意不能靠 select.value='' 清空：value setter 走 select()，空值找不到匹配 option 是 no-op，
// displayText 会残留被删对象；reset() 会遍历 options 取消选中并重算显示文本。
export async function renderDelOptions(select, items) {
  const opts = items.map(
    (item) => `<md-select-option value="${escapeHtml(item.id)}">${escapeHtml(item.id)}</md-select-option>`,
  );
  select.innerHTML = opts.join('');
  // 先等 menu 完成 slot 分配（新选项就位、listController 缓存更新），再复位选中态
  await select.updateComplete;
  select.reset();
  await select.updateComplete;
}

// 渲染全部列表（由 state 变更触发）
export async function renderAll() {
  renderObjList(document.getElementById('unknown-list'), state.unknowns);
  renderObjList(document.getElementById('point-list'), state.points);
  renderObjList(document.getElementById('cond-list'), state.conds);

  const delSelect = document.getElementById('del-select');
  const all = [...state.unknowns, ...state.points, ...state.conds];
  await renderDelOptions(delSelect, all);
}

// 求解结果（纯文本 LaTeX 行）
export function renderResults(container, results) {
  container.innerHTML = results
    .map((r) => `<div class="obj-item">${renderLatex(r)}</div>`)
    .join('');
}

/* ---------------- 添加表单（schema 驱动） ---------------- */

// 渲染单个字段（f 为 schema 定义），生成元素 id = `${typeId}-${field.key}`
function renderField(typeId, f) {
  const id = `${typeId}-${f.key}`;
  switch (f.kind) {
    case 'text':
      return `<md-outlined-text-field id="${id}" data-label-key="${f.labelKey}" data-ph-key="${f.phKey}" label="${t(f.labelKey)}" placeholder="${t(f.phKey)}"></md-outlined-text-field>`;
    case 'select':
      return `<md-outlined-select id="${id}" data-label-key="${f.labelKey}" data-default="${f.default ?? ''}" data-options='${JSON.stringify(f.options)}' label="${t(f.labelKey)}">${f.options
        .map((o) => `<md-select-option value="${o.value}" data-label-key="${o.labelKey}">${t(o.labelKey)}</md-select-option>`)
        .join('')}</md-outlined-select>`;
    case 'checkbox':
      return `<label class="domain-option"><md-checkbox id="${id}"${f.default ? ' checked' : ''}></md-checkbox><span data-label-key="${f.labelKey}">${t(f.labelKey)}</span></label>`;
    case 'hint':
      return `<div class="form-hint" data-text-key="${f.textKey}">${t(f.textKey)}</div>`;
    case 'group':
      return `<div class="form-group"><span class="form-group-label" data-label-key="${f.labelKey}">${t(f.labelKey)}</span><div class="form-group-fields">${f.fields
        .map((cf) => renderField(typeId, cf))
        .join('')}</div></div>`;
    default:
      return '';
  }
}

// 条件输入区：二元 → 输入1 (relOp) 输入2；一元 → 单输入
export function renderCondInputs(container, condTypeId) {
  const condType = getCondType(condTypeId);
  if (condType.arity === 2) {
    const relOp = renderLatex(condType.relOp, false);
    const tri = condType.triangle ? renderLatex('\\triangle', false) : '';
    container.innerHTML = `
      <div class="cond-row">
        ${tri}<md-outlined-text-field id="cond-in-1" label="${t('input1')}"></md-outlined-text-field>
        <span class="cond-relop">${relOp}</span>
        ${tri}<md-outlined-text-field id="cond-in-2" label="${t('input2')}"></md-outlined-text-field>
      </div>`;
  } else {
    container.innerHTML = `
      <md-outlined-text-field id="cond-in-1" label="${t('input')}"></md-outlined-text-field>`;
  }
}

// 语言切换时只刷新表单文案（label / placeholder / 提示 / 分组标签），不重建 DOM，保留输入值
export function updateFormLabels(formEl = document.getElementById('add-form')) {
  formEl.querySelectorAll('md-outlined-text-field[data-label-key]').forEach((el) => {
    el.setAttribute('label', t(el.dataset.labelKey));
    el.setAttribute('placeholder', t(el.dataset.phKey));
  });
  formEl.querySelectorAll('.form-hint[data-text-key]').forEach((el) => {
    el.textContent = t(el.dataset.textKey);
  });
  formEl.querySelectorAll('[data-label-key]').forEach((el) => {
    if (el.tagName === 'SPAN') el.textContent = t(el.dataset.labelKey);
  });
  // 通用 select 字段：刷新 label + 重建选项文本（displayText 快照问题）+ 保留当前值
  formEl.querySelectorAll('md-outlined-select[data-options]').forEach(async (sel) => {
    const opts = JSON.parse(sel.dataset.options);
    const value = sel.value;
    sel.setAttribute('label', t(sel.dataset.labelKey));
    sel.innerHTML = opts
      .map((o) => `<md-select-option value="${o.value}" data-label-key="${o.labelKey}">${t(o.labelKey)}</md-select-option>`)
      .join('');
    await Promise.all([...sel.querySelectorAll('md-select-option')].map((o) => o.updateComplete));
    await new Promise((r) => requestAnimationFrame(r));
    sel.value = value;
    await sel.updateComplete;
  });
  // 条件输入区：输入 1 / 输入 2 / 输入 标签
  formEl.querySelectorAll('#cond-inputs md-outlined-text-field').forEach((el) => {
    const key = el.id === 'cond-in-1' ? 'input1' : el.id === 'cond-in-2' ? 'input2' : 'input';
    el.setAttribute('label', t(key));
  });
  const condSel = formEl.querySelector('#cond-type');
  if (condSel) condSel.setAttribute('label', t('condType'));
}

// 渲染"添加"表单（主类型下拉下方的动态区）
export async function renderAddForm(typeId, formEl = document.getElementById('add-form')) {
  const typeDef = getObjType(typeId);
  let html = typeDef.fields
    ? typeDef.fields.map((f) => renderField(typeId, f)).join('')
    : '';
  formEl.innerHTML = html;
  // 条件类型：追加条件类型下拉 + 输入区
  if (typeDef.id === 'cond') {
    const opts = typeDef.condTypes
      .map((c) => `<md-select-option value="${c.id}">${t(c.labelKey)}</md-select-option>`)
      .join('');
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <md-outlined-select id="cond-type" label="${t('condType')}">${opts}</md-outlined-select>
      <div id="cond-inputs"></div>`;
    // 先保存引用再移动：appendChild 会把节点移出 wrap，children 索引会变
    const select = wrap.firstElementChild;
    const inputs = wrap.querySelector('#cond-inputs');
    formEl.appendChild(select);
    formEl.appendChild(inputs);
    // 时序修复：等选项 upgrade + 一帧后再设 value，否则 displayText 不同步（同 main.js 版本下拉）
    await Promise.all([...select.querySelectorAll('md-select-option')].map((o) => o.updateComplete));
    await new Promise((r) => requestAnimationFrame(r));
    select.value = DEFAULT_COND_TYPE;
    await select.updateComplete;
    renderCondInputs(formEl.querySelector('#cond-inputs'), DEFAULT_COND_TYPE);
    select.addEventListener('change', () => {
      renderCondInputs(formEl.querySelector('#cond-inputs'), select.value);
    });
  }
  // 通用 select 字段：等选项 upgrade + 一帧后设默认值（displayText 同步）
  for (const sel of formEl.querySelectorAll('md-outlined-select[data-options]')) {
    const opts = JSON.parse(sel.dataset.options);
    await Promise.all([...sel.querySelectorAll('md-select-option')].map((o) => o.updateComplete));
    await new Promise((r) => requestAnimationFrame(r));
    sel.value = opts.find((o) => o.value === sel.getAttribute('data-default'))?.value ?? opts[0].value;
    await sel.updateComplete;
  }
  // checkbox 文字点击联动（自定义元素无法被 label for 原生关联）
  formEl.querySelectorAll('.domain-option').forEach((label) => {
    label.addEventListener('click', (e) => {
      if (e.target.tagName === 'MD-CHECKBOX') return;
      const cb = label.querySelector('md-checkbox');
      cb.checked = !cb.checked;
    });
  });
}

// 收集表单值：{ fieldKey: value }（含 group 内 checkbox 扁平化）
export function collectFormValues(typeId, formEl = document.getElementById('add-form')) {
  const typeDef = getObjType(typeId);
  const values = {};
  for (const f of typeDef.fields ?? []) {
    if (f.kind === 'group') {
      for (const cf of f.fields) {
        values[cf.key] = formEl.querySelector(`#${typeId}-${cf.key}`).checked;
      }
    } else if (f.kind === 'text') {
      values[f.key] = formEl.querySelector(`#${typeId}-${f.key}`).value;
    } else if (f.kind === 'select') {
      values[f.key] = formEl.querySelector(`#${typeId}-${f.key}`).value;
    }
  }
  return values;
}

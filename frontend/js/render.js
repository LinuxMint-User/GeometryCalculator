// DOM 渲染：对象列表、删除下拉、求解结果、添加表单。全部走"全量重建"，避免增量 DOM 的坑。

import katex from 'katex';
import { state } from './state.js';
import { getObjType, getCondType, DEFAULT_COND_TYPE } from './types.js';
import { t } from './i18n.js';

// HTML 转义（所有动态内容拼入 innerHTML 前必须经过这里）
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- choice-bar：轻量单选组件 ----------------
   一组按钮 + 选中态（.active），替代 md-outlined-select。
   不依赖 popover API（md-select 内部走 popover，Chrome 114+ 才有），
   Chrome 85 及以下原生可用。结构：
     <div class="choice-bar" id="xxx" role="radiogroup" aria-label="...">
       <button class="choice-btn" data-value="a" role="radio" aria-checked="false">标签</button>
       <button class="choice-btn active" data-value="b" role="radio" aria-checked="true">标签</button>
     </div>
   options: [{ value, labelKey?, label? }]；selectedValue 为初始选中值
   value 缺省时回退用 id（条件类型等只定义 id 的数据结构） */

export function renderChoiceBarHTML(id, options, selectedValue, opts = {}) {
  const items = options
    .map((o) => {
      const val = o.value ?? o.id;
      const label = o.label ?? t(o.labelKey);
      const on = val === selectedValue;
      const lk = o.labelKey ? ` data-label-key="${o.labelKey}"` : '';
      return `<button type="button" class="choice-btn${on ? ' active' : ''}" data-value="${escapeHtml(val)}" role="radio" aria-checked="${on}"${lk}>${escapeHtml(label)}</button>`;
    })
    .join('');
  const ariaLabel = opts.ariaKey ? t(opts.ariaKey) : opts.labelKey ? t(opts.labelKey) : '';
  const ariaAttr = ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : '';
  const labelAttr = opts.labelKey ? ` data-i18n-label="${opts.labelKey}"` : '';
  const cls = opts.className ? ` ${opts.className}` : '';
  return `<div class="choice-bar${cls}" id="${id}" role="radiogroup"${ariaAttr}${labelAttr}>${items}</div>`;
}

// 读取选中值（无选中返回 ''）
export function getChoiceValue(id) {
  const bar = document.getElementById(id);
  if (!bar) return '';
  const active = bar.querySelector('.choice-btn.active');
  return active ? active.dataset.value : '';
}

// 设置选中值（单选互斥）
export function setChoiceValue(id, value) {
  const bar = document.getElementById(id);
  if (!bar) return;
  bar.querySelectorAll('.choice-btn').forEach((b) => {
    const on = b.dataset.value === value;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

// 绑定点击切换 + change 回调
export function bindChoiceBar(id, onChange) {
  const bar = document.getElementById(id);
  if (!bar) return;
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.choice-btn');
    if (!btn || !bar.contains(btn)) return;
    bar.querySelectorAll('.choice-btn').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    if (onChange) onChange(btn.dataset.value);
  });
}

// i18n 刷新：按 data-label-key 重译按钮文字 + radiogroup aria-label
export function refreshChoiceLabels(id) {
  const bar = document.getElementById(id);
  if (!bar) return;
  bar.querySelectorAll('.choice-btn[data-label-key]').forEach((b) => {
    b.textContent = t(b.dataset.labelKey);
  });
  if (bar.dataset.i18nLabel) bar.setAttribute('aria-label', t(bar.dataset.i18nLabel));
}

// 渲染一段 LaTeX 为 HTML（display 模式用于公式列表）
export function renderLatex(latexStr, displayMode = true) {
  return katex.renderToString(latexStr, {
    throwOnError: false,
    displayMode,
  });
}

// 渲染含中文的混合 latex（如条件 id `平行四边形 ABCD`）：
// KaTeX 不认裸中文（会红字报错），把连续非 ASCII 段包 \text{} 后再渲染
export function renderMixedLatex(str, displayMode = true) {
  const s = String(str).replace(/[^\x00-\x7F]+\s*/g, (m) => `\\text{${m.trim()} }`);
  return renderLatex(s, displayMode);
}

// 把 {id, latex} 列表渲染进容器；每项带删除按钮（×），点击触发删除（事件委托在 main.js 绑定）
export function renderObjList(container, items) {
  container.innerHTML = items
    .map(
      (item) =>
        `<div class="obj-item">${renderLatex(item.latex)}<button type="button" class="obj-del-btn" data-id="${escapeHtml(item.id)}" aria-label="${t('delBtn')}：${escapeHtml(item.id)}" title="${t('delBtn')}">×</button></div>`,
    )
    .join('');
}

// 渲染全部列表（由 state 变更触发）
export function renderAll() {
  renderObjList(document.getElementById('unknown-list'), state.unknowns);
  renderObjList(document.getElementById('point-list'), state.points);
  renderObjList(document.getElementById('cond-list'), state.conds);
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
      // 通用下拉：用 choice-bar 替代 md-outlined-select（不依赖 popover）
      return renderChoiceBarHTML(id, f.options, f.default ?? '', { labelKey: f.labelKey });
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
  // 通用 choice-bar 字段：刷新按钮文字 + radiogroup aria-label（替代 md-select 重建）
  formEl.querySelectorAll('.choice-bar[data-i18n-label]').forEach((bar) => {
    refreshChoiceLabels(bar.id);
  });
  // 条件输入区：输入 1 / 输入 2 / 输入 标签
  formEl.querySelectorAll('#cond-inputs md-outlined-text-field').forEach((el) => {
    const key = el.id === 'cond-in-1' ? 'input1' : el.id === 'cond-in-2' ? 'input2' : 'input';
    el.setAttribute('label', t(key));
  });
  // 条件类型 choice-bar：刷新按钮文字 + aria-label
  const condBar = formEl.querySelector('#cond-type');
  if (condBar) refreshChoiceLabels('cond-type');
}

// 渲染"添加"表单（主类型选择下方的动态区）。choice-bar 即时可用，无需 upgrade 时序
export function renderAddForm(typeId, formEl = document.getElementById('add-form')) {
  const typeDef = getObjType(typeId);
  let html = typeDef.fields
    ? typeDef.fields.map((f) => renderField(typeId, f)).join('')
    : '';
  formEl.innerHTML = html;
  // 条件类型：追加 choice-bar + 输入区（替代 md-outlined-select，不依赖 popover）
  if (typeDef.id === 'cond') {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      renderChoiceBarHTML('cond-type', typeDef.condTypes, DEFAULT_COND_TYPE, { labelKey: 'condType' }) +
      '<div id="cond-inputs"></div>';
    const condBar = wrap.firstElementChild;
    const inputs = wrap.querySelector('#cond-inputs');
    formEl.appendChild(condBar);
    formEl.appendChild(inputs);
    renderCondInputs(inputs, DEFAULT_COND_TYPE);
    bindChoiceBar('cond-type', (val) => {
      renderCondInputs(inputs, val);
    });
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
      // group 内子字段按各自 kind 读取（checkbox → checked，text → value）
      for (const cf of f.fields) {
        if (cf.kind === 'text') {
          values[cf.key] = formEl.querySelector(`#${typeId}-${cf.key}`).value;
        } else {
          values[cf.key] = formEl.querySelector(`#${typeId}-${cf.key}`).checked;
        }
      }
    } else if (f.kind === 'text') {
      values[f.key] = formEl.querySelector(`#${typeId}-${f.key}`).value;
    } else if (f.kind === 'select') {
      // choice-bar 单选值
      values[f.key] = getChoiceValue(`${typeId}-${f.key}`);
    }
  }
  return values;
}

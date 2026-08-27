// 入口：引入 Material Web 组件（本地 vendor）、绑定事件、初始化。
// 本文件是"编排层"，业务数据逻辑在 state.js / api.js。

import '@material/web/tabs/tabs.js';
import '@material/web/tabs/primary-tab.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/checkbox/checkbox.js';
import '@material/web/switch/switch.js';
import '@material/web/dialog/dialog.js';
import '@material/web/progress/circular-progress.js';

import { marked } from 'marked';
import katex from 'katex';
import { api } from './api.js';
import { refresh, act, setOnChange } from './state.js';
import { renderAll, renderResults, renderMixedLatex, renderAddForm, collectFormValues, escapeHtml, updateFormLabels, getChoiceValue, setChoiceValue, bindChoiceBar, refreshChoiceLabels } from './render.js';
import { getObjType, getCondType, DEFAULT_OBJ_TYPE } from './types.js';
import { setLang, getLang, t } from './i18n.js';

/* ---------------- 主题（浅色/深色/跟随系统） ---------------- */
const THEME_KEY = 'gc-theme'; // 'light' | 'dark' | 'system'（缺省 system）
const themeMq = window.matchMedia?.('(prefers-color-scheme: dark)');

// 当前主题模式：localStorage 未设置（或为 system）时跟随系统偏好
function getThemeMode() {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function systemTheme() {
  return themeMq?.matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const sw = document.getElementById('theme-switch');
  sw.selected = theme === 'dark';
}

function initTheme() {
  const mode = getThemeMode();
  applyTheme(mode === 'system' ? systemTheme() : mode);
  // 未手动设置时跟随系统实时切换（深浅色）；手动设置后固定，直到"清除本地偏好"
  themeMq?.addEventListener?.('change', () => {
    if (getThemeMode() === 'system') applyTheme(systemTheme());
  });
}

/* ---------------- 语言切换 ---------------- */
const LANG_KEY = 'gc-lang';

// 系统语言：未手动设置时按浏览器/系统语言初始化（zh 开头 → 中文，其余 → 英文）
function systemLang() {
  return (navigator.language || 'zh-CN').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

function initLang() {
  const saved = localStorage.getItem(LANG_KEY);
  setLang(saved ?? systemLang());
  // 未手动设置时跟随系统语言（如 Android 系统语言切换后重进应用）
  window.addEventListener('languagechange', () => {
    if (!localStorage.getItem(LANG_KEY)) setLang(systemLang());
  });
}

/* ---------------- 顶栏按钮（语言 / 主题 / 清除）+ 添加页重置 ---------------- */
// 顶栏平铺按钮替代 md-menu：不依赖 popover API，Chrome 85 及以下可用
// 轻量 toast 提示（不引入组件库，自绘；连续触发会重置计时）
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2000);
}

// 语言切换（顶栏按钮，点击在中/英间切换）
document.getElementById('btn-lang').addEventListener('click', () => {
  const next = getLang() === 'zh-CN' ? 'en-US' : 'zh-CN';
  setLang(next);
  localStorage.setItem(LANG_KEY, next);
});

// 主题切换（顶栏 md-switch，点击开关切换深浅；手动设置后固定，不再跟随系统）
document.getElementById('theme-switch').addEventListener('change', () => {
  const sw = document.getElementById('theme-switch');
  const next = sw.selected ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

// 清除本地持久化设置（主题/语言），恢复默认（跟随系统）——给用户"状态可撤销"的自由
document.getElementById('btn-clear').addEventListener('click', () => {
  localStorage.removeItem(THEME_KEY);
  localStorage.removeItem(LANG_KEY);
  initTheme();
  initLang();
  showToast(t('clearedLocal'));
});

// 重置计算器（清空所有对象），弹确认对话框防误触。
// 按钮位于添加页「对象列表」卡片底部（从顶栏移入，避免顶栏拥挤）
document.getElementById('btn-reset').addEventListener('click', () => {
  document.getElementById('reset-dialog').open = true;
});

document.getElementById('reset-dialog').addEventListener('close', async (e) => {
  if (e.target.returnValue === 'confirm') {
    api.reset();
    await refresh();
    showToast(t('resetSuccess'));
    setOpStatus('ok');
  }
});

// 同步顶栏状态：语言按钮显示目标语言名 + 主题开关（语言/主题变化时调用）
function syncMenuState() {
  // 显示"点击后将切换到的语言"，而不是当前语言
  document.getElementById('btn-lang').textContent = getLang() === 'zh-CN' ? 'EN' : '中';
  const dark = document.documentElement.dataset.theme === 'dark';
  const sw = document.getElementById('theme-switch');
  if (sw.selected !== dark) sw.selected = dark;
}
document.addEventListener('langchange', syncMenuState);

// 语言切换时重译当前显示的行内错误（add-error / del-error / errHint）
document.addEventListener('langchange', () => {
  const addEl = document.getElementById('add-error');
  if (addErrKey || addErrMsg) {
    addEl.textContent = addErrKey ? t(addErrKey) : addErrMsg;
    addEl.hidden = false;
  }
  const delEl = document.getElementById('del-error');
  if (delErrKey) {
    delEl.textContent = t(delErrKey);
    delEl.hidden = false;
  }
  document.querySelectorAll('.card-error-hint').forEach((el) => {
    if (!el.hidden) el.textContent = t('errHint');
  });
  // 状态对话框若打开着，重译其中的消息
  if (document.getElementById('status-dialog').open) renderStatusDialog();
});

/* ---------------- 操作状态指示器 ---------------- */
// messageKey：i18n 键（可随语言重译）；message：非 i18n 原文（如后端异常）
let opStatus = { level: 'ok', messageKey: null, message: '', time: '' };

function setOpStatus(level, messageKey = null, message = '') {
  opStatus = {
    level,
    messageKey,
    message: String(message ?? ''),
    time: new Date().toLocaleString(),
  };
  document.getElementById('status-dot').className = `status-dot status-${level}`;
  document.querySelectorAll('.card-error-hint').forEach((el) => {
    el.hidden = level !== 'error';
    el.textContent = t('errHint');
  });
}

function renderStatusDialog() {
  const levelKey = { ok: 'statusOk', warn: 'statusWarn', error: 'statusError' }[opStatus.level];
  const msg = opStatus.messageKey ? t(opStatus.messageKey) : opStatus.message;
  document.getElementById('status-dialog-body').innerHTML =
    `<div class="status-level">${escapeHtml(t(levelKey))}</div>` +
    (msg ? `<div class="status-msg">${escapeHtml(msg)}</div>` : '') +
    (opStatus.time ? `<div class="status-time">${escapeHtml(opStatus.time)}</div>` : '');
}

document.getElementById('status-dot').addEventListener('click', () => {
  renderStatusDialog();
  document.getElementById('status-dialog').open = true;
});

document.getElementById('status-close-btn').addEventListener('click', () => {
  document.getElementById('status-dialog').close();
});

/* ---------------- Tab 导航 ---------------- */
const views = ['view-add', 'view-solve', 'view-docs'];

document.getElementById('nav-tabs').addEventListener('change', (e) => {
  // 注意：md-tabs 的 change 事件不带 detail，索引在 e.target.activeTabIndex 上
  const idx = e.target.activeTabIndex;
  views.forEach((id, i) => {
    document.getElementById(id).hidden = i !== idx;
  });
});

/* ---------------- 添加（schema 驱动，通用提交） ---------------- */
// 当前行内错误（key 或原文），语言切换时按 key 重译
let addErrKey = null;
let addErrMsg = null;
let delErrKey = null;

function showAddError(key, msg = null) {
  addErrKey = key;
  addErrMsg = key ? null : msg;
  const el = document.getElementById('add-error');
  el.textContent = key ? t(key) : msg ?? '';
  el.hidden = !key && !msg;
}

async function handleAdd() {
  const typeId = getChoiceValue('add-type');
  showAddError('');
  const typeDef = getObjType(typeId);
  try {
    if (typeId === 'cond') {
      const condType = getCondType(getChoiceValue('cond-type'));
      const inputs = Array.from({ length: condType.arity }, (_, i) =>
        document.getElementById(`cond-in-${i + 1}`).value.trim(),
      );
      const errKey = typeDef.validateCond(condType, inputs);
      if (errKey) {
        showAddError(errKey);
        setOpStatus('warn', errKey);
        return;
      }
      await act(() => api[condType.api](...inputs));
    } else {
      const values = collectFormValues(typeId);
      const errKey = typeDef.validate(values);
      if (errKey) {
        showAddError(errKey);
        setOpStatus('warn', errKey);
        return;
      }
      await act(() => {
        if (typeId === 'unknown') {
          // 取值范围：正/零/负三开关直接组合成引擎的三布尔结构
          return api[typeDef.api](values.name, {
            negative: !!values.negative,
            zero: !!values.zero,
            positive: !!values.positive,
          });
        }
        return api[typeDef.api](values.name, values.x, values.y, values.line1, values.line2);
      });
    }
    renderAddForm(typeId); // 成功后重置表单
    setOpStatus('ok');
  } catch (e) {
    showAddError(null, String(e));
    setOpStatus('error', null, String(e));
  }
}

// 主类型切换：重新渲染表单（choice-bar 点击切换，不依赖 popover）
bindChoiceBar('add-type', (val) => {
  renderAddForm(val);
});

/* ---------------- 删除对象（含依赖提示） ---------------- */
// 列表项 × 按钮触发删除：点哪项删哪项，不再用下拉选择（事件委托在 bindEvents 绑定）
let pendingDeleteId = null;
async function handleDelete(id) {
  pendingDeleteId = id;
  const delErr = document.getElementById('del-error');
  delErrKey = null;
  delErr.hidden = true;
  try {
    const requiredBy = await api.getDeeplyRequiredBy(id);
    const info = document.getElementById('del-dialog-info');
    info.innerHTML =
      renderMixedLatex(id, false) +
      (requiredBy.length > 0
        ? '<br>' + t('delDepHint') + requiredBy.map((r) => renderMixedLatex(r, false)).join(', ')
        : '');
    document.getElementById('del-dialog').open = true;
  } catch (e) {
    setOpStatus('error', null, String(e));
  }
}

document.getElementById('del-dialog').addEventListener('close', async (e) => {
  if (e.target.returnValue === 'confirm' && pendingDeleteId) {
    const id = pendingDeleteId;
    try {
      const requiredBy = await api.getDeeplyRequiredBy(id);
      await act(() => api.delObjs([id, ...requiredBy]));
      showToast(t('delSuccess'));
      setOpStatus('ok');
    } catch (err) {
      setOpStatus('error', null, String(err));
    }
  }
  pendingDeleteId = null;
});

/* ---------------- 求解 ---------------- */
const SOLVE_TIMEOUT_MS = 60000;

async function handleSolve() {
  const expr = document.getElementById('solve-expr').value.trim();
  if (!expr) return;

  const btn = document.getElementById('solve-btn');
  const progress = document.getElementById('solve-progress');
  const durationEl = document.getElementById('solve-duration');
  const resultEl = document.getElementById('solve-result');
  const start = Date.now();
  let timer = null;

  btn.disabled = true;
  progress.hidden = false;
  resultEl.innerHTML = '';
  durationEl.textContent = '00:00:00';

  timer = setInterval(() => {
    const sec = ((Date.now() - start) / 1000) | 0;
    durationEl.textContent = `${String(sec / 3600 | 0).padStart(2, '0')}:${String(sec / 60 % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }, 1000);

  // 超时标志：超时后丢弃迟到的结果，防止覆盖超时提示，也不干扰用户重试的新请求
  let aborted = false;
  const timeout = setTimeout(() => {
    aborted = true;
    btn.disabled = false;
    progress.hidden = true;
    clearInterval(timer);
    resultEl.innerHTML = `<div class="obj-item">${escapeHtml(t('solveTimeout'))}</div>`;
    setOpStatus('warn', 'solveTimeout');
  }, SOLVE_TIMEOUT_MS);

  try {
    const results = await api.solve(expr);
    clearTimeout(timeout);
    clearInterval(timer);
    if (aborted) return;
    renderResults(resultEl, results.length > 0 ? results : [t('noSolution')]);
    setOpStatus('ok');
  } catch (e) {
    clearTimeout(timeout);
    clearInterval(timer);
    if (aborted) return;
    resultEl.innerHTML = `<div class="obj-item">${escapeHtml(String(e))}</div>`;
    setOpStatus('error', null, String(e));
  } finally {
    btn.disabled = false;
    progress.hidden = true;
  }
}

/* ---------------- 文档 ---------------- */
const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

// 先把 $...$ 公式渲染成 HTML 换成占位符，避免被 markdown 语法破坏（如 $x_A$ 的 _ 会被当成斜体）
function protectMath(md) {
  const placeholders = [];
  const out = md.replace(MATH_PATTERN, (m, display, inline) => {
    const expr = (display ?? inline).trim();
    const html = katex.renderToString(expr, { throwOnError: false, displayMode: !!display });
    const ph = `<!--KX${placeholders.length}-->`;
    placeholders.push(html);
    return ph;
  });
  return { out, placeholders };
}

function restoreMath(html, placeholders) {
  return html.replace(/<!--KX(\d+)-->/g, (m, i) => placeholders[+i]);
}

// 渲染 markdown 文件为 HTML（复用 protectMath/restoreMath 处理 $...$ 公式）
async function fetchMd(file) {
  const resp = await fetch(file);
  if (!resp.ok) throw new Error('not found');
  const { out, placeholders } = protectMath(await resp.text());
  return restoreMath(marked.parse(out), placeholders);
}

// 文档系统状态：manifest 数据 / 当前版本 / 当前选中文档
let docManifest = null;
let docCurrent = null;
let docVersion = null;
let currentDocId = null;

// 加载当前选中文档的内容（按当前语言与来源分组目录）
async function loadCurrentDoc() {
  const isZh = getLang() === 'zh-CN';
  const doc = docManifest && docManifest.documents.find((d) => d.id === currentDocId);
  if (!doc) return;
  // 当前版本文件在 doc/{group}/ 下；历史版本归档目录 doc/archive/{v}/{group}/ 暂未启用
  const baseDir = docVersion === docCurrent ? 'doc' : `doc/archive/${docVersion}`;
  const file = `${doc.group}/${isZh ? doc.file : doc.fileEn}`;
  let html;
  try {
    html = await fetchMd(`${baseDir}/${file}`);
  } catch {
    html = '<p>' + escapeHtml(`${baseDir}/${file}`) + '</p>';
  }
  renderDoc(html);
}

// 渲染左侧文档列表（按来源分组：legacy 原版文档 / mine 维护者文档，点击切换右侧内容）
function renderDocsList() {
  const list = document.getElementById('docs-list');
  const isZh = getLang() === 'zh-CN';
  const groups = {};
  for (const d of docManifest.documents) {
    (groups[d.group || 'original'] = groups[d.group || 'original'] || []).push(d);
  }
  let html = '';
  for (const [group, docs] of Object.entries(groups)) {
    // 组标题 key 由 group 值推导：original → docGroupOriginal，maintainer → docGroupMaintainer
    const key = `docGroup${group.charAt(0).toUpperCase()}${group.slice(1)}`;
    html += `<div class="docs-group-label">${escapeHtml(t(key))}</div>`;
    html += docs
      .map((d) => `<a class="docs-item" data-id="${d.id}" href="#">${escapeHtml(isZh ? d.title : d.titleEn)}</a>`)
      .join('');
  }
  list.innerHTML = html;
  list.querySelectorAll('a').forEach((a) => {
    a.classList.toggle('active', a.dataset.id === currentDocId);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      currentDocId = a.dataset.id;
      renderDocsList();
      loadCurrentDoc();
    });
  });
}

// 渲染文档内容 + 顶部章节导航 chips（点击滚动定位 + 滚动高亮当前章节）
function renderDoc(html) {
  const contentEl = document.getElementById('docs-content');
  const tocEl = document.getElementById('doc-toc');
  contentEl.innerHTML = html;
  contentEl.scrollTop = 0; // 加载新文档回到顶部

  // 章节导航收集 h2 + h3
  const headings = [...contentEl.querySelectorAll('h2, h3')];
  tocEl.innerHTML = headings
    .map((h, i) => {
      h.id = `docsec-${i}`;
      // KaTeX 渲染输出隐藏的 mathml 副本（读屏用），直接取 textContent 会把公式字符重复抓取
      // （如 "$k$" 变成 "kkk"）；克隆后移除 mathml 部分，得到干净的可视文本
      const clone = h.cloneNode(true);
      clone.querySelectorAll('.katex-mathml').forEach((n) => n.remove());
      const label = clone.textContent.replace(/\s+/g, ' ').trim();
      return `<a class="doc-toc-chip" href="#docsec-${i}">${escapeHtml(label)}</a>`;
    })
    .join('');

  const links = [...tocEl.querySelectorAll('a')];
  const setActive = (link) => links.forEach((l) => l.classList.toggle('active', l === link));

  // 高亮阈值：标题进入正文滚动容器顶部（横线处）即高亮
  const topThreshold = () => contentEl.getBoundingClientRect().top + 8;

  // 让高亮 chip 尽量滚动到导航条中间（两侧到头则贴边）
  const scrollChipIntoCenter = (chip) => {
    if (!chip) return;
    const max = Math.max(tocEl.scrollWidth - tocEl.clientWidth, 0);
    const left = Math.min(
      Math.max(chip.offsetLeft - (tocEl.clientWidth - chip.offsetWidth) / 2, 0),
      max,
    );
    tocEl.scrollTo({ left, behavior: 'smooth' });
  };

  // 点击章节 chip：平滑滚动 + 立即高亮并加锁（scrollend 解锁，兜底 1.5s）
  let scrollLock = false;
  links.forEach((a, i) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      scrollLock = true;
      setActive(a);
      scrollChipIntoCenter(a);
      headings[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        scrollLock = false;
      }, 1500);
    });
  });

  // 滚动高亮：最后一个滚过内容区顶缘（横线处）的章节
  const activeLink = () => {
    const top = topThreshold();
    let current = null;
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= top) current = h;
      else break;
    }
    const currentLink = current ? links[headings.indexOf(current)] : null;
    setActive(currentLink);
    scrollChipIntoCenter(currentLink);
  };

  // 清理旧监听（renderDoc 可能被多次调用），避免闭包引用旧元素
  if (contentEl._scrollHandler) contentEl.removeEventListener('scroll', contentEl._scrollHandler);
  if (contentEl._scrollEndHandler) contentEl.removeEventListener('scrollend', contentEl._scrollEndHandler);

  contentEl._scrollEndHandler = () => {
    if (!scrollLock) return;
    scrollLock = false;
    const clicked = tocEl.querySelector('a.active');
    const target = clicked ? headings[links.indexOf(clicked)] : null;
    if (target && target.getBoundingClientRect().top > topThreshold()) return;
    activeLink();
  };
  contentEl.addEventListener('scrollend', contentEl._scrollEndHandler);

  // 初始高亮：文档视图隐藏（display:none）时 getBoundingClientRect 全为 0，
  // 会误判成"最后一个章节已滚过"而高亮末尾 chip；仅可见时才计算，隐藏时留待滚动触发
  if (contentEl.getBoundingClientRect().height > 0) activeLink();
  contentEl._scrollHandler = () => {
    if (!scrollLock) activeLink();
  };
  contentEl.addEventListener('scroll', contentEl._scrollHandler, { passive: true });
}

// 从 doc/manifest.json 初始化文档系统：版本 choice-bar + 文档列表 + 默认文档
async function initDocs() {
  const bar = document.getElementById('doc-version-select');
  try {
    const resp = await fetch('doc/manifest.json');
    if (!resp.ok) throw new Error('not found');
    docManifest = await resp.json();
    docCurrent = docManifest.current;
    docVersion = docCurrent;
    // 填充版本按钮（label 来自 manifest 版本号，非 i18n key；choice-bar 不依赖 popover）
    bar.innerHTML = docManifest.versions
      .map(
        (v) =>
          `<button type="button" class="choice-btn${v.id === docCurrent ? ' active' : ''}" data-value="${escapeHtml(v.id)}" role="radio" aria-checked="${v.id === docCurrent}">${escapeHtml(v.label)}</button>`,
      )
      .join('');
    bindChoiceBar('doc-version-select', async (val) => {
      docVersion = val;
      await loadCurrentDoc();
    });
    currentDocId = docManifest.documents[0].id;
    renderDocsList();
    await loadCurrentDoc();
  } catch {
    docManifest = null;
    bar.hidden = true;
  }
}

// 切换语言时重渲染文档列表并重新加载当前文档（正文回到顶部）；
// 记住切换前高亮的章节 chip，重渲染后高亮对应 chip 并拉到导航条中间，方便直接点击跳转
document.addEventListener('langchange', async () => {
  if (!docManifest) return;
  const tocEl = document.getElementById('doc-toc');
  const savedIdx = [...tocEl.children].findIndex((c) => c.classList.contains('active'));
  renderDocsList();
  await loadCurrentDoc();
  const chips = [...tocEl.querySelectorAll('a')];
  const chip = chips[savedIdx];
  if (!chip) return;
  chips.forEach((c) => c.classList.toggle('active', c === chip));
  const max = Math.max(tocEl.scrollWidth - tocEl.clientWidth, 0);
  const left = Math.min(Math.max(chip.offsetLeft - (tocEl.clientWidth - chip.offsetWidth) / 2, 0), max);
  tocEl.scrollTo({ left, behavior: 'smooth' });
});
// 切换语言时只刷新添加表单文案，不重建 DOM（保留输入值）；
// choice-bar 按钮文字通过 refreshChoiceLabels 刷新（替代 md-select 重建，无 displayText 快照问题）
document.addEventListener('langchange', () => {
  refreshChoiceLabels('add-type');
  const typeId = getChoiceValue('add-type');
  if (!getObjType(typeId)) return;
  updateFormLabels();
  if (typeId === 'cond') {
    refreshChoiceLabels('cond-type');
  }
});

/* ---------------- 初始化 ---------------- */
function bindEvents() {
  document.getElementById('add-submit-btn').addEventListener('click', handleAdd);
  document.getElementById('solve-btn').addEventListener('click', handleSolve);
  document.getElementById('solve-expr').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSolve();
  });
  // 列表项删除按钮（×）：事件委托，三个列表容器统一处理（替代 del-select 下拉）
  const onListDelClick = (e) => {
    const btn = e.target.closest('.obj-del-btn');
    if (!btn) return;
    handleDelete(btn.dataset.id);
  };
  ['unknown-list', 'point-list', 'cond-list'].forEach((id) =>
    document.getElementById(id).addEventListener('click', onListDelClick),
  );
  // 导航 chips 横向滚动：鼠标滚轮（纵向）转成横向滚动，滚到边界自动放行给页面
  const tocEl = document.getElementById('doc-toc');
  tocEl.addEventListener(
    'wheel',
    (e) => {
      const max = tocEl.scrollWidth - tocEl.clientWidth;
      if (max <= 0) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const atEdge = (dy > 0 && tocEl.scrollLeft >= max) || (dy < 0 && tocEl.scrollLeft <= 0);
      if (atEdge) return; // 到头了，不拦截，交给页面纵向滚动
      e.preventDefault();
      tocEl.scrollLeft += dy;
    },
    { passive: false },
  );
}

(async function init() {
  initTheme();
  initLang();
  bindEvents();
  setOnChange(renderAll);
  setChoiceValue('add-type', DEFAULT_OBJ_TYPE);
  renderAddForm(DEFAULT_OBJ_TYPE);
  await initDocs();
  // 浏览器持久化：启动时重放上次的历史，恢复现场
  api.loadFromFile();
  await refresh();
})();

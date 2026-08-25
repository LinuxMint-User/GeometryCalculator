// 入口：引入 Material Web 组件（本地 vendor）、绑定事件、初始化。
// 本文件是"编排层"，业务数据逻辑在 state.js / api.js。

import '@material/web/tabs/tabs.js';
import '@material/web/tabs/primary-tab.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/checkbox/checkbox.js';
import '@material/web/switch/switch.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/dialog/dialog.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/menu/menu.js';
import '@material/web/menu/menu-item.js';

import { marked } from 'marked';
import katex from 'katex';
import { api } from './api.js';
import { refresh, act, setOnChange } from './state.js';
import { renderAll, renderResults, renderLatex, renderAddForm, collectFormValues, escapeHtml, updateFormLabels } from './render.js';
import { getObjType, getCondType, DEFAULT_OBJ_TYPE, DOMAIN_SETS } from './types.js';
import { setLang, getLang, t } from './i18n.js';

/* ---------------- 主题（浅色/深色） ---------------- */
const THEME_KEY = 'gc-theme';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const sw = document.getElementById('menu-theme-switch');
  sw.selected = theme === 'dark';
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ?? (prefersDark ? 'dark' : 'light'));
}

/* ---------------- 语言切换 ---------------- */
const LANG_KEY = 'gc-lang';

function initLang() {
  setLang(localStorage.getItem(LANG_KEY) ?? getLang());
}

/* ---------------- 顶栏菜单（语言 / 主题 / 清除本地偏好） ---------------- */
const appMenu = document.getElementById('app-menu');

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

document.getElementById('menu-btn').addEventListener('click', () => {
  appMenu.open = !appMenu.open;
});

// 语言切换
document.getElementById('menu-lang').addEventListener('click', () => {
  const next = getLang() === 'zh-CN' ? 'en-US' : 'zh-CN';
  setLang(next);
  localStorage.setItem(LANG_KEY, next);
  appMenu.open = false;
});

// 主题切换（带文字 + 开关的菜单项；keepopen 保持菜单展开，便于连续尝试深浅效果）
document.getElementById('menu-theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});

// 清除本地持久化设置（主题/语言），恢复默认——给用户"状态可撤销"的自由
document.getElementById('menu-clear').addEventListener('click', () => {
  localStorage.removeItem(THEME_KEY);
  localStorage.removeItem(LANG_KEY);
  initTheme();
  setLang('zh-CN');
  showToast(t('clearedLocal'));
  appMenu.open = false;
});

// 同步菜单状态：当前语言名 + 主题开关（语言/主题变化时调用）
function syncMenuState() {
  // 显示"点击后将切换到的语言"，而不是当前语言
  document.getElementById('menu-lang-current').textContent = getLang() === 'zh-CN' ? 'English' : '中文';
  const dark = document.documentElement.dataset.theme === 'dark';
  const sw = document.getElementById('menu-theme-switch');
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
  const typeId = document.getElementById('add-type').value;
  showAddError('');
  const typeDef = getObjType(typeId);
  try {
    if (typeId === 'cond') {
      const condType = getCondType(document.getElementById('cond-type').value);
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
          return api[typeDef.api](values.name, DOMAIN_SETS[values.domain] ?? DOMAIN_SETS.reals);
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

// 主类型切换：重新渲染表单
document.getElementById('add-type').addEventListener('change', (e) => {
  renderAddForm(e.target.value);
});

/* ---------------- 删除对象（含依赖提示） ---------------- */
async function handleDelete() {
  const sel = document.getElementById('del-select');
  const delErr = document.getElementById('del-error');
  const id = sel.value;
  if (!id) {
    delErrKey = 'errNoDelSelect';
    delErr.textContent = t('errNoDelSelect');
    delErr.hidden = false;
    showToast(t('errNoDelSelect'));
    setOpStatus('warn', 'errNoDelSelect');
    return;
  }
  delErrKey = null;
  delErr.hidden = true;
  try {
    const requiredBy = await api.getDeeplyRequiredBy(id);
    const info = document.getElementById('del-dialog-info');
    info.innerHTML =
      renderLatex(id, false) +
      (requiredBy.length > 0
        ? '<br>' + t('delDepHint') + escapeHtml(requiredBy.join(', '))
        : '');
    document.getElementById('del-dialog').open = true;
  } catch (e) {
    setOpStatus('error', null, String(e));
  }
}

document.getElementById('del-dialog').addEventListener('close', async (e) => {
  if (e.target.returnValue === 'confirm') {
    const id = document.getElementById('del-select').value;
    try {
      const requiredBy = await api.getDeeplyRequiredBy(id);
      await act(() => api.delObjs([id, ...requiredBy]));
      showToast(t('delSuccess'));
      setOpStatus('ok');
    } catch (err) {
      setOpStatus('error', null, String(err));
    }
  }
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

// 从 doc/manifest.json 初始化文档系统：版本下拉 + 文档列表 + 默认文档
async function initDocs() {
  const select = document.getElementById('doc-version-select');
  try {
    const resp = await fetch('doc/manifest.json');
    if (!resp.ok) throw new Error('not found');
    docManifest = await resp.json();
    docCurrent = docManifest.current;
    docVersion = docCurrent;
    select.innerHTML = docManifest.versions
      .map((v) => `<md-select-option value="${v.id}"${v.id === docCurrent ? ' selected' : ''}>${v.label}</md-select-option>`)
      .join('');
    // 时序修复：等选项完成 custom element upgrade + 一帧后再设 value，
    // 否则 menu.items 为空，displayText 不会同步、框内显示空白
    await Promise.all([...select.querySelectorAll('md-select-option')].map((o) => o.updateComplete));
    await new Promise((r) => requestAnimationFrame(r));
    select.value = docCurrent;
    await select.updateComplete;
    select.addEventListener('change', async () => {
      docVersion = select.value;
      await loadCurrentDoc();
    });
    currentDocId = docManifest.documents[0].id;
    renderDocsList();
    await loadCurrentDoc();
  } catch {
    docManifest = null;
    select.hidden = true;
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
// 切换语言时只刷新添加表单文案，不重建 DOM（保留输入值）；类型/条件下拉选项文本同步重建
document.addEventListener('langchange', async () => {
  const typeId = document.getElementById('add-type').value;
  if (!getObjType(typeId)) return;
  updateFormLabels();
  await refreshTypeSelect(typeId);
  if (typeId === 'cond') {
    const condSel = document.getElementById('cond-type');
    if (condSel) await refreshCondTypeSelect(condSel);
  }
});

// 条件类型下拉：重建选项文本 + 保留当前值（显示文本快照问题，同 refreshTypeSelect）
async function refreshCondTypeSelect(select) {
  const value = select.value;
  const typeDef = getObjType('cond');
  select.innerHTML = typeDef.condTypes
    .map((c) => `<md-select-option value="${c.id}">${t(c.labelKey)}</md-select-option>`)
    .join('');
  await Promise.all([...select.querySelectorAll('md-select-option')].map((o) => o.updateComplete));
  await new Promise((r) => requestAnimationFrame(r));
  select.value = value;
  await select.updateComplete;
}

// MD select 的显示文本是选中时对选项文本的快照，语言切换改 textContent 不会刷新它；
// 重建选项（新选项 upgrade 时按新语言抓取 displayText）+ 重设 value 强制刷新显示文本
async function refreshTypeSelect(value) {
  const select = document.getElementById('add-type');
  select.innerHTML = `
    <md-select-option value="unknown">${t('addUnknownTitle')}</md-select-option>
    <md-select-option value="point">${t('addPointTitle')}</md-select-option>
    <md-select-option value="cond">${t('addCondTitle')}</md-select-option>
  `;
  // 等选项完成 custom element upgrade + 一帧后再设 value，否则 displayText 不同步
  await Promise.all([...select.querySelectorAll('md-select-option')].map((o) => o.updateComplete));
  await new Promise((r) => requestAnimationFrame(r));
  select.value = value;
  await select.updateComplete;
}

/* ---------------- 初始化 ---------------- */
function bindEvents() {
  document.getElementById('add-submit-btn').addEventListener('click', handleAdd);
  document.getElementById('del-btn').addEventListener('click', handleDelete);
  document.getElementById('solve-btn').addEventListener('click', handleSolve);
  document.getElementById('solve-expr').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSolve();
  });
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
  document.getElementById('add-type').value = DEFAULT_OBJ_TYPE;
  renderAddForm(DEFAULT_OBJ_TYPE);
  await initDocs();
  // 浏览器持久化：启动时重放上次的历史，恢复现场
  api.loadFromFile();
  await refresh();
})();

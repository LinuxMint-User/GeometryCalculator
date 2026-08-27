// 前端构建脚本（node build.mjs）：
//   esbuild 以 js/main.js 为入口，把全部依赖（本地 js/engine/vendor，含
//   importmap 中的 @material/web、lit、katex、marked 等）打包为单个 ESM
//   文件 dist/js/main.js，并将语法降级到 Chrome 74（Android 9 自带 WebView
//   内核），其余静态资源（index.html/css/vendor 字体/doc）原样复制到 dist/。
//
//   为什么需要：前端源码用了 ?. / ?? / ??= 等 Chrome 80 语法，老 WebView
//   （Android 7-9）解析直接失败 → 界面能显示但完全无交互。
//   另外 esbuild 只降语法、不补运行时 API，marked 用了 Array.prototype.at
//   （Chrome 92+），需在 bundle 头部注入垫片。
import { build } from 'esbuild';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DIST = ROOT + 'dist';

// 旧 WebView（Chrome 74 及以下）缺失的运行时 API 垫片（banner 注入，最先执行）
const POLYFILLS = `
if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', {
    value: function (n) {
      n = Math.trunc(n) || 0;
      if (n < 0) n += this.length;
      return n >= 0 && n < this.length ? this[n] : undefined;
    },
    configurable: true,
    writable: true,
  });
}
if (typeof String.prototype.replaceAll !== 'function') {
  String.prototype.replaceAll = function (search, replacement) {
    return this.split(search).join(replacement);
  };
}
`;

// 解析 importmap：把裸导入（@material/web/...、lit、katex、marked 等）映射到
// 本地 vendor 的实际路径（与 index.html 的 <script type="importmap"> 一致）
const html = readFileSync(ROOT + 'index.html', 'utf8');
const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!mapMatch) throw new Error('index.html 中未找到 importmap');
const imports = JSON.parse(mapMatch[1]).imports;

const importMapPlugin = {
  name: 'importmap',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.importer === undefined) return null; // 入口文件走默认解析
      for (const [key, value] of Object.entries(imports)) {
        if (args.path === key) {
          return { path: resolve(ROOT, value) };
        }
        if (key.endsWith('/') && args.path.startsWith(key)) {
          return { path: resolve(ROOT, value + args.path.slice(key.length)) };
        }
      }
      return null; // 相对导入交给默认解析
    });
  },
};

// ---- CSS 兼容降级（针对 Chrome 85 老 WebView 内核）----
// MWC 组件样式运行时注入 shadow DOM，其中部分 CSS 特性 Chrome 85 不解析、
// 直接丢弃规则，造成「能点击但样式崩」：
//   @layer（Chrome 99+）→ 拍平：textfield 等组件样式整块丢失
//   inset 简写（87+）→ 展开四边：按钮背景层 0 尺寸 → 按钮变透明
//   :is()（88+）→ 展开选择器列表：部分规则失效
//   text-wrap（114+）→ 删除声明：按钮文字换行异常
// 在 esbuild 打包前对 lit 的 css`...` 模板字符串做文本处理，降级后仍是等价 CSS，
// 高版本浏览器视觉无差异。
function flattenLayers(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    if (css.startsWith('@layer', i)) {
      let j = i + 6;
      while (j < css.length && css[j] !== '{' && css[j] !== ';') j++;
      if (j < css.length && css[j] === ';') { i = j + 1; continue; } // @layer a, b, c; 声明 → 删
      if (j < css.length && css[j] === '{') {
        let depth = 0, close = -1;
        for (let k = j; k < css.length; k++) {
          if (css[k] === '{') depth++;
          else if (css[k] === '}') { depth--; if (depth === 0) { close = k; break; } }
        }
        if (close < 0) { out += css.slice(i); break; } // 括号不闭合，原样保留
        out += flattenLayers(css.slice(j + 1, close));
        i = close + 1;
        continue;
      }
    }
    out += css[i];
    i++;
  }
  return out;
}

// :is() 展开：把 :is 参数列表拆开，前缀/后缀复制到每个成员（递归处理嵌套）
function expandIsAll(css) {
  if (!css.includes(':is(')) return css;
  const idx = css.indexOf(':is(');
  let depth = 0, end = -1;
  for (let i = idx + 4; i < css.length; i++) {
    const ch = css[i];
    if (ch === '(') depth++;
    else if (ch === ')') { if (depth === 0) { end = i; break; } depth--; }
  }
  if (end < 0) return css;
  const inner = css.slice(idx + 4, end);
  const parts = expandIsAll(inner).split(',');

  // 前缀：idx 之前的选择器上下文（到选择器级边界为止；空格是上下文的一部分）
  let pre = '', p = idx - 1;
  while (p >= 0 && !',{}>+~'.includes(css[p])) {
    pre = css[p] + pre;
    p--;
  }
  // 后缀：end 之后到选择器结束（{,} 或顶层逗号；括号内逗号不停止，
  // 否则 :is(a,b) :is(c,d){...} 的后缀会被截断在第一个逗号）
  let suf = '', q = end + 1, paren = 0;
  while (q < css.length) {
    const ch = css[q];
    if (ch === '{' || ch === '}') break;
    if (ch === ',' && paren === 0) break;
    if (ch === '(') paren++;
    else if (ch === ')' && paren > 0) paren--;
    suf += ch;
    q++;
  }
  // 是否需要补右括号：仅当 :is 直接是某括号的参数（如 :host(:is(...))）时，
  // 其余形态（:host(:hover) :is(...) 等）前缀括号已闭合，无需补
  let needClose = 0;
  if (idx > 0 && css[idx - 1] === '(') {
    const open = (pre.match(/\(/g) || []).length;
    const close = (pre.match(/\)/g) || []).length;
    needClose = Math.max(0, open - close);
  }
  // 后缀开头若为 pre 未闭合括号的闭合 ')'（如 :host(:is(a,b)) 的 :host( 闭合），
  // 从 suf 中移除；needClose 为 0 时开头的 ')' 属于外层括号，退回
  if (needClose > 0) {
    let i = 0;
    while (i < suf.length && suf[i] === ')' && i < needClose) i++;
    suf = suf.slice(i);
  } else if (suf.startsWith(')')) {
    suf = '';
  }
  // 替换范围从 pre 起点开始（pre 已包含在 repl 中，不能重复拼接 slice(0, idx)）
  const start = p + 1;
  const repl = parts.map(x => pre + x + ')'.repeat(needClose) + suf).join(',');
  return expandIsAll(css.slice(0, start) + repl + css.slice(q));
}

// text-wrap 删除（Chrome 114+ 才有该属性）
function removeTextWrap(css) {
  return css.replace(/text-wrap:[^;}]*;?/g, '');
}

// inset 简写展开为 top/right/bottom/left（Chrome 87+ 才有 inset）
function expandInset(css) {
  return css.replace(/inset:([^;}]+)(;|})/g, (m, val, tail) => {
    let t, r, b, l;
    if (val.includes('(')) {
      // 函数值（var()/calc() 等）内的空格不能当作多值分隔 → 恒为单值
      t = r = b = l = val;
    } else {
      const v = val.trim().split(/\s+/);
      if (v.length < 1 || v.length > 4) return m;
      if (v.length === 1) { t = r = b = l = v[0]; }
      else if (v.length === 2) { t = b = v[0]; r = l = v[1]; }
      else if (v.length === 3) { t = v[0]; r = l = v[1]; b = v[2]; }
      else { [t, r, b, l] = v; }
    }
    return `top:${t};right:${r};bottom:${b};left:${l}${tail}`;
  });
}

function compatCss(css) {
  return expandInset(
    removeTextWrap(
      expandIsAll(
        flattenLayers(css)
          .replace(/:where\(/g, ':is(') // :where（88+）语义同 :is（仅优先级为 0），展开即可
      ).replace(/:focus-visible/g, ':focus') // :focus-visible（86+）降级为 :focus（85 支持）
    )
  );
}

// 源码里的 css`...` 模板（lit 标签函数）内容做兼容降级
function compatCssInJs(src) {
  return src.replace(/css(\s*)`([\s\S]*?)(?<!\\)`/g, (m, ws, cssText) => {
    return 'css' + ws + '`' + compatCss(cssText) + '`';
  });
}

// 复杂 :not(a,b) 列表（Chrome 88+）展开成 :not(a):not(b) 连写
function expandNotList(css) {
  return css.replace(/:not\(([^()]*)\)/g, (m, args) => {
    const parts = args.split(',').map(x => x.trim()).filter(Boolean);
    if (parts.length <= 1) return m;
    return parts.map(p => `:not(${p})`).join('');
  });
}

// dialog 组件（md-dialog）的 isFocusable 用 matches(":is(...)") 判断焦点元素，
// 选择器由三个字符串常量运行时拼接。Chrome 85 不支持 :is() 和复杂 :not 列表，
// matches() 会抛 SyntaxError → 对话框打开即崩。这里把完整选择器一次性展开
// （:is 展开 + :not 列表展开，后缀复制到每个成员），运行时拼接语义不变。
function compatDialogSelectors(src) {
  const re =
    /const knownFocusableElements = '([^']*)';\s*const notDisabled = '([^']*)';\s*const notNegativeTabIndex = '([^']*)';\s*if \(element\.matches\(knownFocusableElements \+ notDisabled \+ notNegativeTabIndex\)\) \{/;
  if (!re.test(src)) return src;
  return src.replace(re, (m, known, notDisabled, notNegativeTabIndex) => {
    const full = expandIsAll(expandNotList(known + notDisabled + notNegativeTabIndex));
    return (
      `const knownFocusableElements = '${full}';\n` +
      `const notDisabled = '';\n` +
      `const notNegativeTabIndex = '';\n` +
      `if (element.matches(knownFocusableElements + notDisabled + notNegativeTabIndex)) {`
    );
  });
}

// 打包前拦截所有 js 模块，先对组件样式/选择器做兼容降级
const cssCompatPlugin = {
  name: 'css-compat',
  setup(b) {
    b.onLoad({ filter: /\.(js|mjs)$/ }, (args) => {
      let src = readFileSync(args.path, 'utf8');
      src = compatCssInJs(src);
      // md-focus-ring 用 control.matches(':focus-visible') 检测聚焦状态，
      // Chrome 85 不支持 :focus-visible，matches() 抛 SyntaxError → 降级为 :focus
      src = src.replace(/\.matches\(\s*['"]:focus-visible['"]\s*\)/g, '.matches(":focus")');
      if (args.path.includes('/dialog/')) src = compatDialogSelectors(src);
      return { contents: src, loader: 'js' };
    });
  },
};

// 1) 打包 + 语法降级
rmSync(DIST, { recursive: true, force: true });
await build({
  entryPoints: [ROOT + 'js/main.js'],
  bundle: true,
  format: 'esm',
  target: ['chrome74'],
  outfile: DIST + '/js/main.js',
  plugins: [importMapPlugin, cssCompatPlugin],
  banner: { js: POLYFILLS },
  logLevel: 'info',
});

// 2) 复制静态资源（index.html / css / vendor / doc / engine 源文件不再需要，
//    已打进 bundle；但保留 vendor 中 css/字体，doc 供文档页运行时 fetch）
cpSync(ROOT + 'index.html', DIST + '/index.html');
for (const dir of ['css', 'vendor', 'doc']) {
  cpSync(ROOT + dir, DIST + '/' + dir, {
    recursive: true,
    // 跳过源码地图/类型声明/样式源文件等运行时无关内容，减小安装包体积
    filter: (src) =>
      !/\.(map|d\.ts|scss|ts)$/.test(src) &&
      !src.includes('/development/') &&
      !src.includes('/node/'),
  });
}

console.log('前端构建完成 → ' + DIST);

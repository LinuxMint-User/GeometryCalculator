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

// 1) 打包 + 语法降级
rmSync(DIST, { recursive: true, force: true });
await build({
  entryPoints: [ROOT + 'js/main.js'],
  bundle: true,
  format: 'esm',
  target: ['chrome74'],
  outfile: DIST + '/js/main.js',
  plugins: [importMapPlugin],
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

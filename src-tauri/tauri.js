// 几何计算器（LinuxMint-User 维护版）
// 用途：Android Gradle 构建中 rust 插件（BuildTask）会执行 `node tauri android android-studio-script`，
//       cwd 为 src-tauri/。此处提供 node 可加载的入口，把参数转发给 PATH 中的 tauri CLI
//       （cargo 版 `tauri` 或 npm 版均可，无需在项目内安装 @tauri-apps/cli）。
'use strict';

const { spawnSync } = require('node:child_process');

const res = spawnSync('tauri', process.argv.slice(2), { stdio: 'inherit' });

if (res.error) {
  console.error('[tauri.js] 无法执行 tauri 命令：', res.error.message);
  process.exit(1);
}
process.exit(res.status === null ? 1 : res.status);

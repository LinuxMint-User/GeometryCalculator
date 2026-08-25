简体中文 | [English (US)](README.en.md)

> 维护者说明：本仓库为维护分支（fork），本分支的改动见下方「维护者更新」区块；以下原作者内容保留未动。

---

# 维护者更新（v2.5.0）

本仓库为 [zhdbk3/GeometryCalculator](https://github.com/zhdbk3/GeometryCalculator) 的维护分支，维护者：LinuxMint-User。

## 架构重构

- 🧮 计算核心重写为 TypeScript 符号引擎，编译为浏览器原生 JavaScript（ESM）后运行，替换原 Python + SymPy 后端
- ⚡ 前端直连引擎，移除桥接层；全部计算在浏览器内完成，无需后端进程、无需安装 Python/Qt 依赖
- 🔄 操作历史自动保存到本地，刷新页面自动恢复现场

## 新增功能

- 🖥️ Tauri 桌面壳：桌面端（Linux / Windows / macOS）以原生窗口运行
- 🤖 Android 支持：可构建 APK（系统要求 Android 7.0+，支持 arm64-v8a / armeabi-v7a / x86 / x86_64）
- 🧹 「重置计算器」一键清零（菜单 ☰ → 重置计算器）
- 📐 角度函数 `acos`（如三角形角度求解），符号求解优先、数值求解兜底
- 🔢 求解能力增强：符号解求不出时自动数值兜底（结果标注「近似」），不再空手而归
- 🗑️ 删除对象时提示依赖关系，支持级联处理

## 与原版的功能差异

- 操作习惯与对象模型（未知数/点/条件/求解）与原版一致，无功能退化
- 三次及以上多项式不再输出冗长的 Cardano 根式公式，改为数值近似（标注「近似」）
- 原版「保存到文件 / 从文件加载」改为自动持久化：操作历史自动保存，刷新页面自动恢复

## 运行方式（本分支）

### 浏览器预览（最轻量，无需 Tauri）

```bash
python3 -m http.server 9017 --directory frontend
```

浏览器打开 <http://localhost:9017/>。

## 构建与打包

前置依赖：Rust 工具链（rustup）、[Tauri 2 CLI](https://v2.tauri.app/start/cli/)（`cargo install tauri-cli --version "^2"`）；
构建 Android APK 另需 JDK 17+、Android SDK（含 NDK），并添加交叉编译目标：

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

### 桌面端（Tauri 壳）

```bash
tauri dev     # 开发模式（自动拉起前端静态服务，热重载），或 ./dev.sh
tauri build   # 构建发布版安装包（产物在 src-tauri/target/release/bundle/）
```

### Android APK

```bash
tauri android init                    # 首次生成 Android 工程（src-tauri/gen/android/，可重新生成）
tauri android build --apk --debug     # 构建 debug APK
```

APK 产物：`src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`

- 系统要求：Android 7.0（API 24）及以上
- 架构：arm64-v8a / armeabi-v7a / x86 / x86_64 四路全打（universal APK）

引擎源码、测试与浏览器编译见 `backend/src/`（TypeScript）；功能说明见页面内「文档」tab 的维护者《使用指南》《更新日志》。

---

原版 README（原作者内容）已完整保留，见 [README-Origin.md](README-Origin.md)，此处不再重复。

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

### 下载安装包（无需自行构建）

最新发布产物在 [GitHub Releases](https://github.com/LinuxMint-User/GeometryCalculator/releases) 页面：

- 桌面：Linux（deb/rpm/AppImage）、Windows（NSIS 安装版 + 便携单文件版）、macOS（dmg）
- 安卓：universal 通吃包（四 ABI）+ 各单架构小包（arm64-v8a / armeabi-v7a / x86 / x86_64）
- 手机安装 APK 需在系统设置中允许「未知来源」应用；系统要求 Android 7.0（API 24）及以上
- WebView 内核：安装包内的前端已用 esbuild 降级到 Chrome 74 语法，Android 9 自带 WebView 即可正常运行；Android 7/8 自带 WebView 过旧（解析不了现代 JS），请在系统设置中更新「Android System WebView」后再试

### 浏览器预览（最轻量，无需 Tauri）

```bash
python3 -m http.server 9017 --directory frontend
```

浏览器打开 <http://localhost:9017/>。

## 构建与打包

前置依赖：Node.js 18+（含 npm，用于前端 esbuild 构建）、Rust 工具链（rustup）、[Tauri 2 CLI](https://v2.tauri.app/start/cli/)（`cargo install tauri-cli --version "^2"`）；
构建 Android APK 另需 JDK 17+、Android SDK（含 NDK），并添加交叉编译目标：

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

> 国内网络提示：首次构建需下载 tauri CLI、cargo 依赖与 Gradle 等，若下载缓慢或反复失败，可配置镜像源（cargo 用 rsproxy、Gradle 用腾讯云镜像），失败后重试通常可恢复；`./build.sh check` 可检查工具链完整性。

### 一键编译工具（推荐）

仓库根目录的 `build.sh` 提供 **TUI 交互式菜单**与**命令行参数**双模式：

```bash
./build.sh                        # 进入交互式菜单（环境检查/桌面/Android/全量/清理/版本管理）
./build.sh check                  # 检查工具链环境（缺啥补啥）
./build.sh desktop -b deb,rpm     # 桌面端，打包 deb + rpm
./build.sh desktop --debug        # 桌面端 debug 构建
./build.sh android --debug        # Android debug APK（universal 四 ABI）
./build.sh android --abi arm64-v8a  # Android 仅 arm64-v8a
./build.sh all                    # 全量构建（桌面 release + Android release）
./build.sh clean all -y           # 清理全部构建产物（跳过确认）
./build.sh version 2.6.0          # 统一版本号（tauri.conf/Cargo.toml/manifest 同步）
./build.sh help                   # 完整帮助
```

命令选项：`-d/--debug`、`-r/--release`、`-b/--bundle deb|rpm|appimage|all`、`-a/--arch host|aarch64`、`--abi universal|arm64-v8a|armeabi-v7a|x86|x86_64`。

> 提示：`--abi` 单架构构建复用 universal 构建已编译并链接进 jniLibs 的 .so（仅组装 APK）。若从未跑过 universal，先执行一次 `./build.sh android`。

### 手动命令（等价操作）

```bash
tauri dev     # 开发模式（自动拉起前端静态服务，热重载），或 ./dev.sh
# 手动构建前需先构建前端（esbuild 转译到 frontend/dist/；build.sh / CI 会自动执行）：
cd frontend && npm ci && npm run build && cd ..
tauri build   # 桌面发布版安装包（产物在 src-tauri/target/release/bundle/）

tauri android init                    # 首次生成 Android 工程（src-tauri/gen/android/，可重新生成）
tauri android build --apk --debug     # 构建 debug APK
```

APK 产物：`src-tauri/gen/android/app/build/outputs/apk/universal/debug/geometry-calculator_2.5.0_universal-debug.apk`（文件名含应用名/版本/flavor）

- 系统要求：Android 7.0（API 24）及以上；WebView 内核要求同「下载安装包」说明（Android 9 自带可运行，Android 7/8 需更新 Android System WebView）
- 架构：arm64-v8a / armeabi-v7a / x86 / x86_64 四路全打（universal APK）
- 注意：`src-tauri/gen/android/` 内含 Gradle 9 兼容补丁，`build.sh clean deep` 会删除整个工程，非必要不要用 deep 清理（`build.sh` 会在下次 Android 构建时自动重建并重打补丁）

### Gradle 9 兼容补丁（Android，记录于 2026-08-26）

Tauri 官方生成的 Android 工程默认 Gradle 8.14.3，**最高只支持 Java 24**。若本机 JDK 为 25 或更高（例如较新的 Fedora 仅提供 25/26），需升级至 Gradle 9.5.1 并适配五处生成代码：

| # | 文件 | 改动 |
|---|---|---|
| 1 | `gen/android/gradle/wrapper/gradle-wrapper.properties` | 官方源 → 腾讯云镜像 Gradle 9.5.1 |
| 2 | `gen/android/build.gradle.kts` | AGP 8.11.0 + KGP 2.3.20（Gradle 9 需 KGP 2.0.20+） |
| 3 | `gen/android/app/build.gradle.kts` 与 cargo registry 内 tauri crate 的 `mobile/android/build.gradle.kts` | `kotlinOptions` → `kotlin.compilerOptions`（KGP 2.x 移除前者） |
| 4 | `gen/android/buildSrc/.../BuildTask.kt` | `project.exec`（Gradle 9 已移除）→ `ExecOperations` 注入 + `@Inject` 构造 |
| 5 | `gen/android/app/src/main/res/values/strings.xml`（+ 新增 `values-zh/`） | 应用名中英自适应：中文系统显示「几何计算器」，其余显示 `Geometry Calculator` |

APK 产物文件名（`geometry-calculator_<版本>_<flavor>-<构建类型>.apk`）不是 Gradle 补丁：AGP 8 已移除在构建脚本里改 APK 文件名的 API，`build.sh` 与 CI 改为**构建完成后在产物目录内重命名**（见 `rename_android_apk`）。

以上改动位于可重新生成的 `gen/` 与 cargo registry 内，**不进版本库**（`gen/` 被 .gitignore 忽略）。因此：

- 每次执行 `./build.sh android`，脚本会**自动检测**补丁是否缺失或已被还原，缺失时自动 `tauri android init`（若 `gen/` 被删）并**重打全部补丁**，无需手动处理；
- **JDK ≤ 24** 的环境直接走官方流程即可，不受补丁影响；
- 若将来 Tauri 官方模板支持 Gradle 9，这些补丁将不再需要，`build.sh` 检测到新模板时也不会重复改动。

引擎源码、测试与浏览器编译见 `backend/src/`（TypeScript）；功能说明见页面内「文档」tab 的维护者《使用指南》《更新日志》。

### 自动发布（GitHub Actions）

推送 `v*` 标签（如 `v2.5.0`）触发 [release.yml](.github/workflows/release.yml)：

- 自动构建三平台桌面安装包（Linux deb/rpm/AppImage、Windows NSIS 安装器、macOS dmg）与 Android universal APK
- Windows 额外附带**便携单文件版**（`*-portable.exe`，免安装、双击即用；需系统已装 WebView2 Runtime，Windows 11 与现代 Windows 10 已预装，安装版会自动处理）
- Android 产出 **universal 通吃包**（四 ABI 全打）与**各单架构小包**（`arm64-v8a` / `armeabi-v7a` / `x86` / `x86_64`）——现代手机用 `arm64-v8a` 小包即可，按需下载省流量与存储
- 产物（含 SHA256 校验和）自动挂到 GitHub Release **草稿**——草稿不公开，检查无误后手动点「发布」
- 在 Actions 面板手动触发则只构建并留存 workflow artifacts，不创建任何 Release

---

原版 README（原作者内容）已完整保留，见 [README-Origin.md](README-Origin.md)，此处不再重复。

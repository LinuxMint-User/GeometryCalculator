#!/usr/bin/env bash
# =============================================================================
# 几何计算器（GeometryCalculator）编译工具
#
# 双模式：
#   1. 交互式：直接运行 ./build.sh 进入序号菜单，功能最全
#   2. 命令行参数：./build.sh <命令> [选项]，提供基础一键操作
#
# 支持：
#   - 环境检查（工具链完整性诊断）
#   - 桌面端构建（debug/release、打包格式、架构）
#   - Android APK 构建（debug/release、指定 ABI）
#   - 全量构建（桌面 + Android）
#   - 构建产物清理（含「彻底清理」需确认）
#   - 版本管理（读取 / 设置，同步 tauri.conf.json / Cargo.toml / Cargo.lock / manifest.json / package.json）
#
# 环境：Linux/macOS（Windows 请用 WSL 或 PowerShell 脚本）
# =============================================================================

set -euo pipefail

# ---- 常量 ----------------------------------------------------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_DIR="$ROOT/src-tauri"
GEN_DIR="$TAURI_DIR/gen"
GEN_ANDROID_DIR="$GEN_DIR/android"
FRONTEND_DIR="$ROOT/frontend"
MANIFEST="$FRONTEND_DIR/doc/manifest.json"
TAURI_CONF="$TAURI_DIR/tauri.conf.json"
CARGO_TOML="$TAURI_DIR/Cargo.toml"
CARGO_LOCK="$TAURI_DIR/Cargo.lock"
PKG_JSON="$TAURI_DIR/package.json"

# Android 工程内的补丁目标文件（Gradle 9 兼容，见 apply_android_patches）
WRAPPER_PROPERTIES="$GEN_ANDROID_DIR/gradle/wrapper/gradle-wrapper.properties"
ROOT_BUILD_GRADLE="$GEN_ANDROID_DIR/build.gradle.kts"
APP_BUILD_GRADLE="$GEN_ANDROID_DIR/app/build.gradle.kts"
BUILDTASK_FILE="$GEN_ANDROID_DIR/buildSrc/src/main/java/io/github/linuxmintuser/geometrycalculator/kotlin/BuildTask.kt"
# tauri crate 内的构建脚本（cargo registry，cargo update 后会还原，同样需重打）
CRATE_GRADLE_GLOB="$HOME/.cargo/registry/src/*/tauri-*/mobile/android/build.gradle.kts"

# Gradle 9 兼容补丁的版本组合（对应 JDK 25+ 环境）
PATCH_AGP_VERSION="8.11.0"
PATCH_KGP_VERSION="2.3.20"
PATCH_GRADLE_VERSION="9.5.1"
PATCH_GRADLE_URL="https\://mirrors.cloud.tencent.com/gradle/gradle-9.5.1-bin.zip"

# 桌面端支持的目标架构（tauri 交叉打包需对应 gcc 工具链）
DESKTOP_ARCHES=("x86_64" "aarch64")
# Android ABI → tauri CLI target 映射（--target 值，见 android_build）
declare -A ANDROID_TARGET_MAP=( ["arm64-v8a"]="aarch64" ["armeabi-v7a"]="armv7" ["x86"]="i686" ["x86_64"]="x86_64" )
ANDROID_ABIS=("universal" "arm64-v8a" "armeabi-v7a" "x86" "x86_64")
# rustup 交叉编译目标（universal 全 ABI 所需，顺序对应 ABIS 1-4）
ANDROID_RUST_TARGETS=("aarch64-linux-android" "armv7-linux-androideabi" "i686-linux-android" "x86_64-linux-android")

# ---- 颜色输出 ------------------------------------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'
else
  C_RESET=""; C_BOLD=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_CYAN=""
fi

info()  { printf '%s[信息]%s %s\n'  "$C_CYAN" "$C_RESET" "$*"; }
ok()    { printf '%s[成功]%s %s\n'  "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '%s[警告]%s %s\n'  "$C_YELLOW" "$C_RESET" "$*"; }
err()   { printf '%s[错误]%s %s\n'  "$C_RED" "$C_RESET" "$*" >&2; }
hdr()   { printf '\n%s%s%s\n' "$C_BOLD" "$*" "$C_RESET"; }

# 对齐输出两列表格行：prow <组件> <状态>——组件列按显示宽度（中文按 2 宽）补空格对齐到 32，
# 避免中英文混排时 printf %-Ns 按字符数对齐导致的歪扭
prow() {
  python3 -c '
import sys, unicodedata
name, status = sys.argv[1], sys.argv[2]
w = sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in name)
print(name + (" " * max(1, 32 - w)) + status)
' "$1" "$2"
}

# 出错时打印位置（生产环境必备的排障信息）
err_trap() {
  local rc=$?
  err "脚本在第 $1 行出错（退出码 $rc），构建终止。"
  exit "$rc"
}
trap 'err_trap $LINENO' ERR

# ---- 中断（Ctrl+C / kill）收尾 ------------------------------------------
# 构建中途按 Ctrl+C（SIGINT）或收到 SIGTERM 时执行收尾：
#   1. 删除明确的临时文件（打包/修复脚本产物）
#   2. 保留构建缓存（src-tauri/target/、frontend/dist/、gen/）：cargo/gradle/
#      esbuild 均有增量机制，半成品下次构建会自动补齐或覆盖，误删反而触发
#      全量重编；Android 补丁若被打断到一半，下次构建前会被自动检测并重打
#   3. 提示彻底清理方法后以 130/143 退出
interrupt_cleanup() {
  local rc="${1:-130}"
  printf '\n%s%s%s\n' "$C_YELLOW" "收到中断信号，正在收尾…" "$C_RESET"
  rm -f "$TAURI_DIR/fixed.sfs" "$TAURI_DIR/runtime.bin" "$TAURI_DIR/appimagetool.AppImage" 2>/dev/null || true
  rm -rf "$TAURI_DIR/squashfs-root" 2>/dev/null || true
  printf '%s\n' "已清理临时文件。构建缓存（src-tauri/target/、frontend/dist/）已保留："
  printf '%s\n' "  · 下次构建会自动增量补齐，无需手动处理"
  printf '%s\n' "  · 如需彻底清理请运行: ./build.sh clean"
  printf '%s\n' "已退出（$rc）。"
  exit "$rc"
}
trap 'interrupt_cleanup 130' INT
trap 'interrupt_cleanup 143' TERM

# 执行前打印将运行的命令，方便排障与审计
run() {
  printf '%s[执行]%s %s\n' "$C_BLUE" "$C_RESET" "$*"
  "$@"
}

# 带计时执行任务：timed <任务名> <命令...> → 执行后打印耗时（1 分钟内显示秒，否则分+秒）
timed() {
  local name="$1"; shift
  local start end rc
  start="$(date +%s)"
  "$@"
  rc=$?
  end="$(($(date +%s) - start))"
  if [ "$end" -ge 60 ]; then
    printf '%s[耗时]%s %s: %d 分 %d 秒\n' "$C_CYAN" "$C_RESET" "$name" "$((end/60))" "$((end%60))"
  else
    printf '%s[耗时]%s %s: %d 秒\n' "$C_CYAN" "$C_RESET" "$name" "$end"
  fi
  return "$rc"
}

# ---- 基础工具函数 --------------------------------------------------------
require_cmd() { # require_cmd <命令> <缺失提示>
  if ! command -v "$1" >/dev/null 2>&1; then
    err "缺少命令: $1"
    [ -n "${2:-}" ] && info "$2"
    return 1
  fi
}

get_version() { # 读取当前版本（tauri.conf.json 为准）
  python3 -c 'import json;print(json.load(open("'"$TAURI_CONF"'"))["version"])'
}

version_of() { # 读取指定文件内的版本号（用于展示差异）
  local f="$1"
  case "$f" in
    *tauri.conf.json) python3 -c 'import json;print(json.load(open("'"$f"'"))["version"])' ;;
    *Cargo.toml)      sed -n 's/^version = "\(.*\)"/\1/p' "$f" | head -1 ;;
    *manifest.json)   python3 -c 'import json;print(json.load(open("'"$f"'"))["current"])' ;;
    *package.json)    python3 -c 'import json;print(json.load(open("'"$f"'"))["version"])' ;;
  esac
}

# 版本一致性检查（tauri.conf / Cargo.toml / Cargo.lock / manifest / package.json 应一致）
check_versions() {
  local v1 v2 v3 v4 v5
  v1="$(get_version)"
  v2="$(version_of "$CARGO_TOML")"
  v3="$(version_of "$MANIFEST")"
  v5="$(version_of "$PKG_JSON")"
  if [ -f "$CARGO_LOCK" ]; then v4="$(python3 -c "
import re
s=open('$CARGO_LOCK').read()
m=re.search(r'name = \"geometry-calculator\"\nversion = \"([^\"]+)\"', s)
print(m.group(1) if m else '')")"; fi
  info "版本信息: tauri.conf=$v1  Cargo.toml=$v2  Cargo.lock=${v4:-?}  manifest=$v3  package.json=$v5"
  if [ "$v1" = "$v2" ] && [ "$v1" = "$v3" ] && [ "$v1" = "$v5" ] && { [ -z "${v4:-}" ] || [ "$v1" = "$v4" ]; }; then
    ok "版本号一致（v$v1）"
    return 0
  fi
  warn "版本号不一致，建议执行: ./build.sh version <新版本> 统一"
  return 1
}

set_version() { # set_version <新版本号>：同步 4 个文件的版本字段（文本级替换，保留原格式）
  local ver="${1:?用法: ./build.sh version <版本号>}"
  [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { err "版本号格式非法（应为 x.y.z）: $ver"; return 1; }

  hdr "设置版本号 v$ver"
  # 各文件做精确文本替换（不重排 JSON，避免破坏手工排版）
  python3 - "$TAURI_CONF" "$ver" <<'PY'
import re, sys
p, ver = sys.argv[1], sys.argv[2]
s = open(p, encoding="utf-8").read()
s, n = re.subn(r'(\n\s*"version"\s*:\s*")[^"]+(",)', r'\g<1>'+ver+r'\g<2>', s, count=1)
assert n == 1, f"{p} 未找到 version 字段"
open(p, "w", encoding="utf-8").write(s)
print("  更新", p, "->", ver)
PY
  python3 - "$CARGO_TOML" "$ver" <<'PY'
import re, sys
p, ver = sys.argv[1], sys.argv[2]
s = open(p, encoding="utf-8").read()
s, n = re.subn(r'(?m)^version = ".*"$', f'version = "{ver}"', s, count=1)
assert n == 1, f"{p} 未找到 version 字段"
open(p, "w", encoding="utf-8").write(s)
print("  更新", p, "->", ver)
PY
  python3 - "$CARGO_LOCK" "$ver" <<'PY'
import re, sys
p, ver = sys.argv[1], sys.argv[2]
s = open(p, encoding="utf-8").read()
s, n = re.subn(r'(name = "geometry-calculator"\nversion = ")[^"]+(")', lambda m: m.group(1)+ver+m.group(2), s, count=1)
assert n == 1, f"{p} 未找到 geometry-calculator 版本"
open(p, "w", encoding="utf-8").write(s)
print("  更新", p, "->", ver)
PY
  python3 - "$MANIFEST" "$ver" <<'PY'
import re, sys
p, ver = sys.argv[1], sys.argv[2]
s = open(p, encoding="utf-8").read()
s, n = re.subn(r'("current"\s*:\s*")[^"]+(")', r'\g<1>'+ver+r'\g<2>', s, count=1)
assert n == 1, f"{p} 未找到 current 字段"
if f'"id": "{ver}"' not in s:
    s, n2 = re.subn(r'("versions"\s*:\s*\[\s*\n)', r'\g<1>    { "id": "%s", "label": "v%s" },\n' % (ver, ver), s, count=1)
    assert n2 == 1, f"{p} 未找到 versions 数组"
open(p, "w", encoding="utf-8").write(s)
print("  更新", p, "->", ver)
PY
  python3 - "$PKG_JSON" "$ver" <<'PY'
import re, sys
p, ver = sys.argv[1], sys.argv[2]
s = open(p, encoding="utf-8").read()
s, n = re.subn(r'(\n\s*"version"\s*:\s*")[^"]+(",)', r'\g<1>'+ver+r'\g<2>', s, count=1)
assert n == 1, f"{p} 未找到 version 字段"
open(p, "w", encoding="utf-8").write(s)
print("  更新", p, "->", ver)
PY
  ok "版本已统一为 v$ver"
  warn "记得手动补充 frontend/doc/maintainer/changelog.md 的更新日志"
}

# ---- 环境检查 ------------------------------------------------------------
check_env() {
  hdr "工具链环境检查"
  local rc=0
  local c md ok_flag
  prow "组件" "状态"

  c=(bash node python3 git rustup cargo)
  for x in "${c[@]}"; do
    if command -v "$x" >/dev/null 2>&1; then
      prow "$x" "$(ok ✓ 已安装)"
    else
      prow "$x" "$(err ✗ 缺失)"; rc=1
    fi
  done

  if command -v tauri >/dev/null 2>&1; then
    prow "tauri CLI" "$(ok ✓ $(tauri --version 2>/dev/null | head -1))"
  else
    prow "tauri CLI" "$(err ✗ 缺失)"; rc=1
    info "安装: cargo install tauri-cli --version \"^2\""
  fi

  if [ -f "$FRONTEND_DIR/dist/js/main.js" ]; then
    prow "前端构建产物 (dist)" "$(ok ✓ 已构建)"
  else
    prow "前端构建产物 (dist)" "$(warn ○ 未构建（构建时自动执行 npm run build）)"
  fi

  # 桌面交叉编译工具链（可选）
  local host_arch="$(uname -m)"
  if [ "$host_arch" = "x86_64" ] && command -v aarch64-linux-gnu-gcc >/dev/null 2>&1; then
    prow "aarch64 交叉 gcc" "$(ok ✓ 可用)"
  elif [ "$host_arch" = "x86_64" ]; then
    prow "aarch64 交叉 gcc" "$(warn ○ 未装，桌面交叉编译不可用)"
  fi

  # Android 工具链
  hdr "Android 工具链"
  if command -v java >/dev/null 2>&1; then
    prow "JDK" "$(ok ✓ $(java -version 2>&1 | head -1))"
  else
    prow "JDK" "$(err ✗ 缺失)"; rc=1
  fi
  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
  if [ -d "$sdk" ]; then
    prow "Android SDK" "$(ok ✓ $sdk)"
  else
    prow "Android SDK" "$(err ✗ 缺失)"; rc=1
    info "设置 ANDROID_HOME 指向 SDK 目录（含 NDK、platform-tools）"
  fi

  local missing_targets=()
  for t in "${ANDROID_RUST_TARGETS[@]}"; do
    rustup target list --installed 2>/dev/null | grep -qx "$t" || missing_targets+=("$t")
  done
  if [ "${#missing_targets[@]}" -eq 0 ]; then
    prow "rustup Android 目标" "$(ok ✓ 4/4 已安装)"
  else
    prow "rustup Android 目标" "$(warn ○ 缺失: ${missing_targets[*]})"
    info "安装: rustup target add ${missing_targets[*]}"
  fi

  if [ -f "$GEN_ANDROID_DIR/gradlew" ]; then
    if grep -q "ExecOperations" "$BUILDTASK_FILE" 2>/dev/null; then
      prow "Android 工程 (gen)" "$(ok ✓ 存在，Gradle 9 补丁已打)"
    else
      prow "Android 工程 (gen)" "$(warn ○ 存在，补丁缺失（构建时会自动重打）)"
    fi
  else
    prow "Android 工程 (gen)" "$(warn ○ 不存在（构建时会自动 tauri android init）)"
  fi

  check_versions || rc=1

  if [ "$rc" -eq 0 ]; then
    ok "环境检查通过"
  else
    err "环境检查发现问题，请按提示修复"
  fi
  return "$rc"
}

# ---- 前端构建（esbuild 转译，兼容旧 WebView） ------------------------------
# 前端源码使用 ?. / ?? 等 Chrome 80 语法，老 WebView（Android 7-9 自带内核）
# 解析失败 → 界面可显示但完全无交互。这里用 esbuild 打包为单个 ESM 并降级到
# Chrome 74 语法（含 Array.prototype.at 等运行时垫片），输出 frontend/dist/，
# tauri 的 frontendDist 已指向该目录（桌面与 Android 均使用）。
frontend_build() { # 构建前端（幂等；依赖缺失时自动安装）
  require_cmd node '构建前端需 Node.js（npm）' || return 1
  require_cmd npm '构建前端需 npm（随 Node.js 安装）' || return 1
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    if [ -f "$FRONTEND_DIR/package-lock.json" ]; then
      info "前端依赖未安装，执行 npm ci"
      ( cd "$FRONTEND_DIR" && run npm ci )
    else
      info "前端依赖未安装，执行 npm install"
      ( cd "$FRONTEND_DIR" && run npm install )
    fi
  fi
  hdr "构建前端（esbuild 转译 → frontend/dist/）"
  ( cd "$FRONTEND_DIR" && run npm run build )
}

# ---- 桌面端构建 ----------------------------------------------------------
desktop_build() { # desktop_build <debug|release> <bundle列表或all> <架构>
  local mode="${1:-release}" bundles="${2:-all}" arch="${3:-host}"

  require_cmd tauri '安装: cargo install tauri-cli --version "^2"' || return 1

  # 架构处理：host 或显式指定
  local tauri_arch=()
  case "$arch" in
    host|"$(uname -m)")
      info "桌面架构: 当前主机 $(uname -m)"
      ;;
    aarch64|x86_64)
      if [ "$arch" != "$(uname -m)" ]; then
        require_cmd "aarch64-linux-gnu-gcc" "交叉编译需安装: sudo dnf install aarch64-linux-gnu-gcc" || return 1
        tauri_arch=(--target "aarch64-unknown-linux-gnu")
      fi
      info "桌面架构: $arch"
      ;;
    *)
      err "不支持的桌面架构: $arch（可选: host|aarch64|x86_64）"; return 1
      ;;
  esac

  # 打包格式校验
  local bundle_args=()
  if [ "$bundles" = "all" ]; then
    info "打包格式: 全部（deb/rpm）"
  else
    IFS=',' read -ra bl <<< "$bundles"
    for b in "${bl[@]}"; do
      case "$b" in deb|rpm) bundle_args+=(--bundles "$b") ;;
        *) err "不支持的打包格式: $b（可选: deb|rpm|all）"; return 1 ;;
      esac
    done
    info "打包格式: ${bl[*]}"
  fi

  local mode_flag=()
  if [ "$mode" = "debug" ]; then mode_flag=(--debug); fi

  hdr "构建桌面端（${mode}，架构 $( [ "$arch" = "host" ] && echo "$(uname -m)" || echo "$arch" )）"
  frontend_build || return 1
  # 不发布 AppImage：linuxdeploy 会把构建机的 GTK/WebKitGTK/libwayland 等打进包，
  # 在新发行版（如 Fedora 44 / Mesa 26）上白屏、启动崩溃、输入卡死等问题反复；
  # deb/rpm 用系统依赖库，兼容性稳定（参考 tauri-apps/tauri#15665）
  ( cd "$TAURI_DIR" && run tauri build "${mode_flag[@]}" "${bundle_args[@]}" "${tauri_arch[@]}" )
  ok "桌面端构建完成，产物在 src-tauri/target/$( [ "$mode" = debug ] && echo debug || echo release )/bundle/"
}

# ---- Android 工程补丁（Gradle 9 兼容） ----------------------------------
# 背景：Tauri 官方生成的 Android 工程默认 Gradle 8.14.3（最高支持 Java 24），
# 在 JDK 25+ 环境（如较新的 Fedora 只有 25/26）下会崩。升级到 Gradle 9.x 后
# 官方模板的部分写法已不兼容，需要以下五处适配。这些改动位于可重新生成的
# gen/ 与 cargo registry 内，不进版本库，故构建前自动检测并重打。

ensure_android_gen() { # gen/ 缺失时自动 tauri android init 重新生成
  if [ -f "$GEN_ANDROID_DIR/gradlew" ]; then return 0; fi
  require_cmd tauri '安装: cargo install tauri-cli --version "^2"' || return 1
  warn "Android 工程缺失（$GEN_ANDROID_DIR），正在重新生成…"
  ( cd "$TAURI_DIR" && run tauri android init )
  info "tauri android init 完成，随后自动打 Gradle 9 兼容补丁"
}

find_tauri_crate_build() { # 定位 cargo registry 里最新 tauri crate 的构建脚本
  # ls 无匹配时退出码 2，配合 set -e/pipefail 会直接终止脚本；首次构建
  # （或 cargo update 前）registry 尚未下载 tauri crate，属正常情况，兜底返回空
  ls -t $CRATE_GRADLE_GLOB 2>/dev/null | head -1 || true
}

# 把 kotlinOptions { jvmTarget = "1.8" } 转换为 kotlin.compilerOptions 写法
# （Gradle 9 + KGP 2.x 移除 kotlinOptions）
patch_kotlin_options() {
  local f="$1"
  python3 - "$f" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
if "kotlinOptions" not in s:
    print("  无需转换", p)
    sys.exit(0)
m = re.search(r'kotlinOptions\s*\{[^}]*?jvmTarget\s*=\s*"([^"]+)"', s, re.S)
jvm = {"1.8": "JVM_1_8", "11": "JVM_11", "17": "JVM_17"}.get(m.group(1) if m else "1.8", "JVM_1_8")
block = ('kotlin {\n'
         '    compilerOptions {\n'
         '        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.' + jvm + '\n'
         '    }\n'
         '}')
s2, n = re.subn(r'kotlinOptions\s*\{[^}]*\}', block, s, count=1, flags=re.S)
assert n == 1, f"{p} 的 kotlinOptions 块解析失败"
open(p, "w", encoding="utf-8").write(s2)
print("  已转换", p)
PY
}

# BuildTask.kt 补丁版模板（原版用 project.exec，Gradle 9 已移除 → ExecOperations 注入）
write_buildtask_patch() {
  cat > "$BUILDTASK_FILE" <<'KT'
import java.io.File
import javax.inject.Inject
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import org.gradle.process.ExecOperations

open class BuildTask @Inject constructor(private val execOperations: ExecOperations) : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val executable = """node""";
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )
                
                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("tauri", "android", "android-studio-script");

        execOperations.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}
KT
}

apply_android_patches() { # 检测并重打补丁（幂等，可重复执行）
  # 参数 --ci：CI 专用模式（官方 Gradle 8.14.3 + JDK 21）。
  #   CI 跳过补丁 1-3（仅 Gradle 9 / JDK 25 环境需要），但应用补丁 4（project.exec
  #   弃用 API，Gradle 8/9 通用）+ 补丁 5（应用名中英）+ 补丁 6（minSdk 28）。
  local ci_mode=0
  [ "${1:-}" = "--ci" ] && ci_mode=1
  ensure_android_gen || return 1

  local patched=0

  if [ "$ci_mode" = "0" ]; then
  # 1) gradle wrapper：官方 Gradle 8.14.3 → 腾讯云镜像 Gradle 9.5.1
  if [ -f "$WRAPPER_PROPERTIES" ] && ! grep -q "gradle-${PATCH_GRADLE_VERSION}-bin.zip" "$WRAPPER_PROPERTIES"; then
    info "补丁 1/6：Gradle wrapper → ${PATCH_GRADLE_VERSION}（腾讯云镜像）"
    # 注意：properties 里 URL 冒号需转义（\:），sed 替换串要把 \ 翻倍成 \\ 才能原样写出
    sed -i "s#^distributionUrl=.*#distributionUrl=${PATCH_GRADLE_URL//\\/\\\\}#" "$WRAPPER_PROPERTIES"
    patched=$((patched+1))
  fi

  # 2) 根 build.gradle.kts：AGP + KGP 升级到兼容 Gradle 9 的版本
  if [ -f "$ROOT_BUILD_GRADLE" ] && ! grep -q "kotlin-gradle-plugin:${PATCH_KGP_VERSION}" "$ROOT_BUILD_GRADLE"; then
    info "补丁 2/6：AGP ${PATCH_AGP_VERSION} + KGP ${PATCH_KGP_VERSION}"
    sed -i "s#classpath(\"com.android.tools.build:gradle:[^\"]*\")#classpath(\"com.android.tools.build:gradle:${PATCH_AGP_VERSION}\")#; s#classpath(\"org.jetbrains.kotlin:kotlin-gradle-plugin:[^\"]*\")#classpath(\"org.jetbrains.kotlin:kotlin-gradle-plugin:${PATCH_KGP_VERSION}\")#" "$ROOT_BUILD_GRADLE"
    patched=$((patched+1))
  fi

  # 3) app/build.gradle.kts + crate build.gradle.kts：kotlinOptions → compilerOptions
  if [ -f "$APP_BUILD_GRADLE" ] && grep -q "kotlinOptions" "$APP_BUILD_GRADLE"; then
    info "补丁 3/6：app/build.gradle.kts kotlinOptions → compilerOptions"
    patch_kotlin_options "$APP_BUILD_GRADLE"
    patched=$((patched+1))
  fi
  local crate_build; crate_build="$(find_tauri_crate_build)"
  if [ -n "$crate_build" ] && grep -q "kotlinOptions" "$crate_build"; then
    info "补丁 3/6：tauri crate $crate_build kotlinOptions → compilerOptions"
    patch_kotlin_options "$crate_build"
    patched=$((patched+1))
  fi
  fi

  # 4) BuildTask.kt：project.exec 自 Gradle 8 起标弃用（编译告警），Gradle 9 移除；
  #    ExecOperations 注入两版通用，CI 一并应用以消除告警
  if [ -f "$BUILDTASK_FILE" ] && ! grep -q "ExecOperations" "$BUILDTASK_FILE"; then
    info "补丁 4/5：BuildTask.kt 改用 ExecOperations 注入"
    write_buildtask_patch
    patched=$((patched+1))
  fi

  # 5) 应用名中英自适应：默认英文，中文系统显示「几何计算器」
  local strings_file="$GEN_ANDROID_DIR/app/src/main/res/values/strings.xml"
  if [ -f "$strings_file" ] && ! grep -q 'name="app_name">Geometry Calculator' "$strings_file"; then
    info "补丁 5/6：应用名中英自适应（values + values-zh）"
    mkdir -p "$GEN_ANDROID_DIR/app/src/main/res/values-zh"
    cat > "$strings_file" <<'XML'
<resources>
    <string name="app_name">Geometry Calculator</string>
    <string name="main_activity_title">Geometry Calculator</string>
</resources>
XML
    cat > "$GEN_ANDROID_DIR/app/src/main/res/values-zh/strings.xml" <<'XML'
<resources>
    <string name="app_name">几何计算器</string>
    <string name="main_activity_title">几何计算器</string>
</resources>
XML
    patched=$((patched+1))
  fi

  # 6) minSdk 24 → 28（Android 9）：自带 WebView 内核（Chrome 74）才能解析
  #    前端 esbuild 降级后的语法，Android 7/8 系统 WebView 过旧无法使用
  if [ -f "$APP_BUILD_GRADLE" ] && ! grep -q "minSdk = 28" "$APP_BUILD_GRADLE"; then
    info "补丁 6/6：minSdk 24 → 28（Android 9，WebView 兼容）"
    sed -i 's/minSdk = 24/minSdk = 28/' "$APP_BUILD_GRADLE"
    patched=$((patched+1))
  fi

  if [ "$patched" -gt 0 ]; then
    ok "Android 工程补丁已重新应用（$patched 处）"
  else
    info "Android 工程补丁已就位，无需重打"
  fi
}

# ---- Android 构建 --------------------------------------------------------

# 重命名 APK 产物：geometry-calculator_<版本>_<flavor>-<buildType>.apk
# （AGP 8 已移除 Gradle 层改 APK 文件名的 API（新旧 Variant API 均无
#   outputFileName），改为构建完成后在产物目录内重命名，可靠且不影响构建链路）
rename_android_apk() { # rename_android_apk <apk目录> <flavor>
  local dir="$1" flavor="$2" apk="" f
  for f in "$dir"/*.apk; do
    [ -f "$f" ] || continue
    # 跳过已改名的产物（geometry-calculator_*），只认刚构建的原始 APK，
    # 避免多 ABI 连续构建时目录残留旧文件被误取
    [[ "$(basename "$f")" == geometry-calculator_* ]] && continue
    apk="$f" && break
  done
  [ -z "$apk" ] && { err "未找到 APK 产物：${dir#"$ROOT"/}"; return 1; }
  local buildtype; buildtype="$(basename "$(dirname "$apk")")"
  local version; version="$(get_version)"
  local target="$dir/geometry-calculator_${version}_${flavor}-${buildtype}.apk"
  if [ "$(basename "$apk")" = "$(basename "$target")" ]; then
    info "APK 已命名：${target#"$ROOT"/}"
    return 0
  fi
  mv -f "$apk" "$target"
  ok "APK 构建完成，产物：${target#"$ROOT"/}"
}

android_build() { # android_build <debug|release> <abi列表或universal>
  local mode="${1:-debug}" abi="${2:-universal}"
  local mode_flag=() build_type

  if [ "$mode" = "debug" ]; then mode_flag=(--debug); build_type="Debug"; else build_type="Release"; fi

  # 产物目录映射：tauri 单 target 构建与 universal 全量构建都输出到
  # outputs/apk/universal/<type>/（--target 只是过滤编译的 so，组装仍走 universal flavor）
  local apk_dir="$GEN_ANDROID_DIR/app/build/outputs/apk/universal/$(echo "$build_type" | tr '[:upper:]' '[:lower:]')"

  # 前置检查 + 自动生成/重打 Gradle 9 兼容补丁
  require_cmd tauri '安装: cargo install tauri-cli --version "^2"' || return 1
  require_cmd node '构建 Android 需 node（Gradle rust 插件执行入口）' || return 1
  apply_android_patches || return 1
  frontend_build || return 1

  # 显示用描述：universal 说明全打；组合用 + 连接，明确是一次构建进同一个包
  local abi_desc
  if [ "$abi" = "universal" ]; then
    abi_desc="universal（全部四个 ABI）"
  else
    abi_desc="${abi//,/ + }（组合进同一个 APK）"
  fi
  hdr "构建 Android APK（${mode}，ABI: $abi_desc）"
  if [ "$abi" = "universal" ]; then
    # 官方链路：四 ABI 全打（由 RustPlugin 的 universal flavor 聚合）
    ( cd "$TAURI_DIR" && run tauri android build --apk "${mode_flag[@]}" )
    rename_android_apk "$apk_dir" universal
  else
    # 直接构建指定 ABI（无需先构建 universal 大包）：tauri CLI 原生支持
    # --target（aarch64/armv7/i686/x86_64）。ABI 可传组合（逗号分隔，
    # 如 arm64-v8a,armeabi-v7a）→ 一次构建编译多个架构的 so，聚合进同一个 APK
    local targets=() t
    IFS=',' read -ra abis <<< "$abi"
    for t in "${abis[@]}"; do
      local tg="${ANDROID_TARGET_MAP[$t]:-}"
      [ -z "$tg" ] && { err "不支持的 ABI: $t（可选: universal|arm64-v8a|armeabi-v7a|x86|x86_64）"; return 1; }
      targets+=(--target "$tg")
    done
    info "构建组合 ABI：一次编译 ${abi//,/ + } 的 so 库，全部打进同一个 APK"
    ( cd "$TAURI_DIR" && run tauri android build --apk "${mode_flag[@]}" "${targets[@]}" )
    rename_android_apk "$apk_dir" "$(echo "$abi" | tr ',' '-')"
  fi
  if [ "$mode" = "release" ]; then
    warn "release APK 未签名（unsigned），正式发布需配置签名（keystore）"
  fi
}

# ---- 全量构建 ------------------------------------------------------------
build_all() { # build_all <debug|release>
  local mode="${1:-release}"
  check_env || { warn "环境检查未通过，仍将继续尝试构建（可能失败）"; }
  desktop_build "$mode" all host
  android_build "$mode" universal
  ok "全量构建完成"
}

# ---- 清理 ----------------------------------------------------------------
clean_build() { # clean_build <desktop|android|all|deep> [yes]
  local target="${1:-all}" force="${2:-no}"
  # 确认函数（读取外层 force 变量）
  confirm() {
    [ "$force" = "yes" ] && return 0
    read -r -p "  确认删除上述内容？[y/N] " ans || return 1
    [[ "$ans" =~ ^[Yy]$ ]]
  }

  case "$target" in
    desktop)
      hdr "清理桌面构建产物"
      [ -d "$TAURI_DIR/target" ] || { info "无产物可清理（src-tauri/target/ 不存在）"; return 0; }
      du -sh "$TAURI_DIR/target"
      confirm || { info "已取消"; return 0; }
      rm -rf "$TAURI_DIR/target"; ok "已删除 src-tauri/target/"
      ;;
    android)
      hdr "清理 Android 构建产物"
      [ -d "$GEN_ANDROID_DIR/app/build" ] || { info "无产物可清理（app/build 不存在）"; return 0; }
      du -sh "$GEN_ANDROID_DIR/app/build"
      confirm || { info "已取消"; return 0; }
      rm -rf "$GEN_ANDROID_DIR/app/build"; ok "已删除 Android 构建产物"
      ;;
    all)
      hdr "清理全部构建产物（桌面 + Android + 前端）"
      local total=0
      for d in "$TAURI_DIR/target" "$GEN_ANDROID_DIR/app/build" "$FRONTEND_DIR/dist"; do
        [ -d "$d" ] && du -sh "$d"
      done
      confirm || { info "已取消"; return 0; }
      rm -rf "$TAURI_DIR/target" "$GEN_ANDROID_DIR/app/build" "$FRONTEND_DIR/dist"
      ok "已删除桌面、Android 与前端构建产物"
      ;;
    deep)
      hdr "彻底清理（含 Android 工程 gen/ 与前端依赖）"
      warn "删除 gen/ 后，下次 Android 构建需重新 tauri android init，"
      warn "且需重打 Gradle 9 兼容补丁（buildSrc/BuildTask.kt 等）！请谨慎。"
      local total=0
      for d in "$TAURI_DIR/target" "$GEN_ANDROID_DIR/app/build" "$GEN_DIR" "$FRONTEND_DIR/dist" "$FRONTEND_DIR/node_modules"; do
        [ -d "$d" ] && du -sh "$d"
      done
      confirm || { info "已取消"; return 0; }
      rm -rf "$TAURI_DIR/target" "$GEN_ANDROID_DIR/app/build" "$FRONTEND_DIR/dist" "$FRONTEND_DIR/node_modules"
      [ -n "$(ls -A "$GEN_ANDROID_DIR" 2>/dev/null)" ] && rm -rf "$GEN_DIR"
      ok "已彻底清理（下次 Android 构建需重新生成工程并重打补丁，前端依赖需重新 npm install）"
      ;;
    *)
      err "未知清理目标: $target（可选: desktop|android|all|deep）"; return 1
      ;;
  esac
}

# ---- 交互式菜单 ----------------------------------------------------------
# 读取选择：第一键按 ESC（或方向键等 ESC 开头序列）立即返回 2，无需回车；
# 其余输入按整行读取（支持多选编号/文本）。EOF 返回 1，退出码传播冒泡回主菜单。
read_choice() { # read_choice <提示> → 输出选择；EOF=1，ESC=2
  local prompt="$1" key rest
  printf '%s' "$prompt" >&2
  # 读第一键：ESC 立即响应（无需回车），普通字符继续读整行
  IFS= read -r -n1 key || return 1   # 真 EOF（无任何输入）由这里兜底
  case "$key" in
    ""|$'\n') echo ""; return 0;;            # 直接回车：空输入（默认）
    $'\x1b') printf '\n' >&2; return 2;;     # ESC：立即取消（回主菜单）
  esac
  if IFS= read -r rest; then
    echo "$key$rest"
  else
    echo "$key"
  fi
}

# 子菜单通用「返回」判断：输入 q/Q/b/B 视为返回上一级（主菜单）。
# 主菜单（TUI_NO_Q=1）下 q 不作为返回键，避免「没有上一级还提示返回」。
back_requested() { # back_requested <输入>
  [ "${TUI_NO_Q:-0}" = 1 ] && return 1
  [[ "$1" =~ ^[qQbB]$ ]]
}

confirm_yes() { # confirm_yes <提示> → 0=确认 1=取消/EOF 2=ESC
  local key rest
  printf '%s [y/N] ' "$1" >&2
  IFS= read -r -n1 key || return 1
  case "$key" in
    "") return 1;;
    $'\x1b') printf '\n' >&2; return 2;;   # ESC：立即取消
    $'\n') printf '\n' >&2; return 1;;     # 回车：默认否
  esac
  # 丢弃本行剩余输入（回车及多余字符），避免残留换行污染下一次读取
  IFS= read -r rest || true
  printf '\n' >&2
  [[ "$key" =~ ^[Yy]$ ]]
}

# 构建前参数确认清单：逐行列出所选参数，确认返回 0，取消返回 1。
# force=yes（命令行 -y）时跳过询问直接确认。
confirm_params() { # confirm_params <yes|no> <参数描述行...>
  local force="$1"; shift
  local line
  hdr "构建参数确认"
  for line in "$@"; do
    printf '  %s\n' "$line"
  done
  [ "$force" = "yes" ] && { ok "已确认（-y 跳过询问）"; return 0; }
  confirm_yes "确认无误开始构建？" || { warn "已取消构建"; return 1; }
}

# 多选解析：输入 "1,3" 或 "all"，输出数组
parse_multi() { # parse_multi <输入> <选项数组...>
  local input="$1"; shift
  local items=("$@") out=() i n
  if [ "$input" = "all" ]; then
    printf '%s\n' "${items[@]}"; return 0
  fi
  IFS=',' read -ra parts <<< "$input"
  for n in "${parts[@]}"; do
    if [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le "${#items[@]}" ]; then
      out+=("${items[$((n-1))]}")
    else
      warn "忽略无效选项: $n"
    fi
  done
  [ "${#out[@]}" -gt 0 ] && printf '%s\n' "${out[@]}"
}

show_list() { # show_list <标题> <选项数组...>
  local title="$1"; shift
  local items=("$@") i
  printf '\n%s\n' "$title"
  for i in "${!items[@]}"; do
    printf '  [%d] %s\n' "$((i+1))" "${items[$i]}"
  done
}

# ---- 交互式菜单（纯 bash 序号交互，无外部依赖） ----------------------------
# 说明：采用简单的序号输入交互，无需安装任何外部组件。曾尝试 whiptail（newt）与
# gum（charmbracelet）等 TUI 组件，终端兼容性问题反复（界面不渲染、按键行为随
# 版本/终端各异、组件无组内互斥等），已彻底放弃，统一使用纯 bash 序号交互。

# 单选菜单：tui_menu <标题> <说明> <默认tag> <tag 说明>... → 输出选中 tag；取消时输出空并返回 1
# 输入规则：直接回车 = 选默认项；q=返回；无效输入返回 1
tui_menu() {
  local title="$1" text="$2" def="$3"; shift 3
  local -a descs=() t d
  while [ "$#" -gt 0 ]; do t="$1"; d="$2"; shift 2; descs+=("$d"); done
  show_list "$text" "${descs[@]}" >&2
  # 主菜单（TUI_NO_Q=1）不提示返回键（退出走「退出」选项）；子菜单提示 ESC/q 返回
  local qhint="，ESC/q=返回"
  [ "${TUI_NO_Q:-0}" = 1 ] && qhint=""
  local n rc
  n="$(read_choice "选择 [1-${#descs[@]}]（回车=默认${def:-无}${qhint}）: ")"; rc=$?
  [ "$rc" -eq 2 ] && return 2   # ESC：冒泡回主菜单
  [ "$rc" -ne 0 ] && return 1
  back_requested "$n" && return 1
  if [ -z "$n" ]; then echo "$def"; return 0; fi
  if [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le "${#descs[@]}" ]; then
    echo "$n"
  else
    warn "无效选择: $n" >&2; return 1
  fi
}

# 多选清单：tui_checklist <标题> <说明> <默认选中tags(空格分隔)> <tag 说明>... → 输出选中 tags（空格分隔）；取消返回 1
# 输入规则：逗号分隔编号（如 1,3）多选、all 全选、回车=默认集、q=返回
tui_checklist() {
  local title="$1" text="$2" checked="$3"; shift 3
  local -a descs=() t d
  while [ "$#" -gt 0 ]; do t="$1"; d="$2"; shift 2; descs+=("$d"); done
  show_list "$text" "${descs[@]}" >&2
  local n rc
  n="$(read_choice "输入编号（逗号或空格分隔，如 1,2 或 all，回车=默认，q=返回）: ")"; rc=$?
  [ "$rc" -eq 2 ] && return 2   # ESC：冒泡回主菜单
  [ "$rc" -ne 0 ] && return 1
  back_requested "$n" && return 1
  if [ -z "$n" ]; then echo "$checked"; return 0; fi
  if [ "$n" = "all" ]; then
    for ((i=1; i<=${#descs[@]}; i++)); do printf '%s ' "$i"; done
    echo; return 0
  fi
  echo "$n" | tr ',' ' '
}

# 确认对话框：tui_yesno <标题> <文本> → 0=确认 1=取消
tui_yesno() {
  printf '%b\n\n' "$2" >&2
  confirm_yes "确认无误继续？"
}

# 文本输入：tui_inputbox <标题> <说明> <初始值> → 输出文本；取消=1，ESC=2
tui_inputbox() {
  local v rc
  v="$(read_choice "$2: ")"; rc=$?
  [ "$rc" -eq 2 ] && return 2
  [ "$rc" -ne 0 ] && return 1
  back_requested "$v" && return 1
  echo "$v"
}

# 暂停提示：tui_pause <标题> <文本> → 打印提示后读回车
tui_pause() {
  printf '%s\n' "$2" >&2
  read_choice "按回车继续…" >/dev/null || true
}

# 结果显示：tui_show_result <标题> <输出文件> → less 分页查看（保留 ANSI 颜色，q 退出）
# 注：顶部显示标题与操作提示；less 支持方向键滚动、/ 搜索（含中文）；
# 非交互环境（管道）下自动退化为直接输出
tui_show_result() {
  # less 运行期间临时忽略中断信号：less 内部把 Ctrl+C 当取消操作（不退出 less），
  # 若不屏蔽，build.sh 的 SIGINT trap 会把整个脚本收尾退出；less 退出后恢复 trap
  local old_int old_term
  old_int="$(trap -p INT)"
  old_term="$(trap -p TERM)"
  trap '' INT TERM
  {
    printf '\n%s%s%s\n' "$C_BOLD" "$1" "$C_RESET"
    printf '%s\n' "—— 滚动查看，按 q 退出 ——"
    cat "$2"
  } | less -R
  [ -n "$old_int" ] && eval "$old_int"
  [ -n "$old_term" ] && eval "$old_term"
}

# 桌面端构建：逐步向导——构建模式 → 打包格式（多选）→ 目标架构，每步可 q 返回上一步，
# 选完后显示参数清单确认再开始构建
tui_desktop() {
  local m btags a mode arch rc
  while true; do
    m="$(tui_menu "桌面端构建" "构建模式" "1" "1" "release（发行，默认）" "2" "debug（调试）")"; rc=$?
    [ "$rc" -eq 2 ] && return 0   # ESC：回主菜单
    [ "$rc" -ne 0 ] && { info "已取消"; return 0; }
    [ "$m" = "2" ] && mode="debug" || mode="release"
    while true; do
      # 2. 打包格式（多选；回车=默认 deb+rpm；q=返回模式步）
      btags="$(tui_checklist "打包格式" "打包格式（可多选，如 1,2；回车=默认 deb+rpm）" "1 2" "1" "deb" "2" "rpm")"; rc=$?
      [ "$rc" -eq 2 ] && return 0
      [ "$rc" -ne 0 ] && break
      # 3. 目标架构（q=返回格式步）
      a="$(tui_menu "目标架构" "目标架构" "1" "1" "当前主机（$(uname -m)）" "2" "aarch64（交叉编译）")"; rc=$?
      [ "$rc" -eq 2 ] && return 0
      [ "$rc" -ne 0 ] && continue
      [ "$a" = "2" ] && arch="aarch64" || arch="host"
      # 4. 参数清单确认（选否=返回格式步重选）
      local t2 bval=() bundles
      for t2 in $btags; do
        case "$t2" in 1) bval+=(deb);; 2) bval+=(rpm);; esac
      done
      bundles="$(IFS=,; echo "${bval[*]}")"
      # 无效/未识别的编号（如连写 "4567"）会解析为空，警告并原地重选，避免白跑
      [ -z "$bundles" ] && { warn "打包格式选择无效（编号需逗号或空格分隔），请重新选择" >&2; continue; }
      local arch_show; [ "$arch" = "host" ] && arch_show="$(uname -m)（当前主机）" || arch_show="$arch"
      tui_yesno "构建参数确认" "桌面端构建参数确认\n构建模式: $mode\n打包格式: $bundles\n目标架构: $arch_show\n确认开始构建？"; rc=$?
      [ "$rc" -eq 2 ] && return 0   # ESC：回主菜单
      if [ "$rc" -eq 0 ]; then
        timed "桌面端构建" desktop_build "$mode" "$bundles" "$arch"
        return 0
      fi
    done
  done
}

# Android APK 构建：逐步向导——构建模式 → 目标 ABI（多选），每步可 q 返回上一步，
# 选完后显示参数清单确认再开始构建
tui_android() {
  local m atags mode abi rc
  while true; do
    m="$(tui_menu "Android APK 构建" "构建模式" "2" "1" "release（发行，需 keystore 签名）" "2" "debug（调试，默认）")"; rc=$?
    [ "$rc" -eq 2 ] && return 0   # ESC：回主菜单
    [ "$rc" -ne 0 ] && { info "已取消"; return 0; }
    [ "$m" = "2" ] && mode="debug" || mode="release"
    while true; do
      # 2. 目标 ABI（多选；回车=默认 universal；q=返回模式步）
      atags="$(tui_checklist "目标 ABI" "目标 ABI（可多选，如 2,3；回车=默认 universal）" "1" \
          "1" "universal（全部）" \
          "2" "仅 arm 系列（arm64-v8a + armeabi-v7a）" \
          "3" "仅 x86 系列（x86 + x86_64）" \
          "4" "arm64-v8a" "5" "armeabi-v7a" "6" "x86" "7" "x86_64")"; rc=$?
      [ "$rc" -eq 2 ] && return 0
      [ "$rc" -ne 0 ] && break
      # 3. 参数清单确认（选否=返回 ABI 步重选）
      # 快捷组合（2/3）展开成具体 ABI；与单项重叠时去重（如 2+4 都含 arm64-v8a）
      local t2 aval=()
      for t2 in $atags; do
        case "$t2" in
          1) aval+=(universal);;
          2) aval+=(arm64-v8a armeabi-v7a);;
          3) aval+=(x86 x86_64);;
          4) aval+=(arm64-v8a);; 5) aval+=(armeabi-v7a);; 6) aval+=(x86);; 7) aval+=(x86_64);;
        esac
      done
      local -A seen=(); local uniq=()
      for t2 in "${aval[@]}"; do
        [ -n "${seen[$t2]+x}" ] && continue
        seen[$t2]=1; uniq+=("$t2")
      done
      # universal 已含全部 ABI，若同时勾了其他单项则只保留 universal
      if [[ " ${uniq[*]} " == *" universal "* ]]; then uniq=(universal); fi
      abi="$(IFS=,; echo "${uniq[*]}")"
      # 无效/未识别的编号（如连写 "4567"）会解析为空，警告并原地重选，避免白跑
      [ -z "$abi" ] && { warn "ABI 选择无效（编号需逗号或空格分隔），请重新选择" >&2; continue; }
      # 确认清单中的 ABI 显示：组合用 + 连接并说明打进同一个包，避免逗号误会
      local abi_show
      if [ "$abi" = "universal" ]; then
        abi_show="universal（全部 ABI）"
      else
        abi_show="${abi//,/ + }（组合进同一个 APK）"
      fi
      tui_yesno "构建参数确认" "Android APK 构建参数确认\n构建模式: $mode\n目标 ABI: $abi_show\n确认开始构建？"; rc=$?
      [ "$rc" -eq 2 ] && return 0   # ESC：回主菜单
      if [ "$rc" -eq 0 ]; then
        # universal 全打；组合 ABI（逗号分隔）一次构建成一个含多个架构 so 的包
        timed "Android APK 构建" android_build "$mode" "$abi"
        return 0
      fi
    done
  done
}

tui_clean() {
  local c target
  c="$(tui_menu "清理构建产物" "选择清理目标" "3" \
      "1" "desktop（仅桌面 target/）" \
      "2" "android（仅 Android app/build）" \
      "3" "all（桌面 + Android）" \
      "4" "deep（含 Android 工程 gen/，需重打补丁）")" || { info "已取消"; return 0; }
  case "$c" in
    1) target="desktop" ;; 2) target="android" ;;
    3) target="all" ;; 4) target="deep" ;;
    *) warn "无效选择"; return 0 ;;
  esac
  if [ "$target" = "deep" ]; then
    tui_yesno "警告" "deep 清理将删除整个 Android 工程（gen/）\n下次 Android 构建需重新生成工程并重打补丁\n仍要继续？" || { info "已取消"; return 0; }
  fi
  clean_build "$target" yes
}

tui_version() {
  hdr "版本管理"
  check_versions || true
  local v
  v="$(tui_inputbox "版本管理" "输入新版本号（如 2.6.0），留空取消" "")" || { info "已取消"; return 0; }
  [ -z "$v" ] && { info "已取消"; return 0; }
  tui_yesno "版本管理" "将版本统一为 v$v\n（同步 tauri.conf / Cargo.toml / manifest / package.json）\n确认？" || { info "已取消"; return 0; }
  set_version "$v"
}

tui_main() {
  # 非终端（CI/管道/后台）下交互菜单会挂住等输入，直接拒绝并提示用命令行模式
  if [ ! -t 0 ]; then
    err "标准输入不是终端，无法进入交互菜单（否则会挂住等待输入）"
    info "请改用命令行参数模式：./build.sh check / desktop / android / all / clean / version"
    exit 1
  fi
  # 交互菜单整体容错：菜单取消/ESC 等通过非零退出码传播，子菜单函数返回非零
  # 均回到主菜单（下面用 || true 等兜底），若保持 set -e 会在命令替换处直接退出
  set +e
  while true; do
    printf '\n%s%s%s\n' "$C_BOLD" "══════════ 几何计算器 · 编译工具 ══════════" "$C_RESET"
    info "当前版本: $(get_version)  分支: $(git -C "$ROOT" branch --show-current 2>/dev/null || echo '?')"
    local choice mrc
    # 主菜单：无上一级，隐藏返回键提示（退出走「退出」选项）；ESC/无效输入=重显菜单
    TUI_NO_Q=1
    choice="$(tui_menu "主菜单" "选择操作" "1" \
        "1" "环境检查" "2" "桌面端构建" "3" "Android APK 构建" \
        "4" "全量构建（桌面 + Android）" "5" "清理构建产物" "6" "版本管理" \
        "7" "帮助" "8" "退出")"; mrc=$?
    TUI_NO_Q=0
    [ "$mrc" -ne 0 ] && continue                            # ESC/无效输入：重显主菜单
    # 子菜单函数返回 0（取消/完成）或非零均回到主菜单；忽略返回值避免 set -e 退出菜单
    # 操作完成后暂停，避免结果被下一个菜单界面盖住
    case "$choice" in
      1)
        local r1; r1="$(mktemp)"
        timed "环境检查" check_env > "$r1" 2>&1 || true
        # 退出键提示由 tui_show_result 负责（按回车返回）
        tui_show_result "环境检查结果" "$r1"; rm -f "$r1" ;;
      2) tui_desktop || true; tui_pause "桌面端构建" "操作已结束，按回车返回主菜单" ;;
      3) tui_android || true; tui_pause "Android APK 构建" "操作已结束，按回车返回主菜单" ;;
      4)
        local am
        am="$(tui_menu "全量构建" "构建模式" "2" "1" "release（发行，需 keystore 签名）" "2" "debug（调试，默认）")" || { info "已取消"; continue; }
        [ "$am" = "2" ] && am="debug" || am="release"
        tui_yesno "构建参数确认" "全量构建（桌面 + Android）\n桌面: $am 全部打包格式（deb/rpm）\n安卓: $am universal（四 ABI）" \
          || { warn "已取消构建"; continue; }
        timed "全量构建" build_all "$am" || true
        tui_pause "全量构建" "构建已结束，按回车返回主菜单" ;;
      5) tui_clean || true; tui_pause "清理" "操作已结束，按回车返回主菜单" ;;
      6) tui_version || true; tui_pause "版本管理" "操作已结束，按回车返回主菜单" ;;
      7)
        local r7; r7="$(mktemp)"
        usage > "$r7" 2>&1
        tui_show_result "帮助" "$r7"; rm -f "$r7" ;;
      8) printf '%s\n' "再见"; break ;;
    esac
  done
}

# ---- 命令行入口 ----------------------------------------------------------
usage() {
  cat <<'EOF'
几何计算器 编译工具 (build.sh)

用法:
  ./build.sh                      进入交互式菜单
  ./build.sh check                检查工具链环境
  ./build.sh desktop [选项]       构建桌面端
  ./build.sh android [选项]       构建 Android APK
  ./build.sh all [选项]           全量构建（桌面 + Android）
  ./build.sh clean [目标] [-y]    清理构建产物
  ./build.sh version [版本号]     查看版本 / 设置并统一版本
  ./build.sh help                 显示本帮助

命令选项:
  -d, --debug       调试构建（Android/all 默认 debug；desktop 默认 release）
  -r, --release     发行构建（Android release 需配置 keystore 签名，否则 unsigned 不可安装）
  -b, --bundle F    桌面打包格式: deb|rpm|all（逗号分隔）
  -a, --arch A      桌面目标架构: host|aarch64（默认 host）
      --abi L       Android ABI: universal|arm64-v8a|armeabi-v7a|x86|x86_64（逗号分隔）
  -y, --yes         跳过确认（构建前参数确认 / 清理）
  -h, --help        帮助

注意: Android 默认构建 debug —— 自动使用 debug 签名，产物可直接安装；
      release 未配置 keystore 时产物为 unsigned（不可安装 / 上架）。

示例:
  ./build.sh check
  ./build.sh desktop -b deb,rpm
  ./build.sh desktop --debug -b rpm
  ./build.sh android --debug --abi arm64-v8a
  ./build.sh all -r
  ./build.sh clean all -y
  ./build.sh version 2.6.0
EOF
}

main() {
  local cmd="${1:-tui}"
  shift || true

  case "$cmd" in
    tui) tui_main ;;
    check|env) timed "环境检查" check_env ;;
    desktop)
      local mode="release" bundles="all" arch="host" force="no"
      while [ "$#" -gt 0 ]; do
        case "$1" in
          -d|--debug) mode="debug"; shift ;;
          -r|--release) mode="release"; shift ;;
          -b|--bundle) bundles="${2:?缺 -b 参数}"; shift 2 ;;
          -a|--arch) arch="${2:?缺 -a 参数}"; shift 2 ;;
          -y|--yes) force="yes"; shift ;;
          -h|--help) usage; return 0 ;;
          *) err "未知选项: $1"; usage; return 1 ;;
        esac
      done
      confirm_params "$force" \
        "桌面端构建" \
        "模式: $mode" \
        "打包格式: $bundles" \
        "架构: $arch" || return 0
      timed "桌面端构建" desktop_build "$mode" "$bundles" "$arch"
      ;;
    android)
      # 默认 debug：自动带 debug 签名可直接安装；release 需配置 keystore 否则 unsigned
      local mode="debug" abi="universal" force="no"
      while [ "$#" -gt 0 ]; do
        case "$1" in
          -d|--debug) mode="debug"; shift ;;
          -r|--release) mode="release"; shift ;;
          --abi) abi="${2:?缺 --abi 参数}"; shift 2 ;;
          -y|--yes) force="yes"; shift ;;
          -h|--help) usage; return 0 ;;
          *) err "未知选项: $1"; usage; return 1 ;;
        esac
      done
      # 确认清单中的 ABI 显示：组合用 + 连接并说明打进同一个包，避免逗号误会
      local abi_show
      if [ "$abi" = "universal" ]; then
        abi_show="universal（全部 ABI）"
      else
        abi_show="${abi//,/ + }（组合进同一个 APK）"
      fi
      confirm_params "$force" \
        "Android APK 构建" \
        "模式: $mode" \
        "ABI: $abi_show" || return 0
      # 组合 ABI（逗号分隔）一次构建成一个含多个架构 so 的包
      timed "Android APK 构建" android_build "$mode" "$abi"
      ;;
    all)
      # 默认 debug：与 Android 默认一致，桌面+安卓产物均可直接安装/运行
      local mode="debug" force="no"
      while [ "$#" -gt 0 ]; do
        case "$1" in
          -d|--debug) mode="debug"; shift ;;
          -r|--release) mode="release"; shift ;;
          -y|--yes) force="yes"; shift ;;
          -h|--help) usage; return 0 ;;
          *) err "未知选项: $1"; usage; return 1 ;;
        esac
      done
      confirm_params "$force" \
        "全量构建（桌面 + Android）" \
        "桌面: $mode，全部打包格式（deb/rpm）" \
        "安卓: $mode，universal（四 ABI）" || return 0
      timed "全量构建" build_all "$mode"
      ;;
    clean)
      local target="all" force="no"
      while [ "$#" -gt 0 ]; do
        case "$1" in
          desktop|android|all|deep) target="$1"; shift ;;
          -y|--yes) force="yes"; shift ;;
          -h|--help) usage; return 0 ;;
          *) err "未知选项: $1"; usage; return 1 ;;
        esac
      done
      clean_build "$target" "$force"
      ;;
    version)
      if [ "$#" -ge 1 ] && [[ "$1" != -* ]]; then
        set_version "$1"
      else
        hdr "当前版本"
        check_versions
      fi
      ;;
    help|-h|--help) usage ;;
    *)
      err "未知命令: $cmd（无参数运行进入交互菜单，或 ./build.sh help）"
      return 1
      ;;
  esac
}

# 直接执行时进入主流程；被 source（如测试/复用函数）时不执行
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi

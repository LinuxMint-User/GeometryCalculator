#!/usr/bin/env bash
# =============================================================================
# 几何计算器（GeometryCalculator）编译工具
#
# 双模式：
#   1. 交互式（TUI）：直接运行 ./build.sh 进入菜单，功能最全
#   2. 命令行参数：./build.sh <命令> [选项]，提供基础一键操作
#
# 支持：
#   - 环境检查（工具链完整性诊断）
#   - 桌面端构建（debug/release、打包格式、架构）
#   - Android APK 构建（debug/release、指定 ABI）
#   - 全量构建（桌面 + Android）
#   - 构建产物清理（含「彻底清理」需确认）
#   - 版本管理（读取 / 设置，同步 tauri.conf.json / Cargo.toml / manifest.json）
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

# 桌面端支持的目标架构（tauri 交叉打包需对应 gcc 工具链）
DESKTOP_ARCHES=("x86_64" "aarch64")
# Android ABI → Gradle flavor 映射（对应 gen/android buildSrc RustPlugin.kt）
declare -A ABI_FLAVOR_MAP=( ["universal"]="Universal" ["arm64-v8a"]="Arm64" ["armeabi-v7a"]="Arm" ["x86"]="X86" ["x86_64"]="X86_64" )
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

# 出错时打印位置（生产环境必备的排障信息）
err_trap() {
  local rc=$?
  err "脚本在第 $1 行出错（退出码 $rc），构建终止。"
  exit "$rc"
}
trap 'err_trap $LINENO' ERR

# 执行前打印将运行的命令，方便排障与审计
run() {
  printf '%s[执行]%s %s\n' "$C_BLUE" "$C_RESET" "$*"
  "$@"
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
  esac
}

# 版本一致性检查（tauri.conf / Cargo.toml / Cargo.lock / manifest 应一致）
check_versions() {
  local v1 v2 v3 v4
  v1="$(get_version)"
  v2="$(version_of "$CARGO_TOML")"
  v3="$(version_of "$MANIFEST")"
  if [ -f "$CARGO_LOCK" ]; then v4="$(python3 -c "
import re
s=open('$CARGO_LOCK').read()
m=re.search(r'name = \"geometry-calculator\"\nversion = \"([^\"]+)\"', s)
print(m.group(1) if m else '')")"; fi
  info "版本信息: tauri.conf=$v1  Cargo.toml=$v2  Cargo.lock=${v4:-?}  manifest=$v3"
  if [ "$v1" = "$v2" ] && [ "$v1" = "$v3" ] && { [ -z "${v4:-}" ] || [ "$v1" = "$v4" ]; }; then
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
  ok "版本已统一为 v$ver"
  warn "记得手动补充 frontend/doc/maintainer/changelog.md 的更新日志"
}

# ---- 环境检查 ------------------------------------------------------------
check_env() {
  hdr "工具链环境检查"
  local rc=0
  local c md ok_flag
  printf '%-28s %s\n' "组件" "状态"

  c=(bash node python3 git rustup cargo)
  for x in "${c[@]}"; do
    if command -v "$x" >/dev/null 2>&1; then
      printf '%-28s %s\n' "$x" "$(ok ✓ 已安装)"
    else
      printf '%-28s %s\n' "$x" "$(err ✗ 缺失)"; rc=1
    fi
  done

  if command -v tauri >/dev/null 2>&1; then
    printf '%-28s %s\n' "tauri CLI" "$(ok ✓ $(tauri --version 2>/dev/null | head -1))"
  else
    printf '%-28s %s\n' "tauri CLI" "$(err ✗ 缺失)"; rc=1
    info "安装: cargo install tauri-cli --version \"^2\""
  fi

  # 桌面交叉编译工具链（可选）
  local host_arch="$(uname -m)"
  if [ "$host_arch" = "x86_64" ] && command -v aarch64-linux-gnu-gcc >/dev/null 2>&1; then
    printf '%-28s %s\n' "aarch64 交叉 gcc" "$(ok ✓ 可用)"
  elif [ "$host_arch" = "x86_64" ]; then
    printf '%-28s %s\n' "aarch64 交叉 gcc" "$(warn ○ 未装，桌面交叉编译不可用)"
  fi

  # Android 工具链
  hdr "Android 工具链"
  if command -v java >/dev/null 2>&1; then
    printf '%-28s %s\n' "JDK" "$(ok ✓ $(java -version 2>&1 | head -1))"
  else
    printf '%-28s %s\n' "JDK" "$(err ✗ 缺失)"; rc=1
  fi
  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
  if [ -d "$sdk" ]; then
    printf '%-28s %s\n' "Android SDK ($sdk)" "$(ok ✓ 存在)"
  else
    printf '%-28s %s\n' "Android SDK" "$(err ✗ 缺失)"; rc=1
    info "设置 ANDROID_HOME 指向 SDK 目录（含 NDK、platform-tools）"
  fi

  local missing_targets=()
  for t in "${ANDROID_RUST_TARGETS[@]}"; do
    rustup target list --installed 2>/dev/null | grep -qx "$t" || missing_targets+=("$t")
  done
  if [ "${#missing_targets[@]}" -eq 0 ]; then
    printf '%-28s %s\n' "rustup Android 目标" "$(ok ✓ 4/4 已安装)"
  else
    printf '%-28s %s\n' "rustup Android 目标" "$(warn ○ 缺失: ${missing_targets[*]})"
    info "安装: rustup target add ${missing_targets[*]}"
  fi

  if [ -f "$GEN_ANDROID_DIR/gradlew" ]; then
    printf '%-28s %s\n' "Android 工程 (gen)" "$(ok ✓ 存在)"
  else
    printf '%-28s %s\n' "Android 工程 (gen)" "$(warn ○ 不存在，需 tauri android init 生成)"
  fi

  check_versions || rc=1

  if [ "$rc" -eq 0 ]; then
    ok "环境检查通过"
  else
    err "环境检查发现问题，请按提示修复"
  fi
  return "$rc"
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
    info "打包格式: 全部（deb/rpm/appimage）"
    warn "AppImage 打包需从 GitHub 下载 linuxdeploy 插件，网络受限时可能卡住；失败可改用 -b deb,rpm"
  else
    IFS=',' read -ra bl <<< "$bundles"
    for b in "${bl[@]}"; do
      case "$b" in deb|rpm|appimage) bundle_args+=(--bundles "$b") ;;
        *) err "不支持的打包格式: $b（可选: deb|rpm|appimage|all）"; return 1 ;;
      esac
    done
    info "打包格式: ${bl[*]}"
  fi

  local mode_flag=()
  if [ "$mode" = "debug" ]; then mode_flag=(--debug); fi

  hdr "构建桌面端（${mode}，架构 $( [ "$arch" = "host" ] && echo "$(uname -m)" || echo "$arch" )）"
  run tauri build "${mode_flag[@]}" "${bundle_args[@]}" "${tauri_arch[@]}"
  ok "桌面端构建完成，产物在 src-tauri/target/$( [ "$mode" = debug ] && echo debug || echo release )/bundle/"
}

# ---- Android 构建 --------------------------------------------------------
android_build() { # android_build <debug|release> <abi列表或universal>
  local mode="${1:-release}" abi="${2:-universal}"
  local mode_flag=() build_type

  if [ "$mode" = "debug" ]; then mode_flag=(--debug); build_type="Debug"; else build_type="Release"; fi

  # 产物目录映射
  local apk_dir
  if [ "$abi" = "universal" ]; then
    apk_dir="$GEN_ANDROID_DIR/app/build/outputs/apk/universal/$(echo "$build_type" | tr '[:upper:]' '[:lower:]')"
  else
    local flavor="${ABI_FLAVOR_MAP[$abi]:-}"
    [ -z "$flavor" ] && { err "不支持的 ABI: $abi（可选: universal|arm64-v8a|armeabi-v7a|x86|x86_64）"; return 1; }
    apk_dir="$GEN_ANDROID_DIR/app/build/outputs/apk/$abi/$(echo "$build_type" | tr '[:upper:]' '[:lower:]')"
  fi

  # 前置检查
  require_cmd tauri '安装: cargo install tauri-cli --version "^2"' || return 1
  require_cmd node '构建 Android 需 node（Gradle rust 插件执行入口）' || return 1
  [ -f "$GEN_ANDROID_DIR/gradlew" ] || {
    err "Android 工程缺失: $GEN_ANDROID_DIR"
    info "先执行: tauri android init"
    return 1
  }

  hdr "构建 Android APK（${mode}，ABI: $abi）"
  if [ "$abi" = "universal" ]; then
    # 官方链路：四 ABI 全打（由 RustPlugin 的 universal flavor 聚合）
    run tauri android build --apk "${mode_flag[@]}"
    ok "产物: $apk_dir/ 下的 app-universal-*.apk"
  else
    # 指定单 ABI：直接调 gradle 对应 flavor 任务
    info "指定 ABI $abi（flavor $flavor），直接走 Gradle 任务 assemble${flavor}${build_type}"
    run ./gradlew "assemble${flavor}${build_type}"
    ok "产物: $apk_dir/app-$abi-*.apk"
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
      hdr "清理全部构建产物（桌面 + Android）"
      local total=0
      for d in "$TAURI_DIR/target" "$GEN_ANDROID_DIR/app/build"; do
        [ -d "$d" ] && du -sh "$d"
      done
      confirm || { info "已取消"; return 0; }
      rm -rf "$TAURI_DIR/target" "$GEN_ANDROID_DIR/app/build"
      ok "已删除桌面与 Android 构建产物"
      ;;
    deep)
      hdr "彻底清理（含 Android 工程 gen/）"
      warn "删除 gen/ 后，下次 Android 构建需重新 tauri android init，"
      warn "且需重打 Gradle 9 兼容补丁（buildSrc/BuildTask.kt 等）！请谨慎。"
      local total=0
      for d in "$TAURI_DIR/target" "$GEN_ANDROID_DIR/app/build" "$GEN_DIR"; do
        [ -d "$d" ] && du -sh "$d"
      done
      confirm || { info "已取消"; return 0; }
      rm -rf "$TAURI_DIR/target" "$GEN_ANDROID_DIR/app/build"
      [ -n "$(ls -A "$GEN_ANDROID_DIR" 2>/dev/null)" ] && rm -rf "$GEN_DIR"
      ok "已彻底清理（下次 Android 构建需重新生成工程并重打补丁）"
      ;;
    *)
      err "未知清理目标: $target（可选: desktop|android|all|deep）"; return 1
      ;;
  esac
}

# ---- TUI 交互式菜单 ------------------------------------------------------
read_choice() { # read_choice <提示> → 读取选择（EOF 返回失败）
  local prompt="$1" ans
  read -r -p "$prompt" ans || return 1
  echo "$ans"
}

confirm_yes() { # confirm_yes <提示> → 0/1
  local ans
  read -r -p "$1 [y/N] " ans || return 1
  [[ "$ans" =~ ^[Yy]$ ]]
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

tui_desktop() {
  hdr "桌面端构建"
  show_list "构建模式:" "release（发行，默认）" "debug（调试）"
  local m; m="$(read_choice "选择 [1/2]: ")" || return 1
  local mode="release"; [ "$m" = "2" ] && mode="debug"

  hdr "打包格式（可多选，逗号分隔，all=全部）"
  show_list "" "deb" "rpm" "appimage"
  local b; b="$(read_choice "输入编号（如 1,2 或 all，回车=全部）: ")" || return 1
  [ -z "$b" ] && b="all"
  local bundles; bundles="$(parse_multi "$b" deb rpm appimage | paste -sd, -)"
  [ -z "$bundles" ] && { err "未选择任何打包格式"; return 1; }

  hdr "目标架构"
  show_list "" "当前主机（$(uname -m)）" "aarch64（交叉编译）"
  local a; a="$(read_choice "选择 [1/2]: ")" || return 1
  local arch="host"; [ "$a" = "2" ] && arch="aarch64"

  desktop_build "$mode" "$bundles" "$arch"
}

tui_android() {
  hdr "Android APK 构建"
  show_list "构建模式:" "release（发行，默认）" "debug（调试）"
  local m; m="$(read_choice "选择 [1/2]: ")" || return 1
  local mode="release"; [ "$m" = "2" ] && mode="debug"

  hdr "目标 ABI（可多选，逗号分隔，universal=全部）"
  show_list "" "universal（全部，默认）" "arm64-v8a" "armeabi-v7a" "x86" "x86_64"
  local a; a="$(read_choice "输入编号（如 1,2 或回车=universal）: ")" || return 1
  local abi
  if [ -z "$a" ]; then abi="universal"; else abi="$(parse_multi "$a" universal arm64-v8a armeabi-v7a x86 x86_64 | paste -sd, -)"; fi
  [ -z "$abi" ] && { err "未选择任何 ABI"; return 1; }

  # 支持多 ABI 时逐个构建（或组合进 universal）
  if [ "$abi" = "universal" ]; then
    android_build "$mode" universal
  else
    IFS=',' read -ra list <<< "$abi"
    for one in "${list[@]}"; do android_build "$mode" "$one"; done
  fi
}

tui_clean() {
  hdr "清理构建产物"
  show_list "" "desktop（仅桌面 target/）" "android（仅 Android app/build）" \
             "all（桌面 + Android）" "deep（含 Android 工程 gen/，需重打补丁）"
  local c; c="$(read_choice "选择 [1/4]: ")" || return 1
  local target
  case "$c" in
    1) target="desktop" ;; 2) target="android" ;;
    3) target="all" ;; 4) target="deep" ;;
    *) warn "无效选择"; return 1 ;;
  esac
  clean_build "$target"
}

tui_version() {
  hdr "版本管理"
  check_versions
  local ans; ans="$(read_choice "输入新版本号以统一版本（回车跳过）: ")" || return 1
  [ -z "$ans" ] && return 0
  confirm_yes "确认将版本统一为 v$ans？" && set_version "$ans"
}

tui_main() {
  local choice
  while true; do
    printf '\n%s%s%s\n' "$C_BOLD" "══════════ 几何计算器 · 编译工具 ══════════" "$C_RESET"
    info "当前版本: $(get_version)  分支: $(git -C "$ROOT" branch --show-current 2>/dev/null || echo '?')"
    show_list "请选择操作:" \
      "环境检查" "桌面端构建" "Android APK 构建" "全量构建（桌面 + Android）" \
      "清理构建产物" "版本管理" "帮助"
    choice="$(read_choice "选择 [0-7]，q=退出: ")" || { printf '\n%s\n' "再见"; break; }
    case "$choice" in
      0) check_env ;;
      1) tui_desktop ;;
      2) tui_android ;;
      3) build_all release ;;
      4) tui_clean ;;
      5) tui_version ;;
      6) usage ;;
      q|Q) printf '%s\n' "再见"; break ;;
      *) warn "无效选择: $choice" ;;
    esac
  done
}

# ---- 命令行入口 ----------------------------------------------------------
usage() {
  cat <<'EOF'
几何计算器 编译工具 (build.sh)

用法:
  ./build.sh                      进入交互式菜单（TUI）
  ./build.sh check                检查工具链环境
  ./build.sh desktop [选项]       构建桌面端
  ./build.sh android [选项]       构建 Android APK
  ./build.sh all [选项]           全量构建（桌面 + Android）
  ./build.sh clean [目标] [-y]    清理构建产物
  ./build.sh version [版本号]     查看版本 / 设置并统一版本
  ./build.sh help                 显示本帮助

命令选项:
  -d, --debug       调试构建（默认 release）
  -r, --release     发行构建
  -b, --bundle F    桌面打包格式: deb|rpm|appimage|all（逗号分隔）
  -a, --arch A      桌面目标架构: host|aarch64（默认 host）
      --abi L       Android ABI: universal|arm64-v8a|armeabi-v7a|x86|x86_64（逗号分隔）
  -y, --yes         清理时跳过确认
  -h, --help        帮助

示例:
  ./build.sh check
  ./build.sh desktop -b deb,rpm
  ./build.sh desktop --debug -b appimage
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
    check|env) check_env ;;
    desktop)
      local mode="release" bundles="all" arch="host"
      while [ "$#" -gt 0 ]; do
        case "$1" in
          -d|--debug) mode="debug"; shift ;;
          -r|--release) mode="release"; shift ;;
          -b|--bundle) bundles="${2:?缺 -b 参数}"; shift 2 ;;
          -a|--arch) arch="${2:?缺 -a 参数}"; shift 2 ;;
          -h|--help) usage; return 0 ;;
          *) err "未知选项: $1"; usage; return 1 ;;
        esac
      done
      desktop_build "$mode" "$bundles" "$arch"
      ;;
    android)
      local mode="release" abi="universal"
      while [ "$#" -gt 0 ]; do
        case "$1" in
          -d|--debug) mode="debug"; shift ;;
          -r|--release) mode="release"; shift ;;
          --abi) abi="${2:?缺 --abi 参数}"; shift 2 ;;
          -h|--help) usage; return 0 ;;
          *) err "未知选项: $1"; usage; return 1 ;;
        esac
      done
      if [ "$abi" = "universal" ]; then
        android_build "$mode" universal
      else
        IFS=',' read -ra list <<< "$abi"
        for one in "${list[@]}"; do android_build "$mode" "$one"; done
      fi
      ;;
    all)
      local mode="release"
      while [ "$#" -gt 0 ]; do
        case "$1" in
          -d|--debug) mode="debug"; shift ;;
          -r|--release) mode="release"; shift ;;
          -h|--help) usage; return 0 ;;
          *) err "未知选项: $1"; usage; return 1 ;;
        esac
      done
      build_all "$mode"
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

main "$@"

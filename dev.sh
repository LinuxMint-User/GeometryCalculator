#!/usr/bin/env bash
# 开发模式启动脚本：Tauri 壳（自动拉起前端静态服务，端口 9019）
# 用绝对路径定位脚本所在目录，避免调用方式（相对/绝对）影响 cwd
set -e
cd "$(cd "$(dirname "$0")" && pwd)"
echo "== 启动几何计算器（Tauri dev）=="
tauri dev

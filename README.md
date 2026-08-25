简体中文 | [English (US)](README.en.md)

> 维护者说明：本仓库为维护分支（fork），本分支的改动见下方「维护者更新」区块；以下原作者内容保留未动。

---

# 维护者更新（v2.4.0）

本仓库为 [zhdbk3/GeometryCalculator](https://github.com/zhdbk3/GeometryCalculator) 的维护分支，维护者：LinuxMint-User。

## 架构重构

- 🧮 计算核心重写为 TypeScript 符号引擎，编译为浏览器原生 JavaScript（ESM）后运行，替换原 Python + SymPy 后端
- ⚡ 前端直连引擎，移除桥接层；全部计算在浏览器内完成，无需后端进程、无需安装 Python/Qt 依赖
- 🔄 操作历史自动保存到本地，刷新页面自动恢复现场

## 新增功能

- 🧹 「重置计算器」一键清零（菜单 ☰ → 重置计算器）
- 📐 角度函数 `acos`（如三角形角度求解），符号求解优先、数值求解兜底
- 🔢 求解能力增强：符号解求不出时自动数值兜底（结果标注「近似」），不再空手而归
- 🗑️ 删除对象时提示依赖关系，支持级联处理

## 与原版的功能差异

- 操作习惯与对象模型（未知数/点/条件/求解）与原版一致，无功能退化
- 三次及以上多项式不再输出冗长的 Cardano 根式公式，改为数值近似（标注「近似」）
- 原版「保存到文件 / 从文件加载」改为自动持久化：操作历史自动保存，刷新页面自动恢复

## 运行方式（本分支）

无需安装任何依赖，在 `frontend/` 目录下启动任意静态服务器：

```bash
python3 -m http.server 9017
```

浏览器打开 <http://localhost:9017/>。

引擎源码、测试与浏览器编译见 `backend/src/`（TypeScript）；功能说明见页面内「文档」tab 的维护者《使用指南》《更新日志》。

---

以下为原作者 README（未改动）：

> 啊对对对，我们都是初二的学生，用几何的方法做；你是初三的学生，用建系的高级方法做。我们的方法哪有建系快啊 😅
> <p align="right">——我们初中一位数学老师</p>

# 几何计算器 2

借助计算机的强大算力，使用解析几何暴力计算几何问题！

- [使用文档](frontend/src/pages/docs.md)
- [关于 几何计算器 2](frontend/src/pages/about.md)

## 新版本特点

- ✨ 页面美观：全面支持 LaTeX，对人类~~和猫娘~~友好
- ⚡ 运行流畅：前后端分离，告别旧版本中的卡顿
- 💪 功能强大：
    - 🔢 支持添加未知数并限定取值范围
    - 📍 添加点的逻辑更加合理、人性化
    - 📈 表达式解析全面升级：
        - 👍 更加人性化的语法，告别特殊字符
        - ➡️ 支持向量运算
        - 📄 条件可以显示原始形式（也会用 LaTeX 排得美观），管理更方便
    - 📐 直线平行、垂直
    - 🔺 快速添加复合条件：三角形全等、相似
    - 🧩 快速添加特殊图形：平行四边形、菱形、矩形、正方形、等边三角形
    - 🗑️ 更易于操作的删除条件
    - 💾 可以把数据保存到文件、从文件加载数据

## 致谢

见 [`ACKNOWLEDGMENTS.md`](ACKNOWLEDGMENTS.md)。

## TODO

- [ ] 给软件设计一个图标
- [ ] 打包为 APK

## Windows 下无法运行？

请用**管理员**身份打开 PowerShell，执行命令：

```shell
Get-ChildItem -Path <你的几何计算器文件夹路径> -Recurse -Filter *.dll | Unblock-File -Confirm:$false
```

> [!NOTE]
> 尖括号记得删！

参考：https://github.com/r0x0r/pywebview/issues/1638#issuecomment-2896747582

## Linux 下编译/运行？

Linux 下需要安装 Qt 相关的系统依赖，例如（以 Arch Linux 为例）：

```bash
sudo pacman -S qt6-base
```

然后安装 Python 依赖（`pywebview[qt]` 会随 `requirements.txt` 在 Linux 上自动安装）：

```bash
pip install -r requirements.txt
```

> [!NOTE]
> 之所以在 Linux 上强制使用 Qt 后端而不是默认的 GTK，是因为 GTK 后端在某些环境下列出了界面却显示不出来，详见 [issue #8](https://github.com/zhdbk3/GeometryCalculator/issues/8)。
>
> 如果运行后窗口没有显示出来，可以尝试手动指定 Qt 后端：
>
> ```bash
> PYWEBVIEW_GUI=qt python main.py
> ```

## 在开发模式下运行项目

### 1. 安装依赖

在 `frontend/` 目录下执行：

```bash
pnpm install
```

在 `backend/` 目录下执行：

```bash
uv sync
```

或

```bash
pip install -r requirements.txt
```

### 2. 启动前端

在 `frontend/` 目录下执行：

```bash
quasar dev
```

看到刚刚打开的浏览器页面了吗？对，这个没有用，把它叉掉。

前端可以热更新，你修改代码之后会立即得到反馈，无需重启前端。

### 3. 启动后端

在 `backend/` 目录下运行 `main_dev.py`，这样整个项目就启动完成了。

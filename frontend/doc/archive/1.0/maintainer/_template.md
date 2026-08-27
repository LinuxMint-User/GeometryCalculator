# 新功能使用指南（模板）

> **怎么用**：本模板用于给单个新功能写独立文档。复制本文件为
> `frontend/doc/maintainer/你的文档名.md`（英文版另存 `你的文档名.en.md`），
> 填好内容后，在 `frontend/doc/manifest.json` 的 `documents` 里加一条记录
> 即可挂载到左侧列表。
>
> 示例记录：
> ```json
> { "id": "circle", "group": "maintainer", "title": "圆", "titleEn": "Circle", "file": "circle.md", "fileEn": "circle.en.md" }
> ```
> 如果只是整体使用说明的变动，直接更新「维护者版使用指南」
> （`frontend/doc/maintainer/guide.md`）即可，无需新建文档。
> 发布新版本时，把本文档归档到 `doc/archive/{版本号}/maintainer/`，并在
> `versions` 中登记即可保留历史版本。

## 功能介绍

在这里写新功能能做什么、解决什么问题、适用场景。

## 使用方法

### 添加对象

支持 LaTeX 公式：未知数 $s \in (0, +\infty)$、条件 $AB = 3$、点 $A(0, 0)$。

### 求解示例

- 示例 1：……
- 示例 2：……

## 注意事项

- 要点一
- 要点二

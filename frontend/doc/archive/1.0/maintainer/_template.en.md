# New Feature Guide (Template)

> **How to use**: this template is for writing a standalone doc for a single
> feature. Copy this file to `frontend/doc/maintainer/your-doc-name.md`
> (and `your-doc-name.en.md` for English), fill in the content, then add a
> record to the `documents` list of `frontend/doc/manifest.json` to mount it
> in the left sidebar.
>
> Example record:
> ```json
> { "id": "circle", "group": "maintainer", "title": "圆", "titleEn": "Circle", "file": "circle.md", "fileEn": "circle.en.md" }
> ```
> For general usage changes, just update the maintainer's User Guide
> (`frontend/doc/maintainer/guide.md`) instead of creating a new doc.
> When releasing a new version, archive this doc to
> `doc/archive/{version}/maintainer/` and register it in `versions`.

## Overview

What this feature does, the problem it solves, and use cases.

## Usage

### Adding objects

LaTeX is supported: unknown $s \in (0, +\infty)$, condition $AB = 3$, point $A(0, 0)$.

### Examples

- Example 1: ...
- Example 2: ...

## Notes

- Point one
- Point two

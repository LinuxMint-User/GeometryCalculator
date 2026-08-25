# Changelog

## v2.4.0

- Computation core rewritten as a TypeScript engine (replacing the original Python/SymPy backend); all computation happens in the browser, no external process needed
- Frontend talks to the engine directly, bridge layer removed; operation history is saved automatically and restored on page refresh
- New `acos` angle function (e.g. solving triangle angles), symbolic solving first with numeric fallback
- New "Reset calculator" action (menu ☰ → Reset calculator) to clear all objects at once

## v2.2.0

- Brand-new frontend UI (Material 3 style, with light/dark themes and a zh/en switch)
- Handwritten docs system: view User Guide / About / Changelog per version
- Docs of older versions live under `doc/archive/{version}/`

> This document is updated along with releases. When a new version is
> published, archive the old docs to `doc/archive/{old-version}/` (grouped
> into `original/` and `maintainer/`) and register them in the `versions` list
> of `doc/manifest.json`.

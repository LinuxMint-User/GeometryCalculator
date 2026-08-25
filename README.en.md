[简体中文](README.md) | English (US)

> Maintainer note: This repository is a maintained fork. Changes made in this fork are listed in the "Maintainer Updates" section below; the original README below is left untouched.

---

# Maintainer Updates (v2.4.0)

This is a maintained fork of [zhdbk3/GeometryCalculator](https://github.com/zhdbk3/GeometryCalculator), maintained by LinuxMint-User.

## Architecture Rewrite

- 🧮 The computation core is rewritten as a TypeScript symbolic engine, compiled to native browser JavaScript (ESM) at build time; it replaces the original Python + SymPy backend
- ⚡ The frontend talks to the engine directly and the bridge layer is removed; all computation happens in the browser, with no backend process and no Python/Qt dependencies
- 🔄 Operation history is saved locally and restored automatically on page refresh

## New Features

- 🧹 One-click "Reset calculator" to clear everything (menu ☰ → Reset calculator)
- 📐 Angle function `acos` (e.g. solving triangle angles), symbolic solving first with numeric fallback
- 🔢 Stronger solving: when no symbolic solution is found, a numeric fallback kicks in automatically (marked "approximate") instead of returning nothing
- 🗑️ Dependency hints and cascading handling when deleting objects

## Functional Differences from the Original

- The object model and workflows (unknowns / points / conditions / solving) stay the same as the original; no regressions
- Cubic and higher polynomials no longer output long Cardano radical formulas; they fall back to numeric approximations (marked "approximate")
- The original "save to file / load from file" is replaced by automatic persistence: operation history is saved locally and restored on page refresh

## How to Run (this fork)

No dependencies needed. From `frontend/`, start any static server:

```bash
python3 -m http.server 9017
```

Then open <http://localhost:9017/> in your browser.

The engine source, tests and browser build live in `backend/src/` (TypeScript); for usage details, see the maintainer User Guide / Changelog in the "Docs" tab.

---

The original README (author's content) is fully preserved in [README-Origin.en.md](README-Origin.en.md) and not duplicated here.

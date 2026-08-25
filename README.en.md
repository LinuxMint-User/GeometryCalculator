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

Original README below (untouched):

> Yeah, you're absolutely right - we're all just 8th graders using pure geometric methods, and you're in 9th grade, already learning coordinate geometry.
> How could our method possibly be faster than just setting up a coordinate system??? 😅
> <p align="right"> - One of our middle school math teachers</p>

# Geometry Calculator

Take advantage of your PC’s raw horsepower—brute‑force your geometry problems with analytic geometry!

* [User Guide](frontend/src/i18n/en-US/docs.md)
* [About Geometry Calculator Ver 2](frontend/src/i18n/en-US/about.md)

## What’s New

* ✨ **Sleeker UI** - Full LaTeX support, friendly to humans ~~and cat-girls~~
* ⚡ **Snappy Performance** - Front-end and back‑end are completely seperated, so the lag from the old version is gone
* 💪 **More Powerful features!!**
    * 🔢 Add unknowns and restrict their value ranges
    * 📍 Smarter, more intuitive point‑adding workflow
    * 📈 Major expression‑parser overhaul
        * 👍 Human‑friendly syntax—no more weird symbols
        * ➡️ Vector operations supported
        * 📄 Conditions can be shown in their original form (rendered with LaTeX), making them easier to manage
    * 📐 Lines: quick parallel / perpendicular tools
    * 🔺 Fast composite constraints: triangle congruence & similarity
    * 🧩 One‑click special shapes: parallelogram, rhombus, rectangle, square, equilateral triangle
    * 🗑️ Cleaner condition deletion
    * 💾 Save data to file & load it back later

## Acknowledgments

See [`ACKNOWLEDGMENTS.en.md`](ACKNOWLEDGMENTS.en.md).

## TODO

* [ ] Design an app icon
* [ ] Package for APK distribution

## Running the Project in Development Environment

### 1. Install Dependencies

In `frontend/`:

```bash
pnpm install
```

In `backend/`:

```bash
uv sync
```

or

```bash
pip install -r requirements.txt
```

### 2. Start the Front End

In `frontend/`:

```bash
quasar dev
```

You See the browser tab that just popped up, don't you? Yup, it’s useless lol. Close it.

The front end supports hot-reload, so every change appears instantly without a restart.

### 3. Start the Back End

In `backend/`, run `main_dev.py`. That’s it - the whole stack is up and running!!

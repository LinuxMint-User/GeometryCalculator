[简体中文](README.md) | English (US)

> Maintainer note: This repository is a maintained fork. Changes made in this fork are listed in the "Maintainer Updates" section below; the original README below is left untouched.

---

# Maintainer Updates (v2.5.0)

This is a maintained fork of [zhdbk3/GeometryCalculator](https://github.com/zhdbk3/GeometryCalculator), maintained by LinuxMint-User.

## Architecture Rewrite

- 🧮 The computation core is rewritten as a TypeScript symbolic engine, compiled to native browser JavaScript (ESM) at build time; it replaces the original Python + SymPy backend
- ⚡ The frontend talks to the engine directly and the bridge layer is removed; all computation happens in the browser, with no backend process and no Python/Qt dependencies
- 🔄 Operation history is saved locally and restored automatically on page refresh

## New Features

- 🖥️ Tauri desktop shell: runs as a native window on Linux / Windows / macOS
- 🤖 Android support: build an APK (requires Android 7.0+; supports arm64-v8a / armeabi-v7a / x86 / x86_64)
- 🧹 One-click "Reset calculator" to clear everything (menu ☰ → Reset calculator)
- 📐 Angle function `acos` (e.g. solving triangle angles), symbolic solving first with numeric fallback
- 🔢 Stronger solving: when no symbolic solution is found, a numeric fallback kicks in automatically (marked "approximate") instead of returning nothing
- 🗑️ Dependency hints and cascading handling when deleting objects

## Functional Differences from the Original

- The object model and workflows (unknowns / points / conditions / solving) stay the same as the original; no regressions
- Cubic and higher polynomials no longer output long Cardano radical formulas; they fall back to numeric approximations (marked "approximate")
- The original "save to file / load from file" is replaced by automatic persistence: operation history is saved locally and restored on page refresh

## How to Run (this fork)

### Browser preview (lightest, no Tauri needed)

```bash
python3 -m http.server 9017 --directory frontend
```

Then open <http://localhost:9017/> in your browser.

## Build & Package

Prerequisites: Rust toolchain (rustup), [Tauri 2 CLI](https://v2.tauri.app/start/cli/) (`cargo install tauri-cli --version "^2"`);
building the Android APK additionally needs JDK 17+, Android SDK (with NDK), and the cross-compile targets:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

### Desktop (Tauri shell)

```bash
tauri dev     # dev mode (starts the frontend static server automatically, hot reload), or ./dev.sh
tauri build   # build release installers (output in src-tauri/target/release/bundle/)
```

### Android APK

```bash
tauri android init                    # generate the Android project once (src-tauri/gen/android/, regenerable)
tauri android build --apk --debug     # build a debug APK
```

APK output: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`

- Requirement: Android 7.0 (API 24) or later
- Architectures: arm64-v8a / armeabi-v7a / x86 / x86_64 in one universal APK

The engine source, tests and browser build live in `backend/src/` (TypeScript); for usage details, see the maintainer User Guide / Changelog in the "Docs" tab.

---

The original README (author's content) is fully preserved in [README-Origin.en.md](README-Origin.en.md) and not duplicated here.

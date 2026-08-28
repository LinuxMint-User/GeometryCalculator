# Changelog

## v2.5.2

- Fix packaged version number: now consistently 2.5.2 (v2.5.1 artifacts still showed 2.5.0 in filenames and the About dialog)
- No functional changes; the fixes are listed under v2.5.1

## v2.5.1

- Fix startup white screen: a "Loading…" splash now covers the window while the app initializes and fades out once the main UI is ready (slow devices no longer sit on a blank page)
- Fix delete/status/reset dialogs showing buttons with no text
- Fix conditions in the object list showing the wrong content: now shows the condition itself (e.g. AB⊥CD) instead of the underlying equation
- Fix LaTeX commands (e.g. \perp) in the delete dialog's dependent-objects list rendering as raw text
- Fix display and interaction issues on old devices (Android 9 / low-end desktops): dialog close flicker, vertically stacked app bar title, overflowing English button text
- Fix missing error message when an unknown name collides with reserved coordinate names (now shown in both languages)

## v2.5.0

- New Tauri desktop shell: runs as a native window on Linux / Windows / macOS (`tauri dev` to develop, `tauri build` to package)
- New Android support: build an APK with `tauri android build --apk --debug`; requires Android 7.0 (API 24) or later, supports arm64-v8a / armeabi-v7a / x86 / x86_64
- Fix edge-to-edge layout on Android: the app bar now accounts for the status bar height and is no longer covered
- Fix Chinese styling glitch in the Docs view: group labels ("Original docs" / "Maintainer docs") no longer wrap vertically on narrow screens
- Theme and language now follow the system: until set manually, they track the system light/dark preference and system language in real time; manual choice sticks, and "Clear local preferences" restores system-following
- New one-click build tool `build.sh`: interactive TUI menu plus command-line arguments, covering desktop/Android/full builds, custom architectures and bundle formats, artifact cleanup and version unification (`./build.sh help` for usage)

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

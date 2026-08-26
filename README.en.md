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
- 🤖 Android support: build an APK (requires Android 9 (API 28) or later; supports arm64-v8a / armeabi-v7a / x86 / x86_64)
- 🧹 One-click "Reset calculator" to clear everything (menu ☰ → Reset calculator)
- 📐 Angle function `acos` (e.g. solving triangle angles), symbolic solving first with numeric fallback
- 🔢 Stronger solving: when no symbolic solution is found, a numeric fallback kicks in automatically (marked "approximate") instead of returning nothing
- 🗑️ Dependency hints and cascading handling when deleting objects

## Functional Differences from the Original

- The object model and workflows (unknowns / points / conditions / solving) stay the same as the original; no regressions
- Cubic and higher polynomials no longer output long Cardano radical formulas; they fall back to numeric approximations (marked "approximate")
- The original "save to file / load from file" is replaced by automatic persistence: operation history is saved locally and restored on page refresh

## How to Run (this fork)

### Download a release (no build required)

Latest release artifacts live on [GitHub Releases](https://github.com/LinuxMint-User/GeometryCalculator/releases):

- Desktop: Linux (deb/rpm), Windows (NSIS installer + portable single-file exe), macOS (dmg; requires macOS 10.15 (Catalina) or later, and macOS 11 or later on Apple Silicon (M1 or newer))
- No AppImage: AppImage bundles GTK/WebKitGTK and other dependencies into the package, which repeatedly causes compatibility issues on new distros (white screen, crash on startup, frozen input); deb and rpm use the system libraries and are stable (Ubuntu/Debian use deb, Fedora/openSUSE use rpm)
- Android: universal APK (all four ABIs) plus per-ABI smaller APKs (arm64-v8a / armeabi-v7a / x86 / x86_64)
- On Android you may need to allow "unknown sources" when installing the APK; Android 9 (API 28) or newer is required
- WebView engine: the packaged frontend is transpiled with esbuild down to Chrome 74 syntax, so the stock WebView on Android 9 and newer runs it fine; if a device's WebView is outdated, update "Android System WebView" in system settings. macOS has no such issue — the app uses the system WKWebView (Safari engine), which is updated with macOS itself, so nothing needs to be installed or upgraded separately

### Browser preview (lightest, no Tauri needed)

```bash
python3 -m http.server 9017 --directory frontend
```

Then open <http://localhost:9017/> in your browser.

## Build & Package

Prerequisites: Node.js 18+ (with npm, used for the esbuild frontend build), Rust toolchain (rustup), [Tauri 2 CLI](https://v2.tauri.app/start/cli/) (`cargo install tauri-cli --version "^2"`);
building the Android APK additionally needs JDK 17+, Android SDK (with NDK), and the cross-compile targets:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

> Network note: the first build downloads the tauri CLI, cargo dependencies and Gradle. If downloads are slow or keep failing (e.g. in mainland China), consider mirrors (rsproxy for cargo, Tencent Cloud for Gradle); a simple retry usually recovers. `./build.sh check` verifies the toolchain.

### One-click build tool (recommended)

`build.sh` at the repo root offers both an **interactive TUI menu** and **command-line arguments**:

```bash
./build.sh                        # enter the interactive menu (env check/desktop/Android/full build/clean/version)
./build.sh check                  # check the toolchain (shows what is missing)
./build.sh desktop -b deb,rpm     # desktop build, bundle deb + rpm
./build.sh desktop --debug        # desktop debug build
./build.sh android --debug        # Android debug APK (universal, all four ABIs)
./build.sh android --abi arm64-v8a  # Android, arm64-v8a only
./build.sh all                    # full build (desktop release + Android release)
./build.sh clean all -y           # clean all build artifacts (skip confirmation)
./build.sh version 2.6.0          # set a unified version (tauri.conf/Cargo.toml/manifest synced)
./build.sh help                   # full help
```

Options: `-d/--debug`, `-r/--release`, `-b/--bundle deb|rpm|all`, `-a/--arch host|aarch64`, `--abi universal|arm64-v8a|armeabi-v7a|x86|x86_64`.

> Note: `--abi` per-ABI builds reuse the `.so` files already compiled and linked into jniLibs by a universal build (it only assembles the APK). Run `./build.sh android` (universal) once first if you never have.

### Manual commands (equivalent)

```bash
tauri dev     # dev mode (starts the frontend static server automatically, hot reload), or ./dev.sh
# Before a manual build, build the frontend first (esbuild transpiles to frontend/dist/;
# build.sh / CI does this automatically):
cd frontend && npm ci && npm run build && cd ..
tauri build   # build release installers (output in src-tauri/target/release/bundle/)

tauri android init                    # generate the Android project once (src-tauri/gen/android/, regenerable)
tauri android build --apk --debug     # build a debug APK
```

APK output: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/geometry-calculator_2.5.0_universal-debug.apk`

- Requirement: Android 9 (API 28) or later; WebView requirement as described under "Download a release"
- Architectures: arm64-v8a / armeabi-v7a / x86 / x86_64 in one universal APK
- Note: `src-tauri/gen/android/` contains Gradle 9 compatibility patches; `build.sh clean deep` deletes the whole project — avoid `deep` unless necessary (`build.sh` regenerates the project and re-applies the patches automatically on the next Android build)

### Gradle 9 compatibility patches (Android, recorded 2026-08-26)

The Android project generated by Tauri uses Gradle 8.14.3 by default, which **only supports up to Java 24**. If your JDK is 25 or newer (e.g. recent Fedora releases only ship 25/26), you must upgrade to Gradle 9.5.1 and adapt six generated files:

| # | File | Change |
|---|---|---|
| 1 | `gen/android/gradle/wrapper/gradle-wrapper.properties` | official source → Tencent Cloud mirror, Gradle 9.5.1 |
| 2 | `gen/android/build.gradle.kts` | AGP 8.11.0 + KGP 2.3.20 (Gradle 9 requires KGP 2.0.20+) |
| 3 | `gen/android/app/build.gradle.kts` and `mobile/android/build.gradle.kts` inside the tauri crate in cargo registry | `kotlinOptions` → `kotlin.compilerOptions` (removed in KGP 2.x) |
| 4 | `gen/android/buildSrc/.../BuildTask.kt` | `project.exec` (removed in Gradle 9) → `ExecOperations` injection + `@Inject` constructor |
| 5 | `gen/android/app/src/main/res/values/strings.xml` (plus new `values-zh/`) | Adaptive app name: Chinese systems show 「几何计算器」, everything else shows `Geometry Calculator` |
| 6 | `gen/android/app/build.gradle.kts` | `minSdk` 24 → 28 (Android 9, whose stock WebView can parse the transpiled frontend) |

The APK file name (`geometry-calculator_<version>_<flavor>-<buildType>.apk`) is not a Gradle patch: AGP 8 removed the API for renaming APK outputs from the build script, so `build.sh` and the CI rename the APK **in the output directory after the build** (see `rename_android_apk`).

These changes live in the regenerable `gen/` directory and the cargo registry — they are **not committed** (`gen/` is gitignored). Therefore:

- Every `./build.sh android` run **auto-detects** whether the patches are missing or reverted, and automatically runs `tauri android init` (if `gen/` was deleted) and **re-applies all patches** — no manual steps needed;
- Environments with **JDK ≤ 24** can just use the official flow, unaffected;
- Once upstream Tauri templates support Gradle 9, these patches become unnecessary and `build.sh` will not touch the new templates.

The engine source, tests and browser build live in `backend/src/` (TypeScript); for usage details, see the maintainer User Guide / Changelog in the "Docs" tab.

### Automated releases (GitHub Actions)

Pushing a `v*` tag (e.g. `v2.5.0`) triggers [release.yml](.github/workflows/release.yml):

- Builds desktop installers for all three platforms (Linux deb/rpm, Windows NSIS installer, macOS dmg) plus an Android universal APK
- Windows also ships a **portable single-file build** (`*-portable.exe`, no installation required; requires the WebView2 Runtime — preinstalled on Windows 11 and modern Windows 10, and the installer handles it automatically)
- Android ships a **universal APK** (all four ABIs) plus **per-ABI smaller APKs** (`arm64-v8a` / `armeabi-v7a` / `x86` / `x86_64`) — modern phones can use the `arm64-v8a` build to save bandwidth and storage
- Attaches the artifacts (with SHA256 checksums) to a GitHub Release **draft** — the draft stays private until you review it and manually click "Publish"
- Running it manually from the Actions tab only builds and keeps workflow artifacts; no Release is created

---

The original README (author's content) is fully preserved in [README-Origin.en.md](README-Origin.en.md) and not duplicated here.

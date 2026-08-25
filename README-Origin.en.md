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

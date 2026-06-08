# GPT Organizer

Private Chrome extension for [chatgpt.com](https://chatgpt.com): sidebar checkboxes, batch **delete**, and **move to project**. Not published to the Chrome Web Store.

Same toolchain as [flashscore-calendar](https://github.com/benedyktdryl/flashscore-calendar): **[WXT](https://wxt.dev)** + TypeScript → `dist/`.

## Load in Chrome

### Pre-built ZIP from `main` (no clone)

Each successful push to `main` publishes **`gpt-organizer-chrome-main.zip`** on the rolling prerelease [**continuous**](https://github.com/benedyktdryl/gpt-organizer/releases/tag/continuous) (workflow [`.github/workflows/release-main-zip.yml`](.github/workflows/release-main-zip.yml)). Direct download:

**https://github.com/benedyktdryl/gpt-organizer/releases/download/continuous/gpt-organizer-chrome-main.zip**

Unzip, then **Load unpacked** and pick the **extracted folder** (the directory that contains `manifest.json` at its root — not the `.zip` file).

Install guide (GitHub Pages): **https://benedyktdryl.github.io/gpt-organizer/**

### From source

1. `bun install` (or `npm install`)
2. `bun run build` → output: **`dist/chrome-mv3/`**
3. `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/chrome-mv3/`

For HMR while developing: `bun run dev` → load **`dist/chrome-mv3-dev/`**.

## Scripts

| Command | Output |
|---------|--------|
| `bun run dev` | `dist/chrome-mv3-dev/` (watch) |
| `bun run build` | `dist/chrome-mv3/` |
| `bun run zip` | `dist/gpt-organizer-*-chrome.zip` |
| `bun run compile` | Typecheck only |
| `bun run website:dev` | Marketing site (Vite) → http://localhost:5173/gpt-organizer/ |
| `bun run website:build` | Production build of the site → `website/dist/` |

## Project layout

```
entrypoints/chatgpt.content.ts   # content script (defineContentScript)
utils/                           # api, dom, organizer UI, selectors
assets/organizer.css
assets/icon.svg                  # extension icon (auto-icons → public/icon/*.png)
wxt.config.ts                    # manifest (outDir: dist)
docs/                            # API notes, reverse engineering
scripts/                         # optional Playwright probes
samples/                         # saved ChatGPT HTML snapshot
```

## Features

- Checkboxes on visible sidebar conversations (**Shift+click** selects a range between two checkboxes)
- **Minimized by default** — small “Organizer · N” pill; click to expand
- **Actions** tab: select, move, delete, export metadata (JSON/CSV), **import plan** (CSV/JSON from GPT analysis)
- **Logs** tab: persisted in `localStorage` (survives refresh); export logs as JSON
- ChatGPT-aligned styling (uses page theme when `html.dark` is set)
- Uses your session (`/api/auth/session` + `backend-api`) — no copied tokens

**Import workflow:** export CSV → analyze in ChatGPT → import plan → review preview → Apply. See [docs/IMPORT_EXPORT_DESIGN.md](docs/IMPORT_EXPORT_DESIGN.md).

See also [docs/CONFIRMED_API.md](docs/CONFIRMED_API.md) and [docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md).

## CI, download ZIP & GitHub Pages

On push to `main`:

- [`.github/workflows/release-main-zip.yml`](.github/workflows/release-main-zip.yml) — builds and uploads **`gpt-organizer-chrome-main.zip`** to the [continuous](https://github.com/benedyktdryl/gpt-organizer/releases/tag/continuous) prerelease.
- [`.github/workflows/pages.yml`](.github/workflows/pages.yml) — deploys the install guide to GitHub Pages.

Enable Pages once: **Repository → Settings → Pages → Build and deployment → Source: GitHub Actions**.

Local site preview:

```bash
bun run website:dev
# open http://localhost:5173/gpt-organizer/
```

## Optional probes

```bash
bun run probe:api   # Playwright + API capture → docs/api-probe-report.json
```

See [docs/API_PROBE.md](docs/API_PROBE.md).

# GPT Organizer

Private Chrome extension for [chatgpt.com](https://chatgpt.com): sidebar checkboxes, batch **delete**, **move to project**, and metadata **import/export**. Not published to the Chrome Web Store — install from the [GitHub Pages guide](https://benedyktdryl.github.io/gpt-organizer/) or a pre-built ZIP.

Built with **[WXT](https://wxt.dev)** + TypeScript. Build output lives in **`dist/`** (visible in Finder; not a hidden `.output/` folder).

## Features

- Checkboxes on visible sidebar conversations (**Shift+click** selects a range between two checkboxes)
- **Minimized by default** — small “Organizer · N” pill; click to expand
- **Actions** tab: select, move, delete, export metadata (JSON/CSV), **import plan** (CSV/JSON from GPT analysis)
- **Logs** tab: persisted in `localStorage` (survives refresh); export logs as JSON
- ChatGPT-aligned styling (uses page theme when `html.dark` is set)
- Uses your session (`/api/auth/session` + `backend-api`) — no copied tokens

**Import workflow:** export CSV → analyze in ChatGPT → import plan → review preview → Apply. See [docs/IMPORT_EXPORT_DESIGN.md](docs/IMPORT_EXPORT_DESIGN.md).

## Quick start

```bash
bun install
bun run dev
```

1. Load unpacked from **`dist/chrome-mv3-dev/`** (see [Load in Chrome](#load-in-chrome)).
2. Open [chatgpt.com](https://chatgpt.com/) — the Organizer pill appears in the sidebar.
3. Expand the panel → select conversations → delete, move, or export.

No `.env` required.

## Build flow

| Step | Command | Output |
|------|---------|--------|
| Install deps | `bun install` | `node_modules/`, runs `wxt prepare` |
| Dev (HMR) | `bun run dev` | `dist/chrome-mv3-dev/` |
| Production | `bun run build` | `dist/chrome-mv3/` |
| Typecheck | `bun run compile` | — |
| Zip | `bun run zip` | `dist/gpt-organizer-*-chrome.zip` |
| Site (dev) | `bun run website:dev` | http://localhost:5173/gpt-organizer/ |
| Site (prod) | `bun run website:build` | `website/dist/` |

Reload (↻) in `chrome://extensions` after rebuilds; `bun run dev` can auto-reload during development.

## Load in Chrome

Chrome is configured locally (not remotely):

### Pre-built ZIP from `main` (no clone)

Each successful push to `main` publishes **`gpt-organizer-chrome-main.zip`** on the rolling prerelease [**continuous**](https://github.com/benedyktdryl/gpt-organizer/releases/tag/continuous) (workflow [`.github/workflows/release-main-zip.yml`](.github/workflows/release-main-zip.yml)). Direct download:

**https://github.com/benedyktdryl/gpt-organizer/releases/download/continuous/gpt-organizer-chrome-main.zip**

Unzip, then **Load unpacked** and pick the **extracted folder** (the directory that contains `manifest.json` at its root — not the `.zip` file).

Install guide: **https://benedyktdryl.github.io/gpt-organizer/**

### From source

1. `bun run dev` or `bun run build`.
2. `chrome://extensions` → **Developer mode** → **Load unpacked**.
3. Select:
   - Dev: `dist/chrome-mv3-dev/`
   - Prod: `dist/chrome-mv3/`

## Project layout

```
entrypoints/chatgpt.content.ts   # content script (defineContentScript)
utils/                           # api, dom, organizer UI, selectors, import/export
assets/organizer.css
assets/icon.svg                  # source icon (@wxt-dev/auto-icons → dist/.../icons/*.png)
wxt.config.ts                    # manifest (outDir: dist)
website/                         # install guide (GitHub Pages)
docs/                            # API notes, reverse engineering, import design
scripts/                         # optional Playwright probes
samples/                         # saved ChatGPT HTML snapshot
```

## Documentation site (GitHub Pages)

The install guide is published as a static site (Vite + React):

**https://benedyktdryl.github.io/gpt-organizer/**

Pushes to `main` run [`.github/workflows/pages.yml`](.github/workflows/pages.yml) and deploy `website/dist`.

Enable Pages once: **Repository → Settings → Pages → Build and deployment → Source: GitHub Actions**.

Local preview:

```bash
bun run website:dev
# open http://localhost:5173/gpt-organizer/
```

For a fork, set `VITE_SITE_URL` and `VITE_BASE_PATH` in [`website/.env.production`](website/.env.production) to match `https://<user>.github.io/<repo>/`.

## CI & releases

On push to `main`:

- [`.github/workflows/release-main-zip.yml`](.github/workflows/release-main-zip.yml) — uploads **`gpt-organizer-chrome-main.zip`** to [continuous](https://github.com/benedyktdryl/gpt-organizer/releases/tag/continuous).
- [`.github/workflows/pages.yml`](.github/workflows/pages.yml) — deploys the install guide.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — typecheck, extension build, site build.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No Organizer pill in sidebar | Refresh chatgpt.com; ensure extension is enabled and you are logged in. |
| Checkboxes missing on some rows | Only visible sidebar conversations get checkboxes; scroll to load more. |
| Move/delete fails | Session may have expired — refresh the page and retry. |
| Cannot find build folder | Use `dist/chrome-mv3/` or `dist/chrome-mv3-dev/` (not `.output`). |
| Import plan rejected | Check CSV/JSON format; see [docs/IMPORT_EXPORT_DESIGN.md](docs/IMPORT_EXPORT_DESIGN.md). |

## Optional probes

```bash
bun run probe:api   # Playwright + API capture → docs/api-probe-report.json
bun run probe:dom   # DOM structure probe
```

See [docs/API_PROBE.md](docs/API_PROBE.md), [docs/CONFIRMED_API.md](docs/CONFIRMED_API.md), and [docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md).

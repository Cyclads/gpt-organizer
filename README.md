# GPT Organizer

Private Chrome extension for [chatgpt.com](https://chatgpt.com): sidebar checkboxes, batch **delete**, and **move to project**. Not published to the Chrome Web Store.

Same toolchain as [flashscore-calendar](https://github.com/benedyktdryl/flashscore-calendar): **[WXT](https://wxt.dev)** + TypeScript → `dist/`.

## Load in Chrome (test build)

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

## Project layout

```
entrypoints/chatgpt.content.ts   # content script (defineContentScript)
utils/                           # api, dom, organizer UI, selectors
assets/organizer.css
public/icon/                     # extension icons
wxt.config.ts                    # manifest (outDir: dist)
docs/                            # API notes, reverse engineering
scripts/                         # optional Playwright probes
samples/                         # saved ChatGPT HTML snapshot
```

## Features

- Checkboxes on visible sidebar conversations
- Floating panel: select all visible, clear, move to project, remove from project, delete
- Uses ChatGPT session (`/api/auth/session` + `backend-api`) — no copied tokens
- `PATCH` delete: `{"is_visible":false}`; move: `{"gizmo_id":"g-p-…"}`

See [docs/CONFIRMED_API.md](docs/CONFIRMED_API.md) and [docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md).

## CI & download ZIP

On push to `main`, GitHub Actions builds and uploads **`gpt-organizer-chrome-main.zip`** to the [continuous](https://github.com/benedyktdryl/gpt-organizer/releases/tag/continuous) prerelease (when the repo exists).

## Optional probes

```bash
bun run probe:api   # Playwright + API capture → docs/api-probe-report.json
```

See [docs/API_PROBE.md](docs/API_PROBE.md).

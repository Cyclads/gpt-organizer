# API probe (Playwright)

Script: `scripts/probe-api.mjs` — saves `docs/api-probe-report.json`.

## Run

```bash
cd /Users/benedykt/Projects/gpt-organizer
/opt/homebrew/bin/npm run probe:api
```

### Authenticated capture (recommended)

Playwright-launched Chrome often loads ChatGPT **without** a valid `accessToken` (session returns `WARNING_BANNER` only, or `/api/auth/session` is HTML/403). Your normal Chrome window keeps the real session.

1. **Quit Google Chrome** completely.
2. Start Chrome with remote debugging (same profile you use for ChatGPT):

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome" \
  --profile-directory=Default
```

3. Log in to [chatgpt.com](https://chatgpt.com) if needed.
4. In another terminal:

```bash
CHROME_CDP_URL=http://127.0.0.1:9222 \
PROBE_WAIT_MS=15000 \
/opt/homebrew/bin/npm run probe:api
```

Optional: `PROBE_MANUAL_WAIT_MS=30000` to interact before capture.

## What we captured (automated run, Jun 2026)

| Endpoint | Notes |
|----------|--------|
| `GET /api/auth/session` | Returns `accessToken` when logged in |
| `GET /backend-api/conversations?offset&limit&order=updated` | Chat list |
| `GET /backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&cursor=` | Projects (“gizmos”) |
| `PATCH /backend-api/conversation/{id}` | `{"is_visible":false}` delete; `{"is_archived":true}` archive; `{"gizmo_id":"g-p-…"}` move (extension) |
| `GET /backend-api/gizmos/{gizmo}/conversations` | Chats inside one project |
| `POST /ces/v1/*` | Analytics / feature flags (not needed for organizer) |

Confirmed request headers on backend calls: `Authorization: Bearer <accessToken>`, `credentials: include`.

## DevTools fallback (no Playwright)

While logged in on chatgpt.com, paste in the console:

```javascript
(async () => {
  const s = await fetch("/api/auth/session", { credentials: "include" }).then((r) => r.json());
  const h = { Authorization: `Bearer ${s.accessToken}` };
  const conv = await fetch("/backend-api/conversations?offset=0&limit=2&order=updated", { headers: h }).then((r) => r.json());
  const giz = await fetch("/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0", { headers: h }).then((r) => r.json());
  console.log({
    email: s.user?.email,
    conversationKeys: Object.keys(conv.items?.[0] || {}),
    sampleGizmoId: conv.items?.[0]?.gizmo_id,
    projectKeys: Object.keys(giz.items?.[0] || {}),
    projectId: giz.items?.[0]?.gizmo?.gizmo?.id,
  });
})();
```

To capture **move** / **delete** payloads: DevTools → Network → filter `backend-api` → use ⋯ on a chat → Move/Delete → inspect `PATCH` body.

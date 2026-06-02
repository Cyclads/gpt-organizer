# ChatGPT web sidebar — reverse engineering notes

Captured from `samples/chatgpt-sidebar-snapshot.html` (your logged-in `chatgpt.com` UI, Jun 2026).

## Conversation list DOM

| Hook | Purpose |
|------|---------|
| `a[data-sidebar-item="true"][href*="/c/"]` | Main history chat row |
| `a[data-sidebar-item="true"][href*="/g/g-p-"][href*="/c/"]` | Chat inside a project |
| `[data-conversation-options-trigger="{uuid}"]` | Stable conversation id + ⋯ menu |
| `data-testid="history-item-N-options"` | Indexed options button (N changes when list reorders) |
| `aria-label` on `<a>` | Human title (Polish in your export) |

Conversation id format: UUID in `/c/{id}` or on `data-conversation-options-trigger`.

## Projects DOM

| Hook | Purpose |
|------|---------|
| `a[href^="/g/g-p-"][href$="/project"]` | Project folder in sidebar |
| `data-testid="sidebar-item-projects"` | Projects section marker |
| `data-testid="project-conversation-overflow-menu"` | Project-scoped chat ⋯ menu |

Gizmo / project id example: `g-p-680fe73c837c8191b16f1acdcc370a85-zdrowie-trening-dieta` (from `/g/g-p-…/project`).

## Internal HTTP API (confirmed live, Jun 2026)

Auth: `GET /api/auth/session` → `accessToken`, then `Authorization: Bearer …` + `credentials: include` on `backend-api` calls. The extension does not store tokens; it reads the session per request like the web app.

### List conversations

`GET /backend-api/conversations?offset=0&limit=N&order=updated`

Item fields (subset): `id`, `title`, `create_time`, `update_time`, `gizmo_id` (null when not in a project), `is_archived`, `is_starred`, `workspace_id`, `mapping`, …

### List projects (gizmos)

`GET /backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&cursor=`

Response items: `{ gizmo: { gizmo: { id, display: { name } } }, conversations }`.  
`id` example: `g-p-6a1eaf720f50819183099558b0906b93`.

Sidebar URLs append a slug: `/g/g-p-{id}-{slug}/project`. **PATCH uses the short id** (`g-p-{hex}` only). The extension normalizes via `normalizeGizmoId()`.

### Delete conversation

```http
PATCH /backend-api/conversation/{conversation_uuid}
Content-Type: application/json

{"is_visible": false}
```

### Move to project

```http
PATCH /backend-api/conversation/{conversation_uuid}
Content-Type: application/json

{"gizmo_id": "g-p-680fe73c837c8191b16f1acdcc370a85"}
```

Remove from project: `{"gizmo_id": null}`.

### Archive (optional)

`PATCH …` with `{"is_archived": true}`.

References: [bruvv gist](https://gist.github.com/bruvv/c25a168271f7bda197b9a0422fdb80aa), [chatgpt-exporter](https://github.com/pionxzh/chatgpt-exporter).

OpenAI can change routes without notice. UI menu fallback remains if PATCH fails.

## Fragility

- React re-renders replace sidebar nodes → use `MutationObserver` + re-inject checkboxes.
- `history-item-N-options` test ids are positional, not stable — prefer `data-conversation-options-trigger`.
- Only **visible** sidebar rows get checkboxes; scroll to load more before “All visible”.
- UI strings are localized (your snapshot: Polish).

## Optional probing

`scripts/probe-dom.mjs` — run against a logged-in Chrome profile via Playwright to dump live selectors.

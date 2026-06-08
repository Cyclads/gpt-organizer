# Import / export workflow (design)

Goal: **export metadata → analyze in ChatGPT (or elsewhere) → import decisions → batch apply** without losing work if the tab crashes.

## What metadata exists?

### From sidebar HTML only (always available for visible rows)

| Field | Source |
|-------|--------|
| `id` | `href` `/c/{uuid}` or `data-conversation-options-trigger` |
| `title` | `aria-label` / `.truncate` (may include “nieprzeczytane” / unread) |
| `href` | link |
| `projectGizmoId` | `/g/g-p-{id}/c/…` when chat lives in a project |
| `unread` | heuristics on `aria-label` |

No dates or model in the sidebar row alone.

### From `GET /backend-api/conversations` (recommended for export)

Per your capture, each list item can include:

`id`, `title`, `create_time`, `update_time`, `gizmo_id`, `is_archived`, `is_starred`, `is_temporary_chat`, `workspace_id`, `snippet`, `conversation_origin`, …

The extension **Export JSON / CSV** merges sidebar + API for **selected** chats (paginates API until all selected ids are found).

Full message content is **not** in the list endpoint; use ChatGPT’s own export or `GET /backend-api/conversation/{id}` if you add a later “deep export” mode.

---

## Phase 1 (implemented now)

- Collapsed FAB by default
- **Actions** tab: existing batch ops + **Export JSON** / **Export CSV**
- **Logs** tab: persisted in `localStorage` (`gptOrganizer.logs.v1`), exportable as JSON

---

## Phase 2 — CSV round-trip (implemented)

### Export (done)

```csv
id,title,href,project_gizmo_id,unread,update_time,gizmo_id,is_archived,is_starred,snippet
```

### Analysis (outside extension)

You upload CSV to ChatGPT with a prompt like:

> Add columns: `action` (`keep` | `delete` | `move`), `target_gizmo_id` (for move). Return CSV only.

### Import format

```csv
id,action,target_gizmo_id,notes
69fb0b8c-…,delete,,
6a01a858-…,move,g-p-680fe73c837c8191b16f1acdcc370a85,fitness
```

Rules:

- `action=delete` → `PATCH` `{ "is_visible": false }`
- `action=move` → `PATCH` `{ "gizmo_id": "g-p-…" }` (normalized short id)
- `action=remove-from-project` → `{ "gizmo_id": null }`
- `keep` / `skip` / empty action → skipped
- Invalid rows → counted in preview, not applied
- Move falls back to sidebar UI if API PATCH fails

### Import UI

- **Actions** tab: file input **Import plan (CSV / JSON)**
- Preview summary (counts + first few actions)
- **Apply plan** (confirm dialog) → batch PATCH with logging
- **Dismiss** clears plan
- Pending plan stored in `localStorage` (`gptOrganizer.pendingPlan.v1`) until applied or dismissed

---

## Phase 3 — In-extension “review queue”

- Store last import plan in `localStorage` until applied or dismissed
- Resume after crash: “You have a pending plan (42 actions)”
- Per-row status in Logs tab

---

## Safety

- Always confirm destructive batches
- Rate-limit PATCH (already ~280ms between calls)
- Logs retain conversation ids + errors for recovery
- Never send tokens or cookies to third parties; export files stay local

---

## Suggested ChatGPT analysis prompt (copy-paste)

```text
I attached a CSV export of my ChatGPT conversations (metadata only).
Please add columns: action (keep|delete|move|remove-from-project), target_gizmo_id, reason.
Rules: [your rules, e.g. delete empty tests older than 90 days, move career chats to g-p-…].
Output valid CSV with the same id column, ready for re-import into GPT Organizer.
```

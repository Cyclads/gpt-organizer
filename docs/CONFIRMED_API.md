# Confirmed API shapes (your account, Jun 2026)

Captured via DevTools on chatgpt.com. **Do not commit bearer tokens or curl exports with cookies.**

## Session

- `GET /api/auth/session` → `{ accessToken, user: { email } }`

## Conversation list item keys

`id`, `title`, `create_time`, `update_time`, `pinned_time`, `mapping`, `current_node`, `conversation_template_id`, `gizmo_id`, `is_archived`, `is_starred`, `is_temporary_chat`, `is_do_not_remember`, `memory_scope`, `context_scopes`, `context_scopes_v2`, `workspace_id`, `async_status`, `safe_urls`, `blocked_urls`, `conversation_origin`, `snippet`, `sugar_item_id`, `sugar_item_visible`

Unassigned chats have `gizmo_id: null`.

## Project list item

- Top-level: `gizmo`, `conversations`
- Project id: `gizmo.gizmo.id` (e.g. `g-p-6a1eaf720f50819183099558b0906b93`)

## Mutations

| Action | Body |
|--------|------|
| Delete | `{"is_visible": false}` |
| Move to project | `{"gizmo_id": "g-p-<hex>"}` |
| Remove from project | `{"gizmo_id": null}` |

Both use `PATCH /backend-api/conversation/{uuid}`.

## Gizmo id normalization

Move requests use the **short** id (`g-p-680fe73c837c8191b16f1acdcc370a85`), not the sidebar slug path (`g-p-680fe73c…-zdrowie-trening-dieta`). GPT Organizer strips the slug before PATCH.

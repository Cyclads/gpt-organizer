import { DELETE_DELAY_MS, LOG_PREFIX } from './constants';
import { normalizeGizmoId } from './dom';
import type { BatchResult, GptProject } from './types';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limited — retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'RateLimitError';
  }
}

function raiseIfRateLimited(res: Response): void {
  if (res.status === 429) {
    const header = res.headers.get('Retry-After');
    const ms = header ? parseFloat(header) * 1_000 : 0;
    throw new RateLimitError(ms > 0 ? ms : 0);
  }
}

export async function getAccessToken(): Promise<string> {
  const res = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Auth session failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { accessToken?: string };
  const token = typeof data.accessToken === 'string' ? data.accessToken : '';
  if (!token) throw new Error('No accessToken in /api/auth/session');
  return token;
}

async function backendFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  });
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await backendFetch(
    `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ is_visible: false }),
    },
  );
  raiseIfRateLimited(res);
  if (!res.ok) {
    throw new Error(`Delete failed for ${conversationId} (HTTP ${res.status})`);
  }
}

export async function setConversationGizmo(
  conversationId: string,
  gizmoId: string | null,
): Promise<void> {
  const normalized = gizmoId == null ? null : (normalizeGizmoId(gizmoId) ?? gizmoId);
  // ChatGPT requires an empty string to remove a conversation from a project.
  // Sending JSON null is accepted (HTTP 200) but has no effect — the gizmo_id stays unchanged.
  const apiValue = normalized === null ? '' : normalized;
  const op = normalized === null ? 'Remove from project' : 'Move';

  const res = await backendFetch(
    `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ gizmo_id: apiValue }),
    },
  );
  raiseIfRateLimited(res);
  if (!res.ok) {
    throw new Error(`${op} failed for ${conversationId} (HTTP ${res.status})`);
  }
}

// Verified endpoint: POST /backend-api/conversation/id/{id}/rename with { title }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function renameConversation(
  conversationId: string,
  newTitle: string,
): Promise<void> {
  if (!UUID_RE.test(conversationId)) {
    throw new Error(`renameConversation: invalid conversation ID "${conversationId}"`);
  }
  const trimmed = newTitle.trim();
  if (!trimmed) {
    throw new Error('renameConversation: newTitle must not be empty');
  }
  const res = await backendFetch(
    `/backend-api/conversation/id/${encodeURIComponent(conversationId)}/rename`,
    {
      method: 'POST',
      body: JSON.stringify({ title: trimmed }),
    },
  );
  raiseIfRateLimited(res);
  if (!res.ok) {
    throw new Error(`Rename failed for ${conversationId} (HTTP ${res.status})`);
  }
}

export type ConversationListItem = {
  id: string;
  title?: string;
  create_time?: string | number;
  update_time?: string | number;
  gizmo_id?: string | null;
  is_archived?: boolean;
  is_starred?: boolean | null;
  is_temporary_chat?: boolean;
  workspace_id?: string;
  conversation_origin?: string | null;
  snippet?: string;
};

export async function fetchConversationsPage(
  offset: number,
  limit: number,
): Promise<{ items: ConversationListItem[]; hasMore: boolean; total?: number }> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    order: 'updated',
    is_archived: 'false',
    is_starred: 'false',
    hide_snorlax: 'true',
  });

  const res = await backendFetch(`/backend-api/conversations?${params}`, {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error(`Conversations list failed (HTTP ${res.status})`);
  }

  const data = (await res.json()) as {
    items?: unknown[];
    has_more?: boolean;
    hasMore?: boolean;
    total?: number;
  };

  const items: ConversationListItem[] = [];
  for (const raw of Array.isArray(data.items) ? data.items : []) {
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== 'string') continue;
    items.push({
      id: row.id,
      title: row.title as string | undefined,
      create_time: row.create_time as string | number | undefined,
      update_time: row.update_time as string | number | undefined,
      gizmo_id: row.gizmo_id as string | null | undefined,
      is_archived: row.is_archived as boolean | undefined,
      is_starred: row.is_starred as boolean | null | undefined,
      is_temporary_chat: row.is_temporary_chat as boolean | undefined,
      workspace_id: row.workspace_id as string | undefined,
      conversation_origin: row.conversation_origin as string | null | undefined,
      snippet: row.snippet as string | undefined,
    });
  }

  const hasMore = data.has_more === true || data.hasMore === true;
  return { items, hasMore, total: typeof data.total === 'number' ? data.total : undefined };
}

// Confirmed endpoint (captured Jun 2026):
//   GET /backend-api/gizmos/{gizmoId}/conversations?cursor=0&limit=N&owned_only=true
// Uses cursor-based pagination, NOT offset. First call uses cursor="0".
// The response cursor field (next_cursor / cursor) provides the value for the next call.
// owned_only=true is required — omitting it returns HTTP 422.
export async function fetchProjectConversationsPage(
  gizmoId: string,
  cursor: string,
  limit: number,
): Promise<{ items: ConversationListItem[]; nextCursor: string | null }> {
  const params = new URLSearchParams({
    cursor,
    limit: String(limit),
    owned_only: 'true',
  });
  const res = await backendFetch(
    `/backend-api/gizmos/${encodeURIComponent(gizmoId)}/conversations?${params}`,
    { method: 'GET' },
  );
  if (!res.ok) {
    throw new Error(`Project conversations failed for "${gizmoId}" (HTTP ${res.status})`);
  }
  const data = (await res.json()) as {
    items?: unknown[];
    // Support both field names defensively — actual field name to be confirmed on first run.
    next_cursor?: string | number | null;
    cursor?: string | number | null;
  };
  const items: ConversationListItem[] = [];
  for (const raw of Array.isArray(data.items) ? data.items : []) {
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== 'string') continue;
    items.push({
      id: row.id,
      title: row.title as string | undefined,
      create_time: row.create_time as string | number | undefined,
      update_time: row.update_time as string | number | undefined,
      gizmo_id: row.gizmo_id as string | null | undefined,
      is_archived: row.is_archived as boolean | undefined,
      is_starred: row.is_starred as boolean | null | undefined,
      is_temporary_chat: row.is_temporary_chat as boolean | undefined,
      workspace_id: row.workspace_id as string | undefined,
      conversation_origin: row.conversation_origin as string | null | undefined,
      snippet: row.snippet as string | undefined,
    });
  }
  // Prefer next_cursor, fall back to cursor. Null / undefined / same-as-current = no more pages.
  const rawNext = data.next_cursor ?? data.cursor ?? null;
  const nextCursor = rawNext != null ? String(rawNext) : null;
  return { items, nextCursor };
}

export async function fetchProjects(): Promise<GptProject[]> {
  const projects: GptProject[] = [];
  let cursor: number | null = null;

  for (let page = 0; page < 50; page += 1) {
    const params = new URLSearchParams({ conversations_per_gizmo: '0' });
    if (cursor != null) params.set('cursor', String(cursor));

    const res = await backendFetch(
      `/backend-api/gizmos/snorlax/sidebar?${params}`,
      { method: 'GET' },
    );
    raiseIfRateLimited(res);
    if (!res.ok) {
      throw new Error(`Projects list failed (HTTP ${res.status})`);
    }

    const data = (await res.json()) as {
      items?: unknown[];
      cursor?: number | null;
    };

    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      const row = item as Record<string, unknown>;
      const gizmo = row.gizmo as Record<string, unknown> | undefined;
      const inner = (gizmo?.gizmo ?? gizmo) as Record<string, unknown> | undefined;
      const display = inner?.display as { name?: string } | undefined;
      const id = (inner?.id ?? gizmo?.id ?? row.id) as string | undefined;
      const title =
        display?.name ??
        (gizmo?.display as { name?: string } | undefined)?.name ??
        (inner?.name as string | undefined) ??
        'Untitled project';
      if (id) projects.push({ id, title });
    }

    const next = data.cursor ?? null;
    if (next == null) break;
    cursor = next;
  }

  const seen = new Set<string>();
  return projects.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export async function createProject(name: string): Promise<string> {
  const trimmedName = name.trim();
  const res = await backendFetch('/backend-api/projects', {
    method: 'POST',
    body: JSON.stringify({ instructions: '', name: trimmedName, memory_scope: 'unset' }),
  });
  raiseIfRateLimited(res);
  if (!res.ok) {
    throw new Error(`Create project "${trimmedName}" failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as Record<string, unknown>;

  // Confirmed response shape: { resource: { ... }, error: null, sharing_targets: [] }
  // Also try legacy/alternative shapes defensively.
  const resource = data.resource as Record<string, unknown> | undefined;
  const gizmoFromData = data.gizmo as Record<string, unknown> | undefined;
  const gizmoFromResource = resource?.gizmo as Record<string, unknown> | undefined;
  const inner =
    ((gizmoFromData?.gizmo ?? gizmoFromData) as Record<string, unknown> | undefined) ??
    ((gizmoFromResource?.gizmo ?? gizmoFromResource) as Record<string, unknown> | undefined);

  const id =
    (data.id as string | undefined) ??
    (data.gizmo_id as string | undefined) ??
    (resource?.id as string | undefined) ??
    (resource?.gizmo_id as string | undefined) ??
    (inner?.id as string | undefined);

  if (id && typeof id === 'string') return id;

  // ID not found in the immediate response — project was likely created successfully.
  // Verify by fetching the project list and matching by name (max 3 attempts, 1 s apart).
  const nameLower = trimmedName.toLowerCase();
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(1000);
    try {
      const projects = await fetchProjects();
      const match = projects.find((p) => p.title.trim().toLowerCase() === nameLower);
      if (match) return match.id;
    } catch {
      // ignore transient fetch error, keep retrying
    }
  }

  throw new Error(
    `createProject: "${trimmedName}" may have been created but ID could not be confirmed. Response keys: ${Object.keys(data).join(', ')}`,
  );
}

export type RawConversationNode = {
  id: string;
  parent?: string | null;
  children?: string[];
  message?: {
    author?: { role?: string };
    content?: {
      content_type?: string;
      parts?: unknown[];
    };
    create_time?: number | null;
  } | null;
};

export type RawConversation = {
  title?: string;
  create_time?: number | null;
  update_time?: number | null;
  gizmo_id?: string | null;
  is_archived?: boolean;
  is_starred?: boolean | null;
  current_node?: string;
  mapping?: Record<string, RawConversationNode>;
};

export async function fetchConversationDetail(conversationId: string): Promise<RawConversation> {
  const res = await backendFetch(
    `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
    { method: 'GET' },
  );
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get('Retry-After');
    const retryAfterMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : 0;
    throw new RateLimitError(retryAfterMs > 0 ? retryAfterMs : 0);
  }
  if (!res.ok) {
    throw new Error(`Fetch conversation failed for ${conversationId} (HTTP ${res.status})`);
  }
  return res.json() as Promise<RawConversation>;
}

export async function runBatch(
  items: string[],
  worker: (id: string) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const id = items[i];
    try {
      await worker(id);
      results.push({ id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(LOG_PREFIX, message);
      results.push({ id, ok: false, error: message });
    }
    onProgress?.(i + 1, items.length);
    if (i < items.length - 1) await sleep(DELETE_DELAY_MS);
  }
  return results;
}

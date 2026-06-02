import { DELETE_DELAY_MS, LOG_PREFIX } from './constants';
import { normalizeGizmoId } from './dom';
import type { BatchResult, GptProject } from './types';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (!res.ok) {
    throw new Error(`Delete failed for ${conversationId} (HTTP ${res.status})`);
  }
}

export async function setConversationGizmo(
  conversationId: string,
  gizmoId: string | null,
): Promise<void> {
  const normalized = gizmoId == null ? null : (normalizeGizmoId(gizmoId) ?? gizmoId);

  const res = await backendFetch(
    `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ gizmo_id: normalized }),
    },
  );
  if (!res.ok) {
    throw new Error(`Move failed for ${conversationId} (HTTP ${res.status})`);
  }
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

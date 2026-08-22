import * as api from './api';
import { normalizeGizmoId } from './dom';
import type { ConversationRow } from './types';

export type ConversationMetadata = {
  id: string;
  title: string;
  href?: string;
  projectGizmoId?: string | null;
  unread?: boolean;
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

const UNREAD_HINTS = [/nieprzeczytane/i, /\bunread\b/i];

function cleanTitle(raw: string): string {
  return raw
    .replace(/,?\s*nieprzeczytane\s*$/i, '')
    .replace(/,?\s*unread\s*$/i, '')
    .trim();
}

function projectFromHref(href: string): string | null {
  const match = href.match(/^\/g\/(g-p-[^/]+)\/c\//i);
  return match ? (normalizeGizmoId(match[1]) ?? null) : null;
}

export function metadataFromSidebarRow(row: ConversationRow): ConversationMetadata {
  const href = row.element.getAttribute('href') || `/c/${row.id}`;
  const aria = row.element.getAttribute('aria-label') || row.title;
  const unread = UNREAD_HINTS.some((re) => re.test(aria));

  return {
    id: row.id,
    title: cleanTitle(row.title),
    href,
    projectGizmoId: projectFromHref(href),
    unread,
  };
}

export async function fetchApiMetadataForIds(
  ids: Set<string>,
  onProgress?: (fetched: number, total: number) => void,
): Promise<Map<string, ConversationMetadata>> {
  const found = new Map<string, ConversationMetadata>();
  if (!ids.size) return found;

  const limit = 100;
  for (let offset = 0; offset < 5000; offset += limit) {
    const page = await api.fetchConversationsPage(offset, limit);
    for (const item of page.items) {
      if (!item.id || !ids.has(item.id)) continue;
      found.set(item.id, {
        id: item.id,
        title: item.title ?? item.id,
        create_time: item.create_time,
        update_time: item.update_time,
        gizmo_id: item.gizmo_id,
        is_archived: item.is_archived,
        is_starred: item.is_starred,
        is_temporary_chat: item.is_temporary_chat,
        workspace_id: item.workspace_id,
        conversation_origin: item.conversation_origin,
        snippet: item.snippet,
      });
    }
    onProgress?.(found.size, ids.size);
    if (found.size >= ids.size) break;
    if (!page.hasMore) break;
  }

  return found;
}

export async function buildMetadataForSelection(
  rows: ConversationRow[],
  options: { includeApi?: boolean } = {},
): Promise<ConversationMetadata[]> {
  const sidebar = rows.map(metadataFromSidebarRow);
  if (!options.includeApi) return sidebar;

  const ids = new Set(sidebar.map((r) => r.id));
  let apiMap: Map<string, ConversationMetadata>;
  try {
    apiMap = await fetchApiMetadataForIds(ids);
  } catch {
    return sidebar;
  }

  return sidebar.map((s) => ({
    ...s,
    ...apiMap.get(s.id),
  }));
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function metadataToCsv(rows: ConversationMetadata[]): string {
  const headers = [
    'id',
    'title',
    'new_title',
    'href',
    'project_gizmo_id',
    'unread',
    'update_time',
    'create_time',
    'gizmo_id',
    'is_archived',
    'is_starred',
    'workspace_id',
    'snippet',
  ];
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => escape((r as Record<string, unknown>)[h])).join(','),
    ),
  ];
  return lines.join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJsonl(filename: string, lines: string[]): void {
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/x-ndjson;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

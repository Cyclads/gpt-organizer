import { LOGS_STORAGE_KEY, MAX_LOG_ENTRIES } from './constants';

export type LogLevel = 'info' | 'success' | 'error';

/** One affected conversation in a batch log entry. */
export type LogItem = {
  id: string;
  title?: string;
  /** Per-row verb, e.g. delete / move / remove-from-project */
  action?: string;
  ok?: boolean;
  error?: string;
  /** Import-plan notes or other human context */
  notes?: string;
  /** Move target project id */
  targetGizmoId?: string | null;
  /** Rename target title */
  newTitle?: string;
};

export type OrganizerLogEntry = {
  id: string;
  at: string;
  level: LogLevel;
  action: string;
  message: string;
  /** How the operation was triggered */
  source?: string;
  /** Why it ran (user intent, plan file, etc.) */
  reason?: string;
  /** Batch target label (project name for moves) */
  target?: string;
  conversationIds?: string[];
  detail?: string;
  items?: LogItem[];
};

function readLogs(): OrganizerLogEntry[] {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { entries?: OrganizerLogEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

function writeLogs(entries: OrganizerLogEntry[]): void {
  try {
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify({ entries }));
  } catch {
    /* quota */
  }
}

export function appendLog(
  partial: Omit<OrganizerLogEntry, 'id' | 'at'> & { at?: string },
): OrganizerLogEntry {
  const entry: OrganizerLogEntry = {
    id: crypto.randomUUID(),
    at: partial.at ?? new Date().toISOString(),
    level: partial.level,
    action: partial.action,
    message: partial.message,
    source: partial.source,
    reason: partial.reason,
    target: partial.target,
    conversationIds: partial.conversationIds,
    detail: partial.detail,
    items: partial.items,
  };

  const entries = [...readLogs(), entry];
  writeLogs(entries.slice(-MAX_LOG_ENTRIES));
  return entry;
}

export function getLogs(): OrganizerLogEntry[] {
  return readLogs();
}

export function clearLogs(): void {
  writeLogs([]);
}

const MAX_ITEMS_IN_UI = 40;

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function formatItemLine(item: LogItem): string {
  const title = item.title?.trim() || '(untitled)';
  const status =
    item.ok === false ?
      `failed: ${item.error ?? 'unknown'}`
    : item.ok === true ?
      'ok'
    : '';
  const action = item.action ? ` [${item.action}]` : '';
  const notes = item.notes?.trim() ? ` — ${item.notes.trim()}` : '';
  const targetParts: string[] = [];
  if (item.newTitle) targetParts.push(`rename → "${item.newTitle}"`);
  if (item.targetGizmoId) {
    targetParts.push(item.newTitle ? `move → ${item.targetGizmoId}` : `→ ${item.targetGizmoId}`);
  }
  const target = targetParts.length ? ` ${targetParts.join(', ')}` : '';
  const tail = [status, notes, target].filter(Boolean).join('');
  return `${title} (${shortId(item.id)})${action}${tail ? ` · ${tail}` : ''}`;
}

export function formatLogLine(entry: OrganizerLogEntry): string {
  const time = new Date(entry.at).toLocaleString();
  const head = `${time} · ${entry.action}: ${entry.message}`;
  const meta: string[] = [];
  if (entry.source) meta.push(`source: ${entry.source}`);
  if (entry.reason) meta.push(entry.reason);
  if (entry.target) meta.push(`target: ${entry.target}`);
  if (entry.detail) meta.push(entry.detail);

  const lines = [head];
  if (meta.length) lines.push(`  ${meta.join(' · ')}`);

  if (entry.items?.length) {
    const shown = entry.items.slice(0, MAX_ITEMS_IN_UI);
    for (const item of shown) {
      lines.push(`  · ${formatItemLine(item)}`);
    }
    if (entry.items.length > shown.length) {
      lines.push(`  · …and ${entry.items.length - shown.length} more`);
    }
  } else if (entry.conversationIds?.length) {
    lines.push(`  · ${entry.conversationIds.length} conversation id(s) (no titles stored)`);
    for (const id of entry.conversationIds.slice(0, 12)) {
      lines.push(`  · ${shortId(id)}`);
    }
    if (entry.conversationIds.length > 12) {
      lines.push(`  · …and ${entry.conversationIds.length - 12} more`);
    }
  }

  return lines.join('\n');
}

export function renderLogEntry(entry: OrganizerLogEntry): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'gpt-organizer-logs-entry';
  wrap.dataset.level = entry.level;

  const head = document.createElement('div');
  head.className = 'gpt-organizer-logs-head';
  const time = document.createElement('time');
  time.dateTime = entry.at;
  time.textContent = new Date(entry.at).toLocaleString();
  const summary = document.createElement('span');
  summary.className = 'gpt-organizer-logs-summary';
  summary.textContent = `${entry.action}: ${entry.message}`;
  head.append(time, summary);
  wrap.appendChild(head);

  if (entry.reason || entry.source || entry.target) {
    const meta = document.createElement('div');
    meta.className = 'gpt-organizer-logs-meta';
    const parts: string[] = [];
    if (entry.source) parts.push(entry.source);
    if (entry.reason) parts.push(entry.reason);
    if (entry.target) parts.push(`→ ${entry.target}`);
    meta.textContent = parts.join(' · ');
    wrap.appendChild(meta);
  }

  if (entry.detail && !entry.items?.length) {
    const detail = document.createElement('div');
    detail.className = 'gpt-organizer-logs-detail';
    detail.textContent = entry.detail;
    wrap.appendChild(detail);
  }

  if (entry.items?.length) {
    const list = document.createElement('ul');
    list.className = 'gpt-organizer-logs-items';
    const shown = entry.items.slice(0, MAX_ITEMS_IN_UI);
    for (const item of shown) {
      const li = document.createElement('li');
      li.className = item.ok === false ? 'is-error' : item.ok === true ? 'is-ok' : '';
      const title = document.createElement('span');
      title.className = 'gpt-organizer-logs-item-title';
      title.textContent = item.title?.trim() || '(untitled)';
      title.title = item.id;

      const idSpan = document.createElement('span');
      idSpan.className = 'gpt-organizer-logs-item-id';
      idSpan.textContent = shortId(item.id);
      idSpan.title = item.id;

      li.append(title, document.createTextNode(' '), idSpan);

      if (item.action) {
        const act = document.createElement('span');
        act.className = 'gpt-organizer-logs-item-action';
        act.textContent = item.action;
        li.append(document.createTextNode(' '), act);
      }

      if (item.newTitle) {
        const tgt = document.createElement('span');
        tgt.className = 'gpt-organizer-logs-item-target';
        tgt.textContent = `rename → "${item.newTitle}"`;
        li.append(document.createTextNode(' '), tgt);
      }
      if (item.targetGizmoId) {
        const tgt = document.createElement('span');
        tgt.className = 'gpt-organizer-logs-item-target';
        tgt.textContent = item.newTitle ? `move → ${item.targetGizmoId}` : `→ ${item.targetGizmoId}`;
        li.append(document.createTextNode(' '), tgt);
      }

      if (item.notes?.trim()) {
        const notes = document.createElement('span');
        notes.className = 'gpt-organizer-logs-item-notes';
        notes.textContent = item.notes.trim();
        li.append(document.createTextNode(' — '), notes);
      }

      if (item.ok === false && item.error) {
        const err = document.createElement('span');
        err.className = 'gpt-organizer-logs-item-error';
        err.textContent = item.error;
        li.append(document.createTextNode(' · '), err);
      }

      list.appendChild(li);
    }
    if (entry.items.length > shown.length) {
      const more = document.createElement('li');
      more.className = 'gpt-organizer-logs-more';
      more.textContent = `…and ${entry.items.length - shown.length} more`;
      list.appendChild(more);
    }
    wrap.appendChild(list);
  }

  return wrap;
}

import * as api from './api';
import { PENDING_PLAN_STORAGE_KEY } from './constants';
import { normalizeGizmoId } from './dom';

export type PlanAction = 'delete' | 'move' | 'remove-from-project' | 'skip';

export type ImportPlanRow = {
  id: string;
  action: PlanAction;
  targetGizmoId?: string | null;
  notes?: string;
  /** Set when row failed validation */
  error?: string;
};

export type ImportPlan = {
  importedAt: string;
  fileName?: string;
  rows: ImportPlanRow[];
};

export type PlanSummary = {
  delete: number;
  move: number;
  removeFromProject: number;
  skip: number;
  invalid: number;
  actionable: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADER_ALIASES: Record<string, string[]> = {
  id: ['id', 'conversation_id', 'conversationid', 'chat_id'],
  action: ['action', 'decision', 'verb', 'operation'],
  target_gizmo_id: [
    'target_gizmo_id',
    'target_gizmo',
    'targetgizmo_id',
    'gizmo_id',
    'project_id',
    'project',
    'target_project',
  ],
  notes: ['notes', 'note', 'reason', 'comment', 'comments'],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Minimal RFC 4180-style CSV parser (one record). */
export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || (c === '\r' && next === '\n')) {
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      if (c === '\r') i += 1;
    } else if (c !== '\r') {
      field += c;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);

  return rows;
}

function resolveHeaderIndex(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalized = headers.map(normalizeHeader);

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[canonical] = idx;
  }

  return map;
}

export function normalizePlanAction(raw: string): PlanAction | 'invalid' {
  const a = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (!a || a === 'keep' || a === 'skip' || a === 'ignore' || a === 'none') {
    return 'skip';
  }
  if (a === 'delete' || a === 'del' || a === 'remove' || a === 'trash') {
    return 'delete';
  }
  if (a === 'move' || a === 'moveto' || a === 'assign') {
    return 'move';
  }
  if (
    a === 'remove-from-project' ||
    a === 'remove_from_project' ||
    a === 'unassign' ||
    a === 'no-project' ||
    a === 'noproject' ||
    a === 'detach'
  ) {
    return 'remove-from-project';
  }
  return 'invalid';
}

function parseRow(
  cells: string[],
  headerMap: Record<string, number>,
): ImportPlanRow {
  const get = (key: string) => {
    const idx = headerMap[key];
    return idx == null ? '' : (cells[idx] ?? '').trim();
  };

  const id = get('id');
  const actionRaw = get('action');
  const targetRaw = get('target_gizmo_id');
  const notes = get('notes') || undefined;

  if (!id) {
    return { id: '', action: 'skip', error: 'Missing id' };
  }

  if (!UUID_RE.test(id)) {
    return { id, action: 'skip', notes, error: 'Invalid conversation id' };
  }

  const action = normalizePlanAction(actionRaw);
  if (action === 'invalid') {
    return {
      id,
      action: 'skip',
      notes,
      error: `Unknown action: ${actionRaw || '(empty)'}`,
    };
  }

  if (action === 'skip') {
    return { id, action: 'skip', notes };
  }

  if (action === 'move') {
    const targetGizmoId = targetRaw ? (normalizeGizmoId(targetRaw) ?? targetRaw) : null;
    if (!targetGizmoId) {
      return {
        id,
        action: 'skip',
        notes,
        error: 'Move requires target_gizmo_id',
      };
    }
    return { id, action: 'move', targetGizmoId, notes };
  }

  if (action === 'remove-from-project') {
    return { id, action: 'remove-from-project', targetGizmoId: null, notes };
  }

  return { id, action: 'delete', notes };
}

export function parseImportCsv(text: string, fileName?: string): ImportPlan {
  const records = parseCsvRecords(text.trim());
  if (!records.length) {
    return { importedAt: new Date().toISOString(), fileName, rows: [] };
  }

  const headerMap = resolveHeaderIndex(records[0]);
  if (headerMap.id == null || headerMap.action == null) {
    throw new Error(
      'CSV must include id and action columns (e.g. id, action, target_gizmo_id, notes).',
    );
  }

  const rows = records.slice(1).map((cells) => parseRow(cells, headerMap));
  return { importedAt: new Date().toISOString(), fileName, rows };
}

export function parseImportJson(text: string, fileName?: string): ImportPlan {
  const data = JSON.parse(text) as unknown;
  let items: unknown[] = [];

  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === 'object') {
    const obj = data as { conversations?: unknown[]; rows?: unknown[] };
    items = Array.isArray(obj.conversations) ? obj.conversations : obj.rows ?? [];
  }

  const rows: ImportPlanRow[] = items.map((item) => {
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? '').trim();
    const actionRaw = String(row.action ?? row.decision ?? '').trim();
    const targetRaw = String(
      row.target_gizmo_id ?? row.targetGizmoId ?? row.gizmo_id ?? '',
    ).trim();
    const notes = row.notes != null ? String(row.notes) : row.reason != null ? String(row.reason) : undefined;

    return parseRow(
      [
        id,
        actionRaw,
        targetRaw,
        notes ?? '',
      ],
      { id: 0, action: 1, target_gizmo_id: 2, notes: 3 },
    );
  });

  return { importedAt: new Date().toISOString(), fileName, rows };
}

export function summarizePlan(plan: ImportPlan): PlanSummary {
  const summary: PlanSummary = {
    delete: 0,
    move: 0,
    removeFromProject: 0,
    skip: 0,
    invalid: 0,
    actionable: 0,
  };

  for (const row of plan.rows) {
    if (row.error) {
      summary.invalid += 1;
      continue;
    }
    if (row.action === 'skip') {
      summary.skip += 1;
      continue;
    }
    summary.actionable += 1;
    if (row.action === 'delete') summary.delete += 1;
    else if (row.action === 'move') summary.move += 1;
    else if (row.action === 'remove-from-project') summary.removeFromProject += 1;
  }

  return summary;
}

export function getActionableRows(plan: ImportPlan): ImportPlanRow[] {
  return plan.rows.filter((r) => !r.error && r.action !== 'skip');
}

export function savePendingPlan(plan: ImportPlan | null): void {
  try {
    if (!plan) {
      localStorage.removeItem(PENDING_PLAN_STORAGE_KEY);
      return;
    }
    localStorage.setItem(PENDING_PLAN_STORAGE_KEY, JSON.stringify(plan));
  } catch {
    /* quota */
  }
}

export function loadPendingPlan(): ImportPlan | null {
  try {
    const raw = localStorage.getItem(PENDING_PLAN_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ImportPlan;
    if (!Array.isArray(data.rows)) return null;
    return data;
  } catch {
    return null;
  }
}

export function formatPlanPreview(plan: ImportPlan): string {
  const s = summarizePlan(plan);
  const lines = [
    `Plan: ${s.actionable} to apply`,
    `  delete: ${s.delete}`,
    `  move: ${s.move}`,
    `  remove from project: ${s.removeFromProject}`,
    `  skip: ${s.skip}`,
  ];
  if (s.invalid) lines.push(`  invalid rows: ${s.invalid}`);

  const samples = getActionableRows(plan).slice(0, 8);
  if (samples.length) {
    lines.push('', 'First actions:');
    for (const row of samples) {
      const extra =
        row.action === 'move' ? ` → ${row.targetGizmoId}` : '';
      lines.push(`  ${row.action} ${row.id.slice(0, 8)}…${extra}`);
    }
    if (s.actionable > samples.length) {
      lines.push(`  …and ${s.actionable - samples.length} more`);
    }
  }

  return lines.join('\n');
}

export async function executePlanRow(row: ImportPlanRow): Promise<void> {
  if (row.action === 'delete') {
    await api.deleteConversation(row.id);
    return;
  }
  if (row.action === 'remove-from-project') {
    await api.setConversationGizmo(row.id, null);
    return;
  }
  if (row.action === 'move' && row.targetGizmoId) {
    await api.setConversationGizmo(row.id, row.targetGizmoId);
  }
}

export function parseImportFile(
  text: string,
  fileName: string,
): ImportPlan {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) {
    return parseImportJson(text, fileName);
  }
  return parseImportCsv(text, fileName);
}

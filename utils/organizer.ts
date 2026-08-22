import * as api from './api';
import {
  DELETE_DELAY_MS,
  LOG_PREFIX,
  MOVE_MENU_LABELS,
  REMOVE_FROM_PROJECT_LABELS,
  ROOT_ID,
} from './constants';
import {
  findOpenMenuItem,
  findOptionsButton,
  findProjectsInSidebar,
  findVisibleConversations,
  normalizeGizmoId,
} from './dom';
import {
  appendLog,
  clearLogs,
  getLogs,
  renderLogEntry,
  type LogItem,
} from './logs';
import {
  buildMetadataForSelection,
  downloadCsv,
  downloadJson,
  downloadJsonl,
  fetchApiMetadataForIds,
  metadataFromSidebarRow,
  metadataToCsv,
  type ConversationMetadata,
} from './metadata';
import {
  buildExportRecord,
  toJsonlLine,
  type EnrichedExportLine,
} from './conversationSampler';
import {
  executePrimaryAction,
  formatPlanPreview,
  getActionableRows,
  loadPendingPlan,
  parseImportFile,
  savePendingPlan,
  summarizePlan,
  type ImportPlan,
  type ImportPlanRow,
} from './importPlan';
import { SidebarSelection } from './sidebarSelection';
import {
  clearExportCheckpoint,
  loadExportCheckpoint,
  saveExportCheckpoint,
  type ExportCheckpoint,
} from './exportCheckpoint';
import { loadUiState, saveUiState, type OrganizerUiState } from './storage';
import type { BatchResult, GptProject } from './types';

let ui: OrganizerUiState = loadUiState();
let busy = false;
let pendingPlan: ImportPlan | null = loadPendingPlan();
let importListenerBound = false;
let bodyRootWatcher: MutationObserver | null = null;

const selection = new SidebarSelection(() => updateCount());

function persistUi(): void {
  saveUiState(ui);
}

function conversationTitleMap(ids: string[]): Map<string, string> {
  return selection.titleMap(ids);
}

function resultsToLogItems(
  results: BatchResult[],
  titles: Map<string, string>,
  options?: {
    defaultAction?: string;
    planById?: Map<string, ImportPlanRow>;
    targetGizmoId?: string | null;
  },
): LogItem[] {
  return results.map((r) => {
    const plan = options?.planById?.get(r.id);
    return {
      id: r.id,
      title: titles.get(r.id),
      action: plan?.action ?? options?.defaultAction,
      ok: r.ok,
      error: r.error,
      notes: plan?.notes,
      targetGizmoId:
        plan?.action === 'move' ? plan.targetGizmoId
        : options?.targetGizmoId,
      newTitle: plan?.newTitle,
    };
  });
}

type BatchLogMeta = {
  source: string;
  reason: string;
  target?: string;
  defaultAction?: string;
  planRows?: ImportPlanRow[];
  targetGizmoId?: string | null;
};

function logBatch(
  action: string,
  results: BatchResult[],
  meta: BatchLogMeta,
  level: 'success' | 'error' = 'success',
  titlesBefore?: Map<string, string>,
): void {
  const failed = results.filter((r) => !r.ok);
  const ok = results.length - failed.length;
  const ids = results.map((r) => r.id);
  const titles = titlesBefore ?? conversationTitleMap(ids);
  const planById = new Map(meta.planRows?.map((row) => [row.id, row]) ?? []);

  appendLog({
    level: failed.length ? 'error' : level,
    action,
    source: meta.source,
    reason: meta.reason,
    target: meta.target,
    message:
      failed.length ?
        `${ok} ok, ${failed.length} failed`
      : `${ok} succeeded`,
    conversationIds: ids,
    detail: failed.length === 1 ? failed[0]?.error : failed.length > 1 ? `${failed.length} failures` : undefined,
    items: resultsToLogItems(results, titles, {
      defaultAction: meta.defaultAction,
      planById,
      targetGizmoId: meta.targetGizmoId,
    }),
  });
  renderLogs();
}

function setStatus(text: string, isError = false): void {
  const el = document.getElementById('gpt-organizer-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.error = isError ? 'true' : 'false';
}

function applyRootDataset(): void {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.dataset.expanded = ui.panelCollapsed ? 'false' : 'true';
  root.dataset.enabled = ui.enabled ? 'true' : 'false';
  root.dataset.busy = busy ? 'true' : 'false';
}

function updateCount(): void {
  const countEl = document.getElementById('gpt-organizer-count');
  const fabCount = document.getElementById('gpt-organizer-fab-count');
  const n = String(selection.selected.size);
  if (countEl) countEl.textContent = n;
  if (fabCount) fabCount.textContent = n;
  applyRootDataset();
  persistUi();
}

function setExpanded(expanded: boolean): void {
  ui.panelCollapsed = !expanded;
  applyRootDataset();
  persistUi();
}

function setTab(tab: 'actions' | 'logs'): void {
  ui.activeTab = tab;
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  for (const btn of root.querySelectorAll('.gpt-organizer-tab')) {
    const t = btn.getAttribute('data-tab');
    btn.setAttribute('data-active', t === tab ? 'true' : 'false');
  }
  for (const pane of root.querySelectorAll('.gpt-organizer-pane')) {
    const p = pane.getAttribute('data-pane');
    pane.setAttribute('data-active', p === tab ? 'true' : 'false');
  }
  if (tab === 'logs') renderLogs();
  persistUi();
}

function renderLogs(): void {
  const el = document.getElementById('gpt-organizer-logs');
  if (!el) return;
  const entries = getLogs();
  if (!entries.length) {
    el.textContent = 'No operations logged yet.';
    return;
  }
  el.innerHTML = '';
  for (const entry of [...entries].reverse()) {
    el.appendChild(renderLogEntry(entry));
  }
}

export function syncCheckboxes(): void {
  console.info(`${LOG_PREFIX} [DIAG] syncCheckboxes called — root present: ${!!document.getElementById(ROOT_ID)}`);
  ensureToolbar();
  selection.sync(ui.enabled);
}

function removeCheckboxArtifacts(): void {
  selection.removeAllCheckboxDom();
}

function watchBodyForRootRemoval(): void {
  if (bodyRootWatcher) return;
  bodyRootWatcher = new MutationObserver((mutations) => {
    const rootGone = mutations.some(
      (m) =>
        m.type === 'childList' &&
        [...m.removedNodes].some((n) => n instanceof Element && n.id === ROOT_ID),
    );
    if (rootGone) {
      console.warn(`${LOG_PREFIX} [DIAG] bodyRootWatcher: root removed — re-injecting`);
      ensureToolbar();
    }
  });
  bodyRootWatcher.observe(document.body, { childList: true });
}

function ensureToolbar(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (root) {
    console.info(`${LOG_PREFIX} [DIAG] ensureToolbar: root already exists`);
    return root;
  }

  console.warn(`${LOG_PREFIX} [DIAG] ensureToolbar: root NOT found — creating new root. document.body =`, document.body);
  importListenerBound = false;
  root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <button type="button" class="gpt-organizer-fab" data-action="expand" aria-label="Open GPT Organizer">
      <span class="gpt-organizer-fab__dot"></span>
      <span>Organizer</span>
      <span id="gpt-organizer-fab-count">0</span>
    </button>
    <div class="gpt-organizer-panel">
      <div class="gpt-organizer-header">
        <strong>GPT Organizer</strong>
        <span class="gpt-organizer-badge" id="gpt-organizer-count">0</span>
        <button type="button" class="gpt-organizer-icon-btn" data-action="minimize" title="Minimize">−</button>
      </div>
      <div class="gpt-organizer-tabs">
        <button type="button" class="gpt-organizer-tab" data-tab="actions" data-active="true">Actions</button>
        <button type="button" class="gpt-organizer-tab" data-tab="logs">Logs</button>
      </div>
      <div class="gpt-organizer-body">
        <div class="gpt-organizer-pane" data-pane="actions" data-active="true">
          <p class="gpt-organizer-hint">Check chats in the sidebar, then batch move or delete. <kbd>Shift</kbd>+click applies to every chat between the anchor and the row you click (check or uncheck — same as clicking that row). <strong>Clear</strong> resets all. Selection is not saved between browser sessions. Panel starts minimized.</p>
          <div class="gpt-organizer-actions">
            <button type="button" data-action="select-all">All visible</button>
            <button type="button" data-action="clear">Clear</button>
            <button type="button" data-action="pause">Pause</button>
          </div>
          <label class="gpt-organizer-move">
            <span>Move to project</span>
            <select id="gpt-organizer-project-select">
              <option value="">— load projects —</option>
            </select>
          </label>
          <div class="gpt-organizer-actions">
            <button type="button" data-action="move">Move selected</button>
            <button type="button" data-action="remove-project">Remove from project</button>
          </div>
          <div class="gpt-organizer-actions gpt-organizer-actions-danger">
            <button type="button" data-action="delete" class="danger">Delete selected</button>
          </div>
          <div class="gpt-organizer-actions">
            <button type="button" data-action="export-json">Export JSON</button>
            <button type="button" data-action="export-csv">Export CSV</button>
            <button type="button" data-action="export-enriched">Export enriched</button>
            <button type="button" data-action="export-all-enriched">Export ALL enriched</button>
          </div>
          <div class="gpt-organizer-import">
            <label class="gpt-organizer-file-label">
              Import plan (CSV / JSON)
              <input type="file" id="gpt-organizer-import-file" accept=".csv,.json,text/csv,application/json" class="gpt-organizer-file-input" />
            </label>
          </div>
          <pre id="gpt-organizer-import-preview" class="gpt-organizer-import-preview" hidden></pre>
          <div id="gpt-organizer-import-actions" class="gpt-organizer-actions" hidden>
            <button type="button" data-action="apply-plan" class="danger">Apply plan</button>
            <button type="button" data-action="dismiss-plan">Dismiss</button>
          </div>
          <p class="gpt-organizer-status" id="gpt-organizer-status">Ready</p>
        </div>
        <div class="gpt-organizer-pane" data-pane="logs" data-active="false">
          <div id="gpt-organizer-logs" class="gpt-organizer-logs"></div>
          <div class="gpt-organizer-actions">
            <button type="button" data-action="clear-logs">Clear logs</button>
            <button type="button" data-action="export-logs">Export logs</button>
          </div>
        </div>
      </div>
    </div>
  `;

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const tab = target.closest('.gpt-organizer-tab')?.getAttribute('data-tab');
    if (tab === 'actions' || tab === 'logs') {
      setTab(tab);
      return;
    }

    const action = target.closest('[data-action]')?.getAttribute('data-action');
    if (!action) return;
    event.preventDefault();
    void handleAction(action);
  });

  document.body.appendChild(root);
  console.info(`${LOG_PREFIX} [DIAG] ensureToolbar: root appended to document.body`);
  watchBodyForRootRemoval();
  void refreshProjectSelect();
  bindImportFileInput();
  renderImportPreview();
  return root;
}

function bindImportFileInput(): void {
  if (importListenerBound) return;
  const input = document.getElementById('gpt-organizer-import-file');
  if (!(input instanceof HTMLInputElement)) return;
  importListenerBound = true;

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void handleImportFile(file);
  });
}

function renderImportPreview(): void {
  const preview = document.getElementById('gpt-organizer-import-preview');
  const actions = document.getElementById('gpt-organizer-import-actions');
  if (!(preview instanceof HTMLElement)) return;

  if (!pendingPlan) {
    preview.hidden = true;
    preview.textContent = '';
    if (actions) actions.hidden = true;
    return;
  }

  preview.hidden = false;
  preview.textContent = formatPlanPreview(pendingPlan);
  if (actions) actions.hidden = getActionableRows(pendingPlan).length === 0;
}

async function handleImportFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    pendingPlan = parseImportFile(text, file.name);
    savePendingPlan(pendingPlan);
    renderImportPreview();

    const s = summarizePlan(pendingPlan);
    appendLog({
      level: 'info',
      action: 'import',
      source: 'import-plan',
      reason: `Loaded plan file for review (not applied yet)`,
      message: `${s.actionable} actionable · delete ${s.delete}, move ${s.move}, remove ${s.removeFromProject}, rename ${s.rename}${s.projectNames.length ? ` · projects: ${s.projectNames.join(', ')}` : ''}`,
      detail: file.name,
      items: getActionableRows(pendingPlan).slice(0, 50).map((row) => ({
        id: row.id,
        action: row.action,
        notes: row.notes,
        targetGizmoId: row.targetGizmoId,
        newTitle: row.newTitle,
        ok: undefined,
      })),
    });
    renderLogs();
    setExpanded(true);
    setStatus(
      s.actionable ?
        `Plan loaded: ${s.actionable} actions — review and Apply`
      : `Plan loaded but no actionable rows`,
      s.actionable === 0,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog({ level: 'error', action: 'import', message, detail: file.name });
    renderLogs();
    setStatus(message, true);
  }
}

async function executePlanRowWithFallback(row: ImportPlanRow): Promise<void> {
  // True when this row has both a rename and a primary action (e.g. rename + move).
  // Used to prefix primary-action errors with "rename: ok" for clarity in logs.
  const renameAndAction = !!row.newTitle && row.action !== 'rename';

  // Rename step — no fallback, failure aborts the entire row.
  if (row.newTitle) {
    try {
      await api.renameConversation(row.id, row.newTitle);
    } catch (err) {
      throw new Error(`rename: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (row.action === 'rename') return;

  // Primary action — UI fallback for move only.
  const pfx = renameAndAction ? 'rename: ok · ' : '';
  try {
    await executePrimaryAction(row);
  } catch (firstErr) {
    if (row.action === 'move' && row.targetGizmoId) {
      try {
        await moveViaUi(row.id, row.targetGizmoId);
        return;
      } catch (uiErr) {
        throw new Error(
          `${pfx}move (api+ui): ${uiErr instanceof Error ? uiErr.message : String(uiErr)}`,
        );
      }
    }
    throw new Error(
      `${pfx}${row.action}: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}`,
    );
  }
}

type ProjectResolution = {
  resolvedRows: ImportPlanRow[];
  created: string[];
  failed: Map<string, string>;
};

async function resolveProjectNames(
  rows: ImportPlanRow[],
  onStatus: (msg: string) => void,
): Promise<ProjectResolution> {
  const distinctNames = [...new Set(rows.filter((r) => r.projectName).map((r) => r.projectName!))];
  if (!distinctNames.length) return { resolvedRows: rows, created: [], failed: new Map() };

  onStatus('Fetching project list…');
  let existing: GptProject[];
  try {
    existing = await api.fetchProjects();
  } catch (err) {
    // Fail closed: without the live project list we cannot distinguish existing from new.
    // Creating without verification risks duplicates — refuse all resolutions instead.
    const fetchErr = err instanceof Error ? err.message : String(err);
    console.warn(LOG_PREFIX, 'resolveProjectNames: fetchProjects failed — aborting to prevent duplicates', err);
    const failed = new Map<string, string>();
    for (const name of distinctNames) {
      failed.set(
        name.trim().toLowerCase(),
        `Cannot resolve project "${name}": project list unavailable (${fetchErr})`,
      );
    }
    return { resolvedRows: rows, created: [], failed };
  }

  const nameToId = new Map<string, string>();
  for (const p of existing) {
    const normalized = normalizeGizmoId(p.id) ?? p.id;
    nameToId.set(p.title.trim().toLowerCase(), normalized);
  }

  const created: string[] = [];
  const failed = new Map<string, string>();

  for (const name of distinctNames) {
    const key = name.trim().toLowerCase();
    if (nameToId.has(key)) continue;

    onStatus(`Creating project "${name}"…`);
    try {
      const rawId = await api.createProject(name.trim());
      const id = normalizeGizmoId(rawId) ?? rawId;
      nameToId.set(key, id);
      created.push(name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.set(key, msg);
      console.warn(LOG_PREFIX, `resolveProjectNames: failed to create "${name}":`, msg);
    }
    await api.sleep(DELETE_DELAY_MS);
  }

  const resolvedRows = rows.map((row) => {
    if (!row.projectName) return row;
    const key = row.projectName.trim().toLowerCase();
    const id = nameToId.get(key);
    if (!id) return row;
    return { ...row, targetGizmoId: id };
  });

  return { resolvedRows, created, failed };
}

async function applyPendingPlan(): Promise<void> {
  if (!pendingPlan) {
    setStatus('No plan loaded', true);
    return;
  }

  const actionable = getActionableRows(pendingPlan);
  if (!actionable.length) {
    setStatus('Plan has no actionable rows', true);
    return;
  }

  const s = summarizePlan(pendingPlan);

  let confirmMsg = `Apply import plan?\n\nDelete: ${s.delete}\nMove: ${s.move}\nRemove from project: ${s.removeFromProject}\nRename: ${s.rename}`;
  if (s.projectNames.length) {
    confirmMsg += `\nProjects (create if missing): ${s.projectNames.map((n) => `"${n}"`).join(', ')}`;
  }
  confirmMsg += `\n\nConversations affected: ${s.actionable}. This cannot be undone from the extension.`;

  const confirmed = window.confirm(confirmMsg);
  if (!confirmed) return;

  busy = true;
  applyRootDataset();

  // Resolve project names → IDs, creating missing projects as needed.
  let resolvedRows = actionable;
  const failedProjects = new Map<string, string>();

  if (s.projectNames.length) {
    const resolution = await resolveProjectNames(actionable, setStatus);
    resolvedRows = resolution.resolvedRows;
    for (const [key, errMsg] of resolution.failed) {
      failedProjects.set(key, errMsg);
    }
    if (resolution.created.length) {
      appendLog({
        level: 'info',
        action: 'create-project',
        source: 'import-plan',
        reason: 'New projects created during plan execution',
        message: `Created: ${resolution.created.join(', ')}`,
      });
      renderLogs();
      void refreshProjectSelect();
    }
  }

  setStatus(`Applying 0 / ${resolvedRows.length}…`);
  const planFileName = pendingPlan?.fileName;
  const titlesBefore = conversationTitleMap(resolvedRows.map((r) => r.id));
  const results: BatchResult[] = [];

  for (let i = 0; i < resolvedRows.length; i += 1) {
    const row = resolvedRows[i];

    // Row still has projectName but no targetGizmoId → project creation failed.
    if (row.projectName && !row.targetGizmoId) {
      const key = row.projectName.trim().toLowerCase();
      const errMsg = failedProjects.get(key) ?? `Project "${row.projectName}" could not be resolved`;
      console.warn(LOG_PREFIX, errMsg);
      results.push({ id: row.id, ok: false, error: errMsg });
      setStatus(`Applying ${i + 1} / ${resolvedRows.length}…`);
      if (i < resolvedRows.length - 1) await api.sleep(DELETE_DELAY_MS);
      continue;
    }

    try {
      await executePlanRowWithFallback(row);
      results.push({ id: row.id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(LOG_PREFIX, message);
      results.push({ id: row.id, ok: false, error: message });
    }
    setStatus(`Applying ${i + 1} / ${resolvedRows.length}…`);
    if (i < resolvedRows.length - 1) await api.sleep(DELETE_DELAY_MS);
  }

  logBatch(
    'import-plan',
    results,
    {
      source: 'import-plan',
      reason: planFileName ?
        `Applied CSV/JSON plan (${planFileName})`
      : 'Applied imported plan',
      planRows: actionable,
    },
    'success',
    titlesBefore,
  );
  pendingPlan = null;
  savePendingPlan(null);
  renderImportPreview();

  busy = false;
  applyRootDataset();
  syncCheckboxes();
  updateCount();

  const failed = results.filter((r) => !r.ok);
  setStatus(
    failed.length ?
      `Plan applied: ${results.length - failed.length} ok, ${failed.length} failed`
    : `Plan applied: ${results.length} operations`,
    failed.length > 0,
  );
}

function dismissPendingPlan(): void {
  pendingPlan = null;
  savePendingPlan(null);
  renderImportPreview();
  setStatus('Import plan dismissed');
  appendLog({
    level: 'info',
    action: 'import',
    source: 'import-plan',
    reason: 'User dismissed pending plan without applying',
    message: 'Plan dismissed',
  });
  renderLogs();
}

async function refreshProjectSelect(): Promise<void> {
  const select = document.getElementById('gpt-organizer-project-select');
  if (!(select instanceof HTMLSelectElement)) return;

  select.disabled = true;
  select.innerHTML = '<option value="">Loading projects…</option>';

  let projects = findProjectsInSidebar().map((p) => ({
    id: normalizeGizmoId(p.id) ?? p.id,
    title: p.title,
  }));

  try {
    const apiProjects = await api.fetchProjects();
    const merged = new Map(projects.map((p) => [p.id, p.title]));
    for (const p of apiProjects) {
      merged.set(normalizeGizmoId(p.id) ?? p.id, p.title);
    }
    projects = [...merged.entries()].map(([id, title]) => ({ id, title }));
  } catch (err) {
    console.warn(`${LOG_PREFIX} API project list failed, using sidebar only`, err);
  }

  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose project…';
  select.appendChild(placeholder);

  for (const p of projects.sort((a, b) => a.title.localeCompare(b.title))) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title;
    select.appendChild(opt);
  }

  select.disabled = false;
}

function normalizeText(text: string | null | undefined): string {
  return (text || '').trim().toLowerCase();
}

async function moveViaUi(conversationId: string, projectId: string): Promise<void> {
  const button = findOptionsButton(conversationId);
  if (!button) throw new Error('Options button not found');

  (button as HTMLElement).click();
  await api.sleep(200);

  const moveEntry = findOpenMenuItem(MOVE_MENU_LABELS);
  if (!moveEntry) throw new Error('Move-to-project menu entry not found');
  moveEntry.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await api.sleep(200);

  const select = document.getElementById('gpt-organizer-project-select');
  const projectTitle =
    select instanceof HTMLSelectElement ?
      normalizeText(select.selectedOptions[0]?.textContent)
    : '';

  const projectItem = [
    ...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'),
  ].find((el) => {
    const label = normalizeText(el.textContent);
    if (projectTitle && label.includes(projectTitle)) return true;
    return label.includes(projectId.toLowerCase());
  });

  if (!projectItem) throw new Error('Target project not found in menu');
  projectItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await api.sleep(150);
}

async function removeFromProjectViaUi(conversationId: string): Promise<void> {
  const button = findOptionsButton(conversationId);
  if (!button) throw new Error('Options button not found');

  (button as HTMLElement).click();
  await api.sleep(200);

  const entry = findOpenMenuItem(REMOVE_FROM_PROJECT_LABELS);
  if (!entry) throw new Error('Remove-from-project menu entry not found');
  entry.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await api.sleep(150);
}

async function exportMetadata(format: 'json' | 'csv'): Promise<void> {
  const ids = [...selection.selected];
  if (!ids.length) {
    setStatus('Select conversations first', true);
    return;
  }

  busy = true;
  applyRootDataset();
  setStatus('Fetching metadata…');

  const visibleMap = new Map(
    findVisibleConversations()
      .filter((c) => selection.selected.has(c.id))
      .map((c) => [c.id, c]),
  );

  let apiMap: Map<string, ConversationMetadata>;
  try {
    apiMap = await fetchApiMetadataForIds(new Set(ids));
  } catch {
    apiMap = new Map();
  }

  const rows: ConversationMetadata[] = ids.map((id) => {
    const row = visibleMap.get(id);
    const sidebar = row ?
      metadataFromSidebarRow(row)
    : { id, title: id, href: `/c/${id}`, projectGizmoId: null, unread: false };
    const apiMeta = apiMap.get(id);
    return apiMeta ? { ...sidebar, ...apiMeta } : sidebar;
  });

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    downloadJson(`gpt-organizer-${stamp}.json`, {
      exportedAt: new Date().toISOString(),
      count: rows.length,
      conversations: rows,
    });
  } else {
    downloadCsv(`gpt-organizer-${stamp}.csv`, metadataToCsv(rows));
  }

  appendLog({
    level: 'info',
    action: 'export',
    source: 'manual',
    reason: `User exported ${format.toUpperCase()} for sidebar selection`,
    message: `Exported ${rows.length} row(s) as ${format.toUpperCase()}`,
    conversationIds: ids,
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      action: 'export',
      ok: true,
      notes: row.projectGizmoId ? `project: ${row.projectGizmoId}` : undefined,
    })),
  });
  renderLogs();

  busy = false;
  applyRootDataset();
  setStatus(`Exported ${rows.length} conversation(s) as ${format.toUpperCase()}`);
}

async function exportEnriched(): Promise<void> {
  const ids = [...selection.selected];
  if (!ids.length) {
    setStatus('Select conversations first', true);
    return;
  }

  busy = true;
  applyRootDataset();

  // Build a title map from visible sidebar rows for progress labels.
  const visibleTitles = new Map(
    findVisibleConversations()
      .filter((c) => selection.selected.has(c.id))
      .map((c) => [c.id, c.title]),
  );

  const lines: string[] = [];
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const title = visibleTitles.get(id) ?? id;
    setStatus(`Fetching ${i + 1}/${ids.length}: ${title.slice(0, 40)}`);

    try {
      const raw = await api.fetchConversationDetail(id);
      const record = buildExportRecord(raw, id, raw.title ?? title);
      lines.push(toJsonlLine(record));
      ok++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorLine: EnrichedExportLine = { id, title, error: errorMsg };
      lines.push(toJsonlLine(errorLine));
      failed++;
      console.warn(LOG_PREFIX, `exportEnriched: failed for ${id}:`, errorMsg);
    }

    if (i < ids.length - 1) await api.sleep(DELETE_DELAY_MS);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  downloadJsonl(`gpt-organizer-enriched-${stamp}.jsonl`, lines);

  appendLog({
    level: failed ? 'error' : 'success',
    action: 'export-enriched',
    source: 'manual',
    reason: `User exported enriched JSONL for sidebar selection`,
    message: `${ok} exported${failed ? `, ${failed} failed` : ''}`,
    conversationIds: ids,
  });
  renderLogs();

  busy = false;
  applyRootDataset();
  setStatus(
    failed
      ? `Exported ${ok} conversation(s) — ${failed} error(s), see JSONL`
      : `Exported ${ok} conversation(s) as enriched JSONL`,
  );
}

type DiscoveredConversation = {
  id: string;
  title: string;
  gizmoId: string | null;
  projectName: string | null;
  source: 'no_project' | 'project';
};

type DiscoveryResult = {
  conversations: DiscoveredConversation[];
  failedProjects: Array<{ title: string; id: string; error: string }>;
};

async function discoverAllConversations(
  onStatus: (msg: string) => void,
): Promise<DiscoveryResult> {
  const map = new Map<string, DiscoveredConversation>();
  const failedProjects: Array<{ title: string; id: string; error: string }> = [];
  const mainLimit = 28;
  const projectLimit = 5;

  // Phase 1 — Main conversation list (includes conversations with gizmo_id set).
  onStatus('Discovering conversations (main list)…');
  {
    let offset = 0;
    let pageNum = 0;
    const maxPages = 5000;
    while (pageNum < maxPages) {
      const page = await api.fetchConversationsPage(offset, mainLimit);
      for (const item of page.items) {
        if (!item.id) continue;
        map.set(item.id, {
          id: item.id,
          title: item.title ?? item.id,
          gizmoId: item.gizmo_id ?? null,
          projectName: null,
          source: item.gizmo_id ? 'project' : 'no_project',
        });
      }
      pageNum++;
      if (page.items.length === 0) break;
      if (typeof page.total === 'number' && offset + page.items.length >= page.total) break;
      offset += page.items.length;
      await api.sleep(DELETE_DELAY_MS);
    }
    console.info(`${LOG_PREFIX} Main conversations: ${map.size} discovered across ${pageNum} pages`);
  }

  // Phase 2 — Projects: resolve names + fetch their conversation lists.
  onStatus(`Found ${map.size} in main list — fetching projects…`);
  const projects = await api.fetchProjects();

  const projectNameById = new Map(
    projects.map((p) => [normalizeGizmoId(p.id) ?? p.id, p.title]),
  );

  // Backfill project names for conversations already discovered in Phase 1.
  for (const conv of map.values()) {
    if (conv.gizmoId) {
      const key = normalizeGizmoId(conv.gizmoId) ?? conv.gizmoId;
      conv.projectName = projectNameById.get(key) ?? null;
    }
  }

  // Phase 3 — Per-project conversation lists (catches conversations not in main list).
  for (const project of projects) {
    const pId = normalizeGizmoId(project.id) ?? project.id;
    onStatus(`Discovering project "${project.title}"…`);
    let cursor = '0';
    try {
      for (let pageNum = 0; pageNum < 200; pageNum++) {
        const result = await api.fetchProjectConversationsPage(pId, cursor, projectLimit);
        for (const item of result.items) {
          if (!item.id) continue;
          if (map.has(item.id)) {
            const existing = map.get(item.id)!;
            if (!existing.projectName) {
              existing.gizmoId = pId;
              existing.projectName = project.title;
              existing.source = 'project';
            }
          } else {
            map.set(item.id, {
              id: item.id,
              title: item.title ?? item.id,
              gizmoId: pId,
              projectName: project.title,
              source: 'project',
            });
          }
        }
        if (!result.nextCursor || result.nextCursor === cursor) break;
        cursor = result.nextCursor;
        await api.sleep(DELETE_DELAY_MS);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `${LOG_PREFIX} Phase 3: skipping project "${project.title}" (${pId}):`,
        errMsg,
      );
      failedProjects.push({ title: project.title, id: pId, error: errMsg });
    }
  }

  return { conversations: [...map.values()], failedProjects };
}

// Exponential backoff delays for rate-limit retries (ms). Capped at 60 s.
const RATE_LIMIT_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000];
const RATE_LIMIT_MAX_DELAY_MS = 60_000;
// Give up on a single conversation only after waiting 30 minutes total.
const RATE_LIMIT_MAX_WAIT_MS = 30 * 60 * 1_000;

async function fetchConversationDetailWithRetry(
  id: string,
  convIndex: number,
  total: number,
  title: string,
): Promise<api.RawConversation> {
  let attempt = 0;
  let totalWaitedMs = 0;

  while (true) {
    try {
      return await api.fetchConversationDetail(id);
    } catch (err) {
      if (!(err instanceof api.RateLimitError)) throw err;

      let delayMs: number;
      if (err.retryAfterMs > 0) {
        delayMs = err.retryAfterMs + 1_000; // honour Retry-After + 1 s margin
      } else {
        const base = RATE_LIMIT_BACKOFF_MS[Math.min(attempt, RATE_LIMIT_BACKOFF_MS.length - 1)];
        delayMs = Math.min(base + Math.random() * 2_000, RATE_LIMIT_MAX_DELAY_MS);
      }

      totalWaitedMs += delayMs;
      if (totalWaitedMs > RATE_LIMIT_MAX_WAIT_MS) {
        throw new Error(`Rate limit: gave up after 30 min on ${id}`);
      }

      const delaySec = Math.ceil(delayMs / 1_000);
      setStatus(
        `Rate limited at ${convIndex} / ${total} — retrying "${title.slice(0, 30)}" in ${delaySec}s`,
      );
      await api.sleep(delayMs);
      attempt++;
    }
  }
}

type ExportStartState = {
  checkpoint: ExportCheckpoint;
  convList: DiscoveredConversation[];
  resumeFrom: number;
  accumulatedLines: string[];
  okCount: number;
};

async function resolveExportStartState(): Promise<ExportStartState | null> {
  const existing = await loadExportCheckpoint();

  if (existing) {
    const completedCount = existing.completedIds.length;
    const totalCount = existing.conversations.length;
    const doResume = window.confirm(
      `Resume export: ${completedCount} / ${totalCount} already completed.\n\nOK = resume from where it stopped\nCancel = start fresh (existing progress will be lost)`,
    );
    if (doResume) {
      const done = new Set(existing.completedIds);
      let resumeFrom = existing.conversations.findIndex((c) => !done.has(c.id));
      if (resumeFrom === -1) resumeFrom = totalCount;
      setStatus(`Resuming export: ${completedCount} / ${totalCount} already completed`);
      await api.sleep(500);
      return {
        checkpoint: existing,
        convList: existing.conversations as DiscoveredConversation[],
        resumeFrom,
        accumulatedLines: [...existing.records],
        okCount: completedCount,
      };
    }
    await clearExportCheckpoint();
  }

  // Fresh discovery.
  let conversations: DiscoveredConversation[];
  let failedProjects: Array<{ title: string; id: string; error: string }>;
  try {
    ({ conversations, failedProjects } = await discoverAllConversations(setStatus));
  } catch (err) {
    setStatus(`Discovery failed: ${err instanceof Error ? err.message : String(err)}`, true);
    return null;
  }

  if (failedProjects.length > 0) {
    const names = failedProjects.map((p) => `"${p.title}" (${p.id})`).join(', ');
    const summary = `Discovery incomplete: ${failedProjects.length} project(s) failed — ${names}`;
    console.error(`${LOG_PREFIX} ${summary}`);
    for (const p of failedProjects) {
      console.error(`${LOG_PREFIX}   • "${p.title}" (${p.id}): ${p.error}`);
    }
    setStatus(summary, true);
    return null;
  }

  const checkpoint: ExportCheckpoint = {
    version: 1,
    startedAt: new Date().toISOString(),
    conversations,
    completedIds: [],
    records: [],
  };
  await saveExportCheckpoint(checkpoint);

  setStatus(`Found ${conversations.length} conversations — exporting…`);
  await api.sleep(200);

  return { checkpoint, convList: conversations, resumeFrom: 0, accumulatedLines: [], okCount: 0 };
}

async function exportAllEnriched(): Promise<void> {
  busy = true;
  applyRootDataset();

  const state = await resolveExportStartState();
  if (!state) {
    busy = false;
    applyRootDataset();
    return;
  }

  const { checkpoint, convList, resumeFrom, accumulatedLines } = state;
  let okCount = state.okCount;
  let failedCount = 0;
  const total = convList.length;

  for (let i = resumeFrom; i < total; i++) {
    const conv = convList[i];
    setStatus(`Exporting ${i + 1} / ${total}: ${conv.title.slice(0, 40)}`);

    let line: string;
    try {
      const raw = await fetchConversationDetailWithRetry(conv.id, i + 1, total, conv.title);
      const record = buildExportRecord(raw, conv.id, raw.title ?? conv.title);
      line = JSON.stringify({
        ...record,
        project_gizmo_id: conv.gizmoId,
        project_name: conv.projectName,
        source: conv.source,
      });
      okCount++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorRecord: EnrichedExportLine = { id: conv.id, title: conv.title, error: errorMsg };
      line = JSON.stringify(errorRecord);
      failedCount++;
      console.warn(LOG_PREFIX, `exportAllEnriched: non-retryable failure for ${conv.id}:`, errorMsg);
    }

    accumulatedLines.push(line);
    checkpoint.completedIds.push(conv.id);
    checkpoint.records.push(line);
    await saveExportCheckpoint(checkpoint);

    if (i < total - 1) await api.sleep(1_000);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  downloadJsonl(`gpt-organizer-all-enriched-${stamp}.jsonl`, accumulatedLines);
  await clearExportCheckpoint();

  appendLog({
    level: failedCount ? 'error' : 'success',
    action: 'export-all-enriched',
    source: 'manual',
    reason: 'User exported all conversations (enriched JSONL, no selection required)',
    message: `${okCount} exported${failedCount ? `, ${failedCount} failed` : ''} — ${total} total`,
  });
  renderLogs();

  busy = false;
  applyRootDataset();
  setStatus(
    failedCount
      ? `All enriched: ${okCount} ok, ${failedCount} errors — see JSONL`
      : `All enriched: exported ${okCount} conversations`,
  );
}

async function moveSelected(): Promise<void> {
  const select = document.getElementById('gpt-organizer-project-select');
  if (!(select instanceof HTMLSelectElement) || !select.value) {
    setStatus('Pick a project first', true);
    return;
  }

  const projectId = select.value;
  const ids = [...selection.selected];
  if (!ids.length) {
    setStatus('No conversations selected', true);
    return;
  }

  busy = true;
  updateCount();
  setStatus(`Moving 0 / ${ids.length}…`);

  const titlesBefore = conversationTitleMap(ids);
  const results = await api.runBatch(
    ids,
    async (id) => {
      try {
        await api.setConversationGizmo(id, projectId);
      } catch {
        await moveViaUi(id, projectId);
      }
    },
    (done, total) => setStatus(`Moving ${done} / ${total}…`),
  );

  const projectLabel =
    select.selectedOptions[0]?.textContent?.trim() || projectId;
  logBatch('move', results, {
    source: 'manual',
    reason: 'User moved selected chats via organizer panel',
    target: projectLabel,
    defaultAction: 'move',
    targetGizmoId: projectId,
  }, 'success', titlesBefore);
  busy = false;
  updateCount();
  selection.clear();
  syncCheckboxes();
  const failed = results.filter((r) => !r.ok);
  setStatus(
    failed.length ?
      `Moved ${results.length - failed.length}, failed ${failed.length}`
    : `Moved ${results.length} conversation(s)`,
    failed.length > 0,
  );
}

async function removeSelectedFromProject(): Promise<void> {
  const ids = [...selection.selected];
  if (!ids.length) {
    setStatus('No conversations selected', true);
    return;
  }

  busy = true;
  updateCount();

  const titlesBefore = conversationTitleMap(ids);
  const results = await api.runBatch(
    ids,
    async (id) => {
      try {
        await api.setConversationGizmo(id, null);
      } catch {
        await removeFromProjectViaUi(id);
      }
    },
    (done, total) => setStatus(`Removing ${done} / ${total}…`),
  );

  logBatch('remove-from-project', results, {
    source: 'manual',
    reason: 'User removed selected chats from project (gizmo_id → null)',
    defaultAction: 'remove-from-project',
  }, 'success', titlesBefore);
  busy = false;
  updateCount();
  selection.clear();
  syncCheckboxes();
  const failed = results.filter((r) => !r.ok);
  setStatus(
    failed.length ?
      `Removed ${results.length - failed.length}, failed ${failed.length}`
    : `Removed ${results.length} from project`,
    failed.length > 0,
  );
}

async function deleteSelected(): Promise<void> {
  const ids = [...selection.selected];
  if (!ids.length) {
    setStatus('No conversations selected', true);
    return;
  }

  const ok = window.confirm(
    `Delete ${ids.length} conversation(s)? This uses ChatGPT soft-delete (same as the ⋯ menu).`,
  );
  if (!ok) return;

  busy = true;
  updateCount();

  const titlesBefore = conversationTitleMap(ids);
  const results = await api.runBatch(
    ids,
    (id) => api.deleteConversation(id),
    (done, total) => setStatus(`Deleting ${done} / ${total}…`),
  );

  logBatch('delete', results, {
    source: 'manual',
    reason: 'User confirmed batch delete in organizer (PATCH is_visible: false)',
    defaultAction: 'delete',
  }, 'success', titlesBefore);
  busy = false;
  selection.clear();
  syncCheckboxes();
  updateCount();
  const failed = results.filter((r) => !r.ok);
  setStatus(
    failed.length ?
      `Deleted ${results.length - failed.length}, failed ${failed.length}`
    : `Deleted ${results.length} conversation(s)`,
    failed.length > 0,
  );
}

async function handleAction(action: string): Promise<void> {
  if (
    busy &&
    action !== 'minimize' &&
    action !== 'expand' &&
    action !== 'dismiss-plan'
  ) {
    return;
  }

  switch (action) {
    case 'expand':
      setExpanded(true);
      break;
    case 'minimize':
      setExpanded(false);
      break;
    case 'select-all':
      selection.selectAllVisible();
      setStatus(`Selected ${selection.selected.size}`);
      break;
    case 'clear':
      selection.clear();
      setStatus('Selection cleared');
      break;
    case 'pause':
      ui.enabled = !ui.enabled;
      if (ui.enabled) {
        syncCheckboxes();
        setStatus('Checkboxes on');
        appendLog({ level: 'info', action: 'pause', message: 'Checkboxes enabled' });
      } else {
        removeCheckboxArtifacts();
        setStatus('Checkboxes paused');
        appendLog({ level: 'info', action: 'pause', message: 'Checkboxes paused' });
      }
      updateCount();
      renderLogs();
      break;
    case 'move':
      await moveSelected();
      break;
    case 'remove-project':
      await removeSelectedFromProject();
      break;
    case 'delete':
      await deleteSelected();
      break;
    case 'export-json':
      await exportMetadata('json');
      break;
    case 'export-csv':
      await exportMetadata('csv');
      break;
    case 'export-enriched':
      await exportEnriched();
      break;
    case 'export-all-enriched':
      await exportAllEnriched();
      break;
    case 'apply-plan':
      await applyPendingPlan();
      break;
    case 'dismiss-plan':
      dismissPendingPlan();
      break;
    case 'clear-logs':
      clearLogs();
      renderLogs();
      setStatus('Logs cleared');
      break;
    case 'export-logs':
      downloadJson(`gpt-organizer-logs-${Date.now()}.json`, {
        exportedAt: new Date().toISOString(),
        entries: getLogs(),
      });
      setStatus('Logs exported');
      break;
    default:
      break;
  }
}

export function mount(): void {
  console.info(`${LOG_PREFIX} [DIAG] mount() called`);
  ui = loadUiState();
  selection.clear();

  ensureToolbar();
  setTab(ui.activeTab);
  applyRootDataset();

  if (ui.enabled) syncCheckboxes();
  else removeCheckboxArtifacts();

  updateCount();
  renderLogs();
  renderImportPreview();

  if (pendingPlan) {
    const s = summarizePlan(pendingPlan);
    appendLog({
      level: 'info',
      action: 'import',
      source: 'import-plan',
      reason: 'Pending plan restored from localStorage after reload',
      message: `${s.actionable} actionable waiting for Apply`,
      detail: pendingPlan.fileName,
    });
  }

  appendLog({
    level: 'info',
    action: 'init',
    message: 'GPT Organizer loaded',
  });
}

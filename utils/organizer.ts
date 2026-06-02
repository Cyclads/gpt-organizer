import * as api from './api';
import {
  LOG_PREFIX,
  MOVE_MENU_LABELS,
  REMOVE_FROM_PROJECT_LABELS,
  ROOT_ID,
  STORAGE_KEY,
} from './constants';
import {
  findOpenMenuItem,
  findOptionsButton,
  findProjectsInSidebar,
  findVisibleConversations,
  normalizeGizmoId,
} from './dom';

const selected = new Set<string>();
let organizerEnabled = true;
let busy = false;
const checkboxById = new Map<string, HTMLInputElement>();

function loadState(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { selected?: string[]; enabled?: boolean };
    if (Array.isArray(data.selected)) {
      selected.clear();
      for (const id of data.selected) {
        if (typeof id === 'string') selected.add(id);
      }
    }
    if (typeof data.enabled === 'boolean') organizerEnabled = data.enabled;
  } catch {
    selected.clear();
  }
}

function saveState(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ selected: [...selected], enabled: organizerEnabled }),
    );
  } catch {
    /* quota */
  }
}

function setStatus(text: string, isError = false): void {
  const el = document.getElementById('gpt-organizer-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.error = isError ? 'true' : 'false';
}

function updateCount(): void {
  const countEl = document.getElementById('gpt-organizer-count');
  if (countEl) countEl.textContent = String(selected.size);
  const root = document.getElementById(ROOT_ID);
  if (root) {
    root.dataset.active = organizerEnabled ? 'true' : 'false';
    root.dataset.busy = busy ? 'true' : 'false';
  }
  saveState();
}

function toggleSelection(id: string, checked: boolean): void {
  if (checked) selected.add(id);
  else selected.delete(id);
  updateCount();
}

function clearSelection(): void {
  selected.clear();
  for (const input of checkboxById.values()) input.checked = false;
  updateCount();
}

function selectAllVisible(): void {
  for (const conv of findVisibleConversations()) {
    ensureCheckbox(conv);
    selected.add(conv.id);
    const box = checkboxById.get(conv.id);
    if (box) box.checked = true;
  }
  updateCount();
}

function ensureCheckbox(conv: ReturnType<typeof findVisibleConversations>[0]): void {
  const anchor = conv.element;
  if (!anchor) return;

  const existing = checkboxById.get(conv.id);
  if (existing) {
    existing.checked = selected.has(conv.id);
    return;
  }

  const wrap = document.createElement('label');
  wrap.className = 'gpt-organizer-checkbox-wrap';
  wrap.title = conv.title;
  wrap.dataset.conversationId = conv.id;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'gpt-organizer-checkbox';
  input.checked = selected.has(conv.id);
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('change', () => toggleSelection(conv.id, input.checked));
  wrap.appendChild(input);

  const row = anchor.querySelector('.flex.min-w-0.grow') ?? anchor.firstElementChild;
  if (row?.parentElement === anchor) anchor.insertBefore(wrap, row);
  else anchor.prepend(wrap);

  checkboxById.set(conv.id, input);
}

export function syncCheckboxes(): void {
  if (!organizerEnabled) return;

  const convs = findVisibleConversations();
  const visibleIds = new Set(convs.map((c) => c.id));

  for (const conv of convs) ensureCheckbox(conv);

  for (const [id, input] of checkboxById.entries()) {
    if (!visibleIds.has(id)) {
      input.closest('.gpt-organizer-checkbox-wrap')?.remove();
      checkboxById.delete(id);
    }
  }

  updateCount();
}

function removeCheckboxArtifacts(): void {
  document.querySelectorAll('.gpt-organizer-checkbox-wrap').forEach((el) => el.remove());
  checkboxById.clear();
}

function ensureToolbar(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
      <div class="gpt-organizer-panel">
        <div class="gpt-organizer-header">
          <strong>GPT Organizer</strong>
          <span class="gpt-organizer-badge" id="gpt-organizer-count">0</span>
        </div>
        <div class="gpt-organizer-actions">
          <button type="button" data-action="select-all">All visible</button>
          <button type="button" data-action="clear">Clear</button>
          <button type="button" data-action="toggle">Hide UI</button>
        </div>
        <label class="gpt-organizer-move">
          <span>Move to project</span>
          <select id="gpt-organizer-project-select">
            <option value="">— load projects —</option>
          </select>
        </label>
        <div class="gpt-organizer-actions gpt-organizer-actions-danger">
          <button type="button" data-action="move">Move selected</button>
          <button type="button" data-action="remove-project">Remove from project</button>
          <button type="button" data-action="delete" class="danger">Delete selected</button>
        </div>
        <p class="gpt-organizer-status" id="gpt-organizer-status">Ready</p>
      </div>
    `;

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    if (!action) return;
    event.preventDefault();
    void handleAction(action);
  });

  document.body.appendChild(root);
  void refreshProjectSelect();
  return root;
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
    select instanceof HTMLSelectElement
      ? normalizeText(select.selectedOptions[0]?.textContent)
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

async function moveSelected(): Promise<void> {
  const select = document.getElementById('gpt-organizer-project-select');
  if (!(select instanceof HTMLSelectElement) || !select.value) {
    setStatus('Pick a project first', true);
    return;
  }

  const projectId = select.value;
  const ids = [...selected];
  if (!ids.length) {
    setStatus('No conversations selected', true);
    return;
  }

  busy = true;
  updateCount();
  setStatus(`Moving 0 / ${ids.length}…`);

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

  const failed = results.filter((r) => !r.ok);
  busy = false;
  updateCount();
  clearSelection();
  syncCheckboxes();
  setStatus(
    failed.length
      ? `Moved ${results.length - failed.length}, failed ${failed.length}`
      : `Moved ${results.length} conversation(s)`,
    failed.length > 0,
  );
}

async function removeSelectedFromProject(): Promise<void> {
  const ids = [...selected];
  if (!ids.length) {
    setStatus('No conversations selected', true);
    return;
  }

  busy = true;
  updateCount();

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

  busy = false;
  const failed = results.filter((r) => !r.ok);
  updateCount();
  clearSelection();
  syncCheckboxes();
  setStatus(
    failed.length
      ? `Removed ${results.length - failed.length}, failed ${failed.length}`
      : `Removed ${results.length} from project`,
    failed.length > 0,
  );
}

async function deleteSelected(): Promise<void> {
  const ids = [...selected];
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

  const results = await api.runBatch(
    ids,
    (id) => api.deleteConversation(id),
    (done, total) => setStatus(`Deleting ${done} / ${total}…`),
  );

  busy = false;
  const failed = results.filter((r) => !r.ok);
  clearSelection();
  syncCheckboxes();
  updateCount();
  setStatus(
    failed.length
      ? `Deleted ${results.length - failed.length}, failed ${failed.length}`
      : `Deleted ${results.length} conversation(s)`,
    failed.length > 0,
  );
}

async function handleAction(action: string): Promise<void> {
  if (busy) return;

  switch (action) {
    case 'select-all':
      selectAllVisible();
      setStatus(`Selected ${selected.size}`);
      break;
    case 'clear':
      clearSelection();
      setStatus('Selection cleared');
      break;
    case 'toggle':
      organizerEnabled = !organizerEnabled;
      if (organizerEnabled) {
        syncCheckboxes();
        setStatus('Organizer visible');
      } else {
        removeCheckboxArtifacts();
        setStatus('Organizer hidden');
      }
      updateCount();
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
    default:
      break;
  }
}

export function mount(): void {
  loadState();
  ensureToolbar();
  if (organizerEnabled) syncCheckboxes();
  updateCount();
}

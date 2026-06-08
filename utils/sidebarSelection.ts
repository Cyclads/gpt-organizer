import { findVisibleConversations } from './dom';
import type { ConversationRow } from './types';

const WRAP_CLASS = 'gpt-organizer-checkbox-wrap';
const INPUT_CLASS = 'gpt-organizer-checkbox';
const ID_ATTR = 'data-conversation-id';

/**
 * Sidebar checkbox selection. State lives in `selected` only; inputs mirror it.
 */
export class SidebarSelection {
  readonly selected = new Set<string>();
  private rangeAnchorId: string | null = null;
  private readonly checkboxById = new Map<string, HTMLInputElement>();
  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  clear(): void {
    this.selected.clear();
    this.rangeAnchorId = null;
    this.applyAllVisuals();
    this.onChange();
  }

  selectAllVisible(): void {
    const convs = findVisibleConversations();
    for (const conv of convs) {
      this.selected.add(conv.id);
    }
    this.rangeAnchorId = convs[0]?.id ?? null;
    this.sync(true);
    this.onChange();
  }

  sync(enabled: boolean): void {
    if (!enabled) {
      this.removeAllCheckboxDom();
      return;
    }

    for (const [id, input] of this.checkboxById.entries()) {
      if (!input.isConnected) this.checkboxById.delete(id);
    }

    const convs = findVisibleConversations();
    const visibleIds = new Set(convs.map((c) => c.id));

    for (const conv of convs) this.mountCheckbox(conv);

    for (const [id, input] of this.checkboxById.entries()) {
      if (visibleIds.has(id)) continue;
      input.closest(`.${WRAP_CLASS}`)?.remove();
      this.checkboxById.delete(id);
    }

    this.applyAllVisuals();
  }

  removeAllCheckboxDom(): void {
    document.querySelectorAll(`.${WRAP_CLASS}`).forEach((el) => el.remove());
    this.checkboxById.clear();
  }

  private applyAllVisuals(): void {
    for (const [id, input] of this.checkboxById.entries()) {
      if (input.isConnected) input.checked = this.selected.has(id);
    }
  }

  private findLiveWrap(conversationId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `.${WRAP_CLASS}[${ID_ATTR}="${CSS.escape(conversationId)}"]`,
    );
  }

  private isMounted(conversationId: string, input: HTMLInputElement): boolean {
    if (!input.isConnected) return false;
    const wrap = input.closest(`.${WRAP_CLASS}`);
    if (wrap?.getAttribute(ID_ATTR) !== conversationId) return false;
    // Row must still be a live sidebar conversation link (React may replace the <a>)
    return findVisibleConversations().some(
      (c) => c.id === conversationId && c.element.contains(wrap),
    );
  }

  private mountCheckbox(conv: ConversationRow): void {
    const existing = this.checkboxById.get(conv.id);
    if (existing && this.isMounted(conv.id, existing)) {
      existing.checked = this.selected.has(conv.id);
      return;
    }

    existing?.closest(`.${WRAP_CLASS}`)?.remove();
    this.checkboxById.delete(conv.id);

    const wrap = document.createElement('div');
    wrap.className = WRAP_CLASS;
    wrap.title = conv.title;
    wrap.setAttribute(ID_ATTR, conv.id);
    wrap.setAttribute('role', 'presentation');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = INPUT_CLASS;
    input.checked = this.selected.has(conv.id);
    input.tabIndex = -1;
    input.setAttribute('aria-label', `Select ${conv.title}`);
    wrap.appendChild(input);

    const activate = (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.onRowActivate(conv.id, event);
    };

    // Capture: run before the sidebar <a> link handles the click
    wrap.addEventListener('click', activate, true);

    const row = conv.element.querySelector('.flex.min-w-0.grow') ?? conv.element.firstElementChild;
    if (row?.parentElement === conv.element) conv.element.insertBefore(wrap, row);
    else conv.element.prepend(wrap);

    this.checkboxById.set(conv.id, input);
  }

  private onRowActivate(conversationId: string, event: MouseEvent): void {
    if (event.shiftKey && this.rangeAnchorId) {
      const targetChecked = !this.selected.has(conversationId);
      this.applyRangeInclusive(this.rangeAnchorId, conversationId, targetChecked);
      this.rangeAnchorId = conversationId;
    } else {
      if (this.selected.has(conversationId)) this.selected.delete(conversationId);
      else this.selected.add(conversationId);
      this.rangeAnchorId = conversationId;
    }

    this.applyAllVisuals();
    this.onChange();
  }

  /** All visible rows from anchor through endpoint (inclusive), in sidebar order. */
  private applyRangeInclusive(fromId: string, toId: string, checked: boolean): void {
    const order = findVisibleConversations().map((c) => c.id);
    const startIdx = order.indexOf(fromId);
    const endIdx = order.indexOf(toId);

    const ids = new Set<string>();
    if (startIdx !== -1 && endIdx !== -1) {
      const lo = Math.min(startIdx, endIdx);
      const hi = Math.max(startIdx, endIdx);
      for (let i = lo; i <= hi; i += 1) ids.add(order[i]);
    }

    // Always include endpoints even if index lookup failed (stale anchor)
    ids.add(fromId);
    ids.add(toId);

    for (const id of ids) {
      if (checked) this.selected.add(id);
      else this.selected.delete(id);
    }
  }

  titleFor(id: string): string | undefined {
    for (const conv of findVisibleConversations()) {
      if (conv.id === id) return conv.title;
    }
    return this.findLiveWrap(id)?.getAttribute('title')?.trim() || undefined;
  }

  titleMap(ids: string[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const id of ids) {
      const title = this.titleFor(id);
      if (title) map.set(id, title);
    }
    return map;
  }
}

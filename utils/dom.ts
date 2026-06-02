import { SELECTORS } from './selectors';
import type { ConversationRow } from './types';

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractConversationId(href: string | null): string | null {
  if (!href) return null;
  const match = href.match(/\/c\/([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

/** Sidebar URLs may include slug; PATCH uses short `g-p-{hex}` id. */
export function normalizeGizmoId(gizmoId: string | null | undefined): string | null | undefined {
  if (!gizmoId || typeof gizmoId !== 'string') return gizmoId;
  const trimmed = gizmoId.trim();
  const match = trimmed.match(/^g-p-([a-f0-9]+)(?:-.+)?$/i);
  return match ? `g-p-${match[1]}` : trimmed;
}

export function extractGizmoIdFromProjectHref(href: string | null): string | null {
  if (!href) return null;
  const match = href.match(/^\/g\/(g-p-[^/]+)\/project$/i);
  return match ? (normalizeGizmoId(match[1]) ?? null) : null;
}

export function parseConversationLink(anchor: Element): ConversationRow | null {
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (!anchor.matches(SELECTORS.conversationLink)) return null;

  let id = extractConversationId(anchor.getAttribute('href'));
  if (!id) {
    const trigger = anchor.querySelector(SELECTORS.optionsButton);
    id = trigger?.getAttribute('data-conversation-options-trigger') ?? null;
  }
  if (!id || !UUID_RE.test(id)) return null;

  const title =
    anchor.getAttribute('aria-label')?.trim() ||
    anchor.querySelector('.truncate span')?.textContent?.trim() ||
    anchor.textContent?.trim() ||
    id;

  return { id, title, element: anchor };
}

export function findVisibleConversations(root: ParentNode = document): ConversationRow[] {
  const links = root.querySelectorAll(SELECTORS.conversationLink);
  const byId = new Map<string, ConversationRow>();

  for (const link of links) {
    const parsed = parseConversationLink(link);
    if (parsed) byId.set(parsed.id, parsed);
  }

  return [...byId.values()];
}

export function findProjectsInSidebar(
  root: ParentNode = document,
): Array<{ id: string; title: string }> {
  const links = root.querySelectorAll(SELECTORS.projectLink);
  const projects: Array<{ id: string; title: string }> = [];

  for (const link of links) {
    if (!(link instanceof HTMLAnchorElement)) continue;
    const id = extractGizmoIdFromProjectHref(link.getAttribute('href'));
    if (!id) continue;
    const title =
      link.getAttribute('aria-label')?.trim() ||
      link.querySelector('.truncate span')?.textContent?.trim() ||
      link.textContent?.trim() ||
      id;
    projects.push({ id, title });
  }

  return projects;
}

export function findSidebarContainer(): Element | null {
  const projectMarker = document.querySelector('[data-testid="sidebar-item-projects"]');
  if (projectMarker) {
    const nav = projectMarker.closest('nav');
    if (nav) return nav;
  }

  const firstConv = document.querySelector(SELECTORS.conversationLink);
  if (firstConv) {
    const nav = firstConv.closest('nav');
    if (nav) return nav;
    return firstConv.closest('aside') ?? firstConv.parentElement;
  }

  return document.querySelector('nav');
}

export function findOptionsButton(conversationId: string): Element | null {
  return document.querySelector(
    `[data-conversation-options-trigger="${conversationId}"]`,
  );
}

function normalizeLabel(text: string | null | undefined): string {
  return (text || '').trim().toLowerCase();
}

export function findOpenMenuItem(labelHints: readonly string[]): Element | null {
  const menus = document.querySelectorAll('[role="menu"]');
  for (const menu of menus) {
    const items = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
    for (const item of items) {
      const label = normalizeLabel(item.textContent);
      if (labelHints.some((hint) => label.includes(hint))) return item;
    }
  }
  return null;
}

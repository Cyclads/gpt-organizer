import { findSidebarContainer } from './dom';
import { SELECTORS } from './selectors';

export type SidebarObserverOptions = {
  onSync: () => void;
  isOrganizerNode: (node: Node) => boolean;
  debounceMs?: number;
  followUpMs?: number;
};

function nodeTouchesSidebar(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return (
    node.matches(SELECTORS.conversationLink) ||
    node.querySelector(SELECTORS.conversationLink) != null ||
    node.closest('nav, aside') != null
  );
}

function isRelevantMutation(m: MutationRecord, isOrganizerNode: (n: Node) => boolean): boolean {
  if (isOrganizerNode(m.target)) return false;

  if (m.type === 'attributes') {
    return (
      m.attributeName === 'href' ||
      m.attributeName === 'data-conversation-options-trigger'
    );
  }

  if (m.type === 'childList') {
    const nodes = [...m.addedNodes, ...m.removedNodes];
    return nodes.some((n) => !isOrganizerNode(n) && nodeTouchesSidebar(n));
  }

  return false;
}

/** Watch sidebar / SPA navigations and call onSync when the list may have re-rendered. */
export function startSidebarObserver(options: SidebarObserverOptions): () => void {
  const { onSync, isOrganizerNode, debounceMs = 120, followUpMs = 400 } = options;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let followUpTimer: ReturnType<typeof setTimeout> | undefined;
  let observedRoot: Element | null = null;
  let subtreeObserver: MutationObserver | null = null;

  const runSync = () => {
    attachToCurrentSidebar();
    onSync();
  };

  const scheduleSync = () => {
    clearTimeout(debounceTimer);
    clearTimeout(followUpTimer);
    debounceTimer = setTimeout(() => {
      runSync();
      followUpTimer = setTimeout(runSync, followUpMs);
    }, debounceMs);
  };

  const onMutations = (mutations: MutationRecord[]) => {
    if (mutations.some((m) => isRelevantMutation(m, isOrganizerNode))) {
      scheduleSync();
    }
  };

  const attachToCurrentSidebar = () => {
    const nextRoot = findSidebarContainer() ?? document.body;
    if (nextRoot === observedRoot && subtreeObserver) return;

    subtreeObserver?.disconnect();
    observedRoot = nextRoot;
    subtreeObserver = new MutationObserver(onMutations);
    subtreeObserver.observe(observedRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'data-conversation-options-trigger'],
    });
  };

  const patchPushState = () => {
    const original = history.pushState.bind(history);
    history.pushState = (data, unused, url) => {
      const result = original(data, unused, url);
      scheduleSync();
      return result;
    };
  };

  const patchReplaceState = () => {
    const original = history.replaceState.bind(history);
    history.replaceState = (data, unused, url) => {
      const result = original(data, unused, url);
      scheduleSync();
      return result;
    };
  };

  patchPushState();
  patchReplaceState();

  window.addEventListener('popstate', scheduleSync);
  window.addEventListener('hashchange', scheduleSync);

  attachToCurrentSidebar();
  scheduleSync();

  return () => {
    clearTimeout(debounceTimer);
    clearTimeout(followUpTimer);
    subtreeObserver?.disconnect();
    window.removeEventListener('popstate', scheduleSync);
    window.removeEventListener('hashchange', scheduleSync);
  };
}

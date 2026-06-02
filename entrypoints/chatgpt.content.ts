import '../assets/organizer.css';
import { LOG_PREFIX } from '../utils/constants';
import { findSidebarContainer } from '../utils/dom';
import { CHATGPT_MATCHES } from '../utils/chatgptHosts';
import { mount, syncCheckboxes } from '../utils/organizer';

const BOOTSTRAP_FLAG = '__gptOrganizerBootstrapped__';

export default defineContentScript({
  matches: [...CHATGPT_MATCHES],
  runAt: 'document_idle',
  main() {
    if ((window as unknown as Record<string, boolean>)[BOOTSTRAP_FLAG]) return;
    (window as unknown as Record<string, boolean>)[BOOTSTRAP_FLAG] = true;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleSync = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          syncCheckboxes();
        } catch (err) {
          console.warn(`${LOG_PREFIX} sync failed`, err);
        }
      }, 120);
    };

    const attachObserver = () => {
      const target = findSidebarContainer() ?? document.body;
      const observer = new MutationObserver((mutations) => {
        const relevant = mutations.some(
          (m) =>
            m.type === 'childList' ||
            (m.type === 'attributes' &&
              (m.attributeName === 'href' ||
                m.attributeName === 'aria-label' ||
                m.attributeName === 'data-conversation-options-trigger')),
        );
        if (relevant) scheduleSync();
      });

      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href', 'aria-label', 'data-conversation-options-trigger'],
      });
    };

    mount();
    attachObserver();
    scheduleSync();
    window.addEventListener('popstate', scheduleSync);
    window.addEventListener('hashchange', scheduleSync);
    console.info(`${LOG_PREFIX} loaded (local, unpublished)`);
  },
});

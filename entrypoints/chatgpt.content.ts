import '../assets/organizer.css';
import { LOG_PREFIX, ROOT_ID } from '../utils/constants';
import { CHATGPT_MATCHES } from '../utils/chatgptHosts';
import { mount, syncCheckboxes } from '../utils/organizer';
import { startSidebarObserver } from '../utils/sidebarObserver';

const BOOTSTRAP_FLAG = '__gptOrganizerBootstrapped__';
const CHECKBOX_WRAP_CLASS = 'gpt-organizer-checkbox-wrap';

function isOrganizerNode(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (node.id === ROOT_ID || node.closest(`#${ROOT_ID}`)) return true;
  return (
    node.classList.contains(CHECKBOX_WRAP_CLASS) ||
    node.closest(`.${CHECKBOX_WRAP_CLASS}`) != null
  );
}

export default defineContentScript({
  matches: [...CHATGPT_MATCHES],
  runAt: 'document_idle',
  main() {
    console.info(`${LOG_PREFIX} [DIAG] content script fired (document.readyState=${document.readyState})`);

    if ((window as unknown as Record<string, boolean>)[BOOTSTRAP_FLAG]) {
      console.warn(`${LOG_PREFIX} [DIAG] BOOTSTRAP_FLAG already set — skipping init`);
      return;
    }
    (window as unknown as Record<string, boolean>)[BOOTSTRAP_FLAG] = true;

    mount();
    startSidebarObserver({
      onSync: syncCheckboxes,
      isOrganizerNode,
    });

    // DIAG: watch for body reference change and root disappearing
    let lastBody = document.body;
    let rootWasPresent = !!document.getElementById(ROOT_ID);
    setInterval(() => {
      const bodyChanged = document.body !== lastBody;
      const rootNow = !!document.getElementById(ROOT_ID);
      if (bodyChanged) {
        console.warn(`${LOG_PREFIX} [DIAG] document.body reference CHANGED`, { old: lastBody, new: document.body });
        lastBody = document.body;
      }
      if (rootWasPresent && !rootNow) {
        console.error(`${LOG_PREFIX} [DIAG] gpt-organizer-root DISAPPEARED from DOM`);
      }
      if (!rootWasPresent && rootNow) {
        console.info(`${LOG_PREFIX} [DIAG] gpt-organizer-root RE-APPEARED in DOM`);
      }
      rootWasPresent = rootNow;
    }, 500);

    console.info(`${LOG_PREFIX} loaded (local, unpublished)`);
  },
});

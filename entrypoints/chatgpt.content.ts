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
    if ((window as unknown as Record<string, boolean>)[BOOTSTRAP_FLAG]) return;
    (window as unknown as Record<string, boolean>)[BOOTSTRAP_FLAG] = true;

    mount();
    startSidebarObserver({
      onSync: syncCheckboxes,
      isOrganizerNode,
    });

    console.info(`${LOG_PREFIX} loaded (local, unpublished)`);
  },
});

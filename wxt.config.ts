import { defineConfig } from 'wxt';
import { CHATGPT_HOST_PERMISSIONS } from './utils/chatgptHosts';

export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
    sizes: [128, 96, 48, 32, 16],
  },
  outDir: 'dist',
  manifest: {
    name: 'GPT Organizer (local)',
    description:
      'Private sidebar checkboxes for batch delete and move ChatGPT conversations to projects.',
    permissions: ['storage'],
    host_permissions: [...CHATGPT_HOST_PERMISSIONS],
  },
});

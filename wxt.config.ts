import { defineConfig } from 'wxt';
import { CHATGPT_HOST_PERMISSIONS } from './utils/chatgptHosts';

export default defineConfig({
  outDir: 'dist',
  manifest: {
    name: 'GPT Organizer (local)',
    description:
      'Private sidebar checkboxes for batch delete and move ChatGPT conversations to projects.',
    permissions: ['storage'],
    host_permissions: [...CHATGPT_HOST_PERMISSIONS],
  },
});

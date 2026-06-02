export const SELECTORS = {
  conversationLink:
    'a[data-sidebar-item="true"][href*="/c/"], a[data-sidebar-item="true"][href*="/g/g-p-"][href*="/c/"]',
  projectLink:
    'a[data-sidebar-item="true"][href^="/g/g-p-"][href$="/project"]',
  optionsButton: '[data-conversation-options-trigger]',
} as const;

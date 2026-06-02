export const CHATGPT_MATCHES = [
  '*://chatgpt.com/*',
  '*://chat.openai.com/*',
] as const;

export const CHATGPT_HOST_PERMISSIONS: readonly string[] = [
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
];

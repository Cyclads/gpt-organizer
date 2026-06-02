export type GptProject = { id: string; title: string };

export type ConversationRow = {
  id: string;
  title: string;
  element: HTMLAnchorElement;
};

export type BatchResult = {
  id: string;
  ok: boolean;
  error?: string;
};

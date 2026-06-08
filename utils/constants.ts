export const ROOT_ID = 'gpt-organizer-root';
export const STORAGE_KEY = 'gptOrganizer.v2';
export const LOGS_STORAGE_KEY = 'gptOrganizer.logs.v1';
export const PENDING_PLAN_STORAGE_KEY = 'gptOrganizer.pendingPlan.v1';
export const MAX_LOG_ENTRIES = 400;
export const DELETE_DELAY_MS = 280;
export const LOG_PREFIX = '[GPT Organizer]';

export const MOVE_MENU_LABELS = [
  'move to project',
  'przenieś do projektu',
  'move to',
  'przenieś do',
] as const;

export const REMOVE_FROM_PROJECT_LABELS = [
  'remove from project',
  'usuń z projektu',
  'no project',
  'bez projektu',
] as const;

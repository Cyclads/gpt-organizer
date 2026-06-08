import { STORAGE_KEY } from './constants';

export type OrganizerUiState = {
  enabled: boolean;
  panelCollapsed: boolean;
  activeTab: 'actions' | 'logs';
};

const DEFAULT_STATE: OrganizerUiState = {
  enabled: true,
  panelCollapsed: true,
  activeTab: 'actions',
};

export function loadUiState(): OrganizerUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const data = JSON.parse(raw) as Partial<OrganizerUiState & { selected?: unknown }>;
    return {
      enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
      panelCollapsed:
        typeof data.panelCollapsed === 'boolean' ? data.panelCollapsed : true,
      activeTab: data.activeTab === 'logs' ? 'logs' : 'actions',
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveUiState(state: OrganizerUiState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

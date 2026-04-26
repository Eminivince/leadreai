import { create } from 'zustand';
import type { User, Workspace } from '@leadreai/shared';

interface AppState {
  user: User | null;
  workspace: Workspace | null;
  newQueryOpen: boolean;
  activeJobId: string | null;
  activeJobPrompt: string | null;
  setUser: (user: User | null) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  openNewQuery: () => void;
  closeNewQuery: () => void;
  setActiveJob: (jobId: string, prompt: string) => void;
  clearActiveJob: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  workspace: null,
  newQueryOpen: false,
  activeJobId: null,
  activeJobPrompt: null,
  setUser: (user) => set({ user }),
  setWorkspace: (workspace) => set({ workspace }),
  openNewQuery: () => set({ newQueryOpen: true }),
  closeNewQuery: () => set({ newQueryOpen: false }),
  setActiveJob: (jobId, prompt) => set({ activeJobId: jobId, activeJobPrompt: prompt }),
  clearActiveJob: () => set({ activeJobId: null, activeJobPrompt: null }),
  reset: () => set({ user: null, workspace: null, newQueryOpen: false, activeJobId: null, activeJobPrompt: null }),
}));

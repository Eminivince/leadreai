import { create } from 'zustand';
import type { User, Workspace } from '@leadreai/shared';

interface AppState {
  user: User | null;
  workspace: Workspace | null;
  newQueryOpen: boolean;
  topUpOpen: boolean;
  changePlanOpen: boolean;
  searchOpen: boolean;
  activeJobId: string | null;
  activeJobPrompt: string | null;
  setUser: (user: User | null) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  openNewQuery: () => void;
  closeNewQuery: () => void;
  openTopUp: () => void;
  closeTopUp: () => void;
  openChangePlan: () => void;
  closeChangePlan: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  setActiveJob: (jobId: string, prompt: string) => void;
  clearActiveJob: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  workspace: null,
  newQueryOpen: false,
  topUpOpen: false,
  changePlanOpen: false,
  searchOpen: false,
  activeJobId: null,
  activeJobPrompt: null,
  setUser: (user) => set({ user }),
  setWorkspace: (workspace) => set({ workspace }),
  openNewQuery: () => set({ newQueryOpen: true }),
  closeNewQuery: () => set({ newQueryOpen: false }),
  openTopUp: () => set({ topUpOpen: true }),
  closeTopUp: () => set({ topUpOpen: false }),
  openChangePlan: () => set({ changePlanOpen: true }),
  closeChangePlan: () => set({ changePlanOpen: false }),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  setActiveJob: (jobId, prompt) => set({ activeJobId: jobId, activeJobPrompt: prompt }),
  clearActiveJob: () => set({ activeJobId: null, activeJobPrompt: null }),
  reset: () =>
    set({
      user: null,
      workspace: null,
      newQueryOpen: false,
      topUpOpen: false,
      changePlanOpen: false,
      searchOpen: false,
      activeJobId: null,
      activeJobPrompt: null,
    }),
}));

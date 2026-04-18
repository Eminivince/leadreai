import { create } from 'zustand';
import type { User, Workspace } from '@leadreai/shared';

interface AppState {
  user: User | null;
  workspace: Workspace | null;
  setUser: (user: User | null) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  workspace: null,
  setUser: (user) => set({ user }),
  setWorkspace: (workspace) => set({ workspace }),
  reset: () => set({ user: null, workspace: null }),
}));

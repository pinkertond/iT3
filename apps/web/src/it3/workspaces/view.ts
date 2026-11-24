import { create } from "zustand";
import { persist } from "zustand/middleware";
export const useWorkspaceView = create<{
  workspace: string;
  select: (workspace: string) => void;
}>()(
  persist((set) => ({ workspace: "", select: (workspace) => set({ workspace }) }), {
    name: "it3-workspace-view-v1",
    partialize: (state) => ({ workspace: state.workspace }),
  }),
);

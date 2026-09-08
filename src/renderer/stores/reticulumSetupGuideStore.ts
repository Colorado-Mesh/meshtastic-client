import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ReticulumSetupGuideState {
  dismissed: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  dismiss: () => void;
}

export const useReticulumSetupGuideStore = create<ReticulumSetupGuideState>()(
  persist(
    (set) => ({
      dismissed: false,
      open: false,
      setOpen: (open) => set({ open }),
      dismiss: () => set({ dismissed: true, open: false }),
    }),
    {
      name: 'mesh-client:reticulumSetupGuide',
      partialize: (state) => ({ dismissed: state.dismissed }),
    },
  ),
);

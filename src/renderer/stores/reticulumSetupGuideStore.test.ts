import { beforeEach, describe, expect, it } from 'vitest';

import { useReticulumSetupGuideStore } from './reticulumSetupGuideStore';

describe('Reticulum setup guide preference', () => {
  beforeEach(() => {
    useReticulumSetupGuideStore.setState({ dismissed: false, open: false });
  });

  it('restores dismissal after restart without restoring an open guide', async () => {
    const store = useReticulumSetupGuideStore;
    store.getState().dismiss();
    store.getState().setOpen(true);
    const saved = localStorage.getItem('mesh-client:reticulumSetupGuide')!;
    expect(JSON.parse(saved).state).toEqual({ dismissed: true });
    store.setState({ dismissed: false, open: false });
    localStorage.setItem('mesh-client:reticulumSetupGuide', saved);
    await store.persist.rehydrate();
    expect(store.getState().dismissed).toBe(true);
    expect(store.getState().open).toBe(false);
  });

  it('keeps dismissal when a user temporarily reopens and leaves the guide', () => {
    const store = useReticulumSetupGuideStore;
    store.getState().dismiss();
    store.getState().setOpen(true);
    expect(store.getState().open).toBe(true);
    store.getState().setOpen(false);
    expect(store.getState().dismissed).toBe(true);
  });
});

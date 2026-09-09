import { describe, expect, it } from 'vitest';

import {
  reticulumAnnounceAspectLabel,
  reticulumAnnounceAspectQualifier,
} from './reticulumAnnounceAspectLabel';

describe('reticulumAnnounceAspectLabel', () => {
  const t = (key: string) => key;

  it('maps known aspects to product qualifiers', () => {
    expect(reticulumAnnounceAspectQualifier('lxmf.delivery')).toBe('chat');
    expect(reticulumAnnounceAspectQualifier('lxst.telephony')).toBe('voice');
    expect(reticulumAnnounceAspectQualifier('nomadnetwork.node')).toBe('nomad');
    expect(reticulumAnnounceAspectQualifier('rrc.hub')).toBe('rrc');
    expect(reticulumAnnounceAspectQualifier('lxmf.propagation')).toBe('propagation');
    expect(reticulumAnnounceAspectQualifier('unknown')).toBe('unknown');
    expect(reticulumAnnounceAspectQualifier('custom.app')).toBe('unknown');
  });

  it('labels known aspects via i18n keys and raw unknown aspects', () => {
    expect(reticulumAnnounceAspectLabel('lxmf.delivery', t)).toBe('peerDetailModal.aspect.chat');
    expect(reticulumAnnounceAspectLabel('lxst.telephony', t)).toBe('peerDetailModal.aspect.voice');
    expect(reticulumAnnounceAspectLabel('nomadnetwork.node', t)).toBe(
      'peerDetailModal.aspect.nomad',
    );
    expect(reticulumAnnounceAspectLabel('rrc.hub', t)).toBe('peerDetailModal.aspect.rrc');
    expect(reticulumAnnounceAspectLabel('lxmf.propagation', t)).toBe(
      'peerDetailModal.aspect.propagation',
    );
    expect(reticulumAnnounceAspectLabel('custom.app', t)).toBe('custom.app');
    expect(reticulumAnnounceAspectLabel('unknown', t)).toBe('peerDetailModal.aspect.unknown');
    expect(reticulumAnnounceAspectLabel('', t)).toBe('peerDetailModal.aspect.unknown');
  });
});

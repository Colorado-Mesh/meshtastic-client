import { describe, expect, it } from 'vitest';

import { meshcoreMqttUserFacingHint } from './meshcoreMqttUserHint';

describe('meshcoreMqttUserFacingHint', () => {
  it('appends auth hint for Not authorized', () => {
    const out = meshcoreMqttUserFacingHint('Connection refused: Not authorized');
    expect(out).toContain('letsmesh-mqtt-auth.md');
    expect(out).toContain('Connection refused: Not authorized');
    expect(out).toContain('JWT audience');
  });

  it('appends network hint for ECONNREFUSED', () => {
    const out = meshcoreMqttUserFacingHint('connect ECONNREFUSED');
    expect(out).toContain('firewall');
  });

  it('passes through unrelated messages unchanged', () => {
    expect(meshcoreMqttUserFacingHint('Something else')).toBe('Something else');
  });
});

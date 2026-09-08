import { describe, expect, it } from 'vitest';

import {
  hasCustomReticulumProfileIcon,
  isDefaultReticulumProfileIcon,
  mapRgbToReticulumIconColor,
  parseReticulumIconAppearanceWire,
  resolveReticulumProfileIconName,
} from './reticulumIconAppearance';

describe('reticulumIconAppearance', () => {
  it('detects default / unset profile icon', () => {
    expect(isDefaultReticulumProfileIcon(null, null)).toBe(true);
    expect(isDefaultReticulumProfileIcon('circle', 'green')).toBe(true);
    expect(isDefaultReticulumProfileIcon('circle', 'amber')).toBe(true);
    expect(hasCustomReticulumProfileIcon('star', 'green')).toBe(true);
    expect(hasCustomReticulumProfileIcon('user', null)).toBe(true);
    expect(hasCustomReticulumProfileIcon('circle', 'amber')).toBe(false);
    // MeshChat default person icons must not override LXMFace
    expect(isDefaultReticulumProfileIcon('person', 'green')).toBe(true);
    expect(isDefaultReticulumProfileIcon('people', 'purple')).toBe(true);
    expect(hasCustomReticulumProfileIcon('person', 'green')).toBe(false);
    expect(hasCustomReticulumProfileIcon('hiking', 'amber')).toBe(false);
  });

  it('maps foreground rgb to palette color', () => {
    expect(mapRgbToReticulumIconColor([255, 255, 0])).toBe('amber');
    expect(mapRgbToReticulumIconColor([0, 0, 255])).toBe('cyan');
  });

  it('parses LXMF icon appearance wire', () => {
    const parsed = parseReticulumIconAppearanceWire({
      icon_name: 'hiking',
      foreground_rgb: [255, 255, 0],
      background_rgb: [0, 0, 255],
    });
    expect(parsed).toEqual({ icon_name: 'hiking', icon_color: 'amber' });
  });

  it('maps material symbols to lucide names; person/unknown stay unset for LXMFace', () => {
    expect(resolveReticulumProfileIconName('favorite')).toBe('heart');
    expect(resolveReticulumProfileIconName('star')).toBe('star');
    expect(resolveReticulumProfileIconName('user')).toBe('user');
    expect(resolveReticulumProfileIconName('hiking')).toBe('circle');
    expect(resolveReticulumProfileIconName('people')).toBe('circle');
    expect(resolveReticulumProfileIconName('person')).toBe('circle');
    expect(resolveReticulumProfileIconName('account_circle')).toBe('circle');
  });
});

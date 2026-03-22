import { describe, expect, it } from 'vitest';

import {
  isDefaultShortName,
  isPlaceholderLongName,
  meshtasticShortNameAfterClearingDefault,
} from '../shared/nodeNameUtils';

describe('isPlaceholderLongName', () => {
  it('is true for client !xxxxxxxx placeholder', () => {
    expect(isPlaceholderLongName('!abcd1234', 0xabcd1234)).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isPlaceholderLongName('!ABCD1234', 0xabcd1234)).toBe(true);
  });

  it('is false for a user long name', () => {
    expect(isPlaceholderLongName("Bob's Radio", 0xabcd1234)).toBe(false);
  });
});

describe('isDefaultShortName', () => {
  it('is true when short name is last 4 hex of node id', () => {
    expect(isDefaultShortName('1234', 0xabcd1234)).toBe(true);
  });

  it('is false for a custom short name', () => {
    expect(isDefaultShortName('Bob', 0xabcd1234)).toBe(false);
  });

  it('is false for empty short name', () => {
    expect(isDefaultShortName('', 0xabcd1234)).toBe(false);
  });
});

describe('meshtasticShortNameAfterClearingDefault', () => {
  it('clears default short when long name is real', () => {
    expect(meshtasticShortNameAfterClearingDefault("Alice's node", '1234', 0xabcd1234)).toBe('');
  });

  it('keeps default short when long name is still placeholder', () => {
    expect(meshtasticShortNameAfterClearingDefault('!abcd1234', '1234', 0xabcd1234)).toBe('1234');
  });

  it('keeps a non-default short name', () => {
    expect(meshtasticShortNameAfterClearingDefault('Long name here', 'ABCD', 0xabcd1234)).toBe(
      'ABCD',
    );
  });
});

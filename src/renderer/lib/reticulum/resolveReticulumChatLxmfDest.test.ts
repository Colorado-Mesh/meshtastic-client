import { beforeEach, describe, expect, it } from 'vitest';

import {
  findLxmfDeliveryHashForIdentity,
  isReticulumTelephonyOnlyDestination,
  LXMF_DELIVERY_ASPECT,
  resolveReticulumChatLxmfDestination,
} from '@/renderer/lib/reticulum/resolveReticulumChatLxmfDest';
import { LXST_TELEPHONY_ASPECT } from '@/renderer/lib/reticulumVoiceCapability';
import { useReticulumIdentityActivityStore } from '@/renderer/stores/reticulumIdentityActivityStore';
import { useReticulumPeerStore } from '@/renderer/stores/reticulumPeerStore';

const IDENTITY = '0f79468863d76b3ba574baa92606ffcb';
const LXMF = 'e3359f1314aff4fb6261400a8202149b';
const TELEPHONY = 'ab1d53d6923d6983dfb4451e3869b878';

describe('resolveReticulumChatLxmfDestination', () => {
  beforeEach(() => {
    useReticulumIdentityActivityStore.setState({ byDestination: new Map() });
    useReticulumPeerStore.setState({
      peers: new Map(),
      contacts: new Map(),
      history: new Map(),
    });
  });

  it('keeps an lxmf.delivery destination', () => {
    useReticulumIdentityActivityStore.setState({
      byDestination: new Map([
        [
          LXMF,
          [
            {
              destination_hash: LXMF,
              aspect: LXMF_DELIVERY_ASPECT,
              identity_hash: IDENTITY,
              last_seen: 100,
            },
          ],
        ],
      ]),
    });
    expect(resolveReticulumChatLxmfDestination(LXMF)).toEqual({
      status: 'ok',
      hash: LXMF,
      remapped: false,
    });
  });

  it('remaps lxst.telephony to the identity lxmf.delivery hash', () => {
    useReticulumIdentityActivityStore.setState({
      byDestination: new Map([
        [
          TELEPHONY,
          [
            {
              destination_hash: TELEPHONY,
              aspect: LXST_TELEPHONY_ASPECT,
              identity_hash: IDENTITY,
              last_seen: 200,
            },
          ],
        ],
        [
          LXMF,
          [
            {
              destination_hash: LXMF,
              aspect: LXMF_DELIVERY_ASPECT,
              identity_hash: IDENTITY,
              last_seen: 150,
            },
          ],
        ],
      ]),
    });
    expect(resolveReticulumChatLxmfDestination(TELEPHONY)).toEqual({
      status: 'ok',
      hash: LXMF,
      remapped: true,
    });
  });

  it('returns missing_lxmf for telephony without a known lxmf.delivery', () => {
    useReticulumIdentityActivityStore.setState({
      byDestination: new Map([
        [
          TELEPHONY,
          [
            {
              destination_hash: TELEPHONY,
              aspect: LXST_TELEPHONY_ASPECT,
              identity_hash: IDENTITY,
              last_seen: 200,
            },
          ],
        ],
      ]),
    });
    expect(resolveReticulumChatLxmfDestination(TELEPHONY)).toEqual({ status: 'missing_lxmf' });
  });

  it('allows unknown path-table hashes with no aspect activity', () => {
    expect(resolveReticulumChatLxmfDestination(LXMF)).toEqual({
      status: 'ok',
      hash: LXMF,
      remapped: false,
    });
  });

  it('rejects invalid hashes', () => {
    expect(resolveReticulumChatLxmfDestination('not-a-hash')).toEqual({ status: 'invalid' });
  });

  it('findLxmfDeliveryHashForIdentity picks newest lxmf.delivery row', () => {
    const older = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const map = new Map([
      [
        older,
        [
          {
            destination_hash: older,
            aspect: LXMF_DELIVERY_ASPECT,
            identity_hash: IDENTITY,
            last_seen: 10,
          },
        ],
      ],
      [
        LXMF,
        [
          {
            destination_hash: LXMF,
            aspect: LXMF_DELIVERY_ASPECT,
            identity_hash: IDENTITY,
            last_seen: 99,
          },
        ],
      ],
    ]);
    expect(findLxmfDeliveryHashForIdentity(IDENTITY, map)).toBe(LXMF);
  });

  it('isReticulumTelephonyOnlyDestination detects telephony-only rows', () => {
    useReticulumIdentityActivityStore.setState({
      byDestination: new Map([
        [
          TELEPHONY,
          [
            {
              destination_hash: TELEPHONY,
              aspect: LXST_TELEPHONY_ASPECT,
              identity_hash: IDENTITY,
              last_seen: 1,
            },
          ],
        ],
      ]),
    });
    expect(isReticulumTelephonyOnlyDestination(TELEPHONY)).toBe(true);
    expect(isReticulumTelephonyOnlyDestination(LXMF)).toBe(false);
  });
});

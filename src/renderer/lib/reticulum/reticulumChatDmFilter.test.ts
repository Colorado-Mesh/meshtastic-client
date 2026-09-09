import { describe, expect, it } from 'vitest';

import { LXST_TELEPHONY_ASPECT } from '@/renderer/lib/reticulumVoiceCapability';
import type { ChatMessage } from '@/renderer/lib/types';
import { useReticulumIdentityActivityStore } from '@/renderer/stores/reticulumIdentityActivityStore';

import {
  clearReticulumHashRegistry,
  registerReticulumDestinationHash,
  reticulumHashToNodeId,
} from './destHash';
import { LXMF_DELIVERY_ASPECT } from './resolveReticulumChatLxmfDest';
import { reticulumMessageMatchesDmPeer } from './reticulumChatDmFilter';

function dmMsg(
  partial: Partial<ChatMessage> & Pick<ChatMessage, 'sender_id' | 'payload'>,
): ChatMessage {
  return {
    sender_name: 'peer',
    channel: 0,
    timestamp: Date.now(),
    ...partial,
  };
}

describe('reticulumMessageMatchesDmPeer', () => {
  const selfId = 4172361550;
  const peerId = 2838895306;
  const own = new Set([selfId]);

  it('matches outbound DM to peer with uint32-normalized ids', () => {
    const msg = dmMsg({ sender_id: selfId, to: peerId, payload: 'hello' });
    expect(reticulumMessageMatchesDmPeer(msg, peerId, own)).toBe(true);
  });

  it('matches inbound DM from peer without to field', () => {
    const msg = dmMsg({
      sender_id: peerId,
      reticulum_sender_hash: '8fd7a9361aca00000000000000000000',
      payload: 'reply',
    });
    expect(reticulumMessageMatchesDmPeer(msg, peerId, own)).toBe(true);
  });

  it('matches inbound DM from peer with to:0', () => {
    const msg = dmMsg({
      sender_id: peerId,
      to: 0,
      reticulum_sender_hash: '8fd7a9361aca00000000000000000000',
      payload: 'reply',
    });
    expect(reticulumMessageMatchesDmPeer(msg, peerId, own)).toBe(true);
  });

  it('does not match unrelated channel traffic', () => {
    const msg = dmMsg({ sender_id: 12345, to: peerId, payload: 'other' });
    expect(reticulumMessageMatchesDmPeer(msg, peerId, own)).toBe(false);
  });

  it('matches inbound DM when stored to_hash does not match current identity', () => {
    const msg = dmMsg({ sender_id: peerId, to: selfId, payload: 'reply' });
    expect(reticulumMessageMatchesDmPeer(msg, peerId, new Set())).toBe(true);
  });

  it('matches LXMF-attributed messages when the active tab is a remappable telephony fold', () => {
    const identity = '0f79468863d76b3ba574baa92606ffcb';
    const lxmf = 'e3359f1314aff4fb6261400a8202149b';
    const telephony = 'ab1d53d6923d6983dfb4451e3869b878';
    const telephonyId = reticulumHashToNodeId(telephony) >>> 0;
    const lxmfId = reticulumHashToNodeId(lxmf) >>> 0;
    clearReticulumHashRegistry();
    registerReticulumDestinationHash(telephonyId, telephony);
    registerReticulumDestinationHash(lxmfId, lxmf);
    useReticulumIdentityActivityStore.setState({
      byDestination: new Map([
        [
          telephony,
          [
            {
              destination_hash: telephony,
              aspect: LXST_TELEPHONY_ASPECT,
              identity_hash: identity,
              last_seen: 200,
            },
          ],
        ],
        [
          lxmf,
          [
            {
              destination_hash: lxmf,
              aspect: LXMF_DELIVERY_ASPECT,
              identity_hash: identity,
              last_seen: 150,
            },
          ],
        ],
      ]),
    });

    const outbound = dmMsg({ sender_id: selfId, to: lxmfId, payload: 'hi' });
    expect(reticulumMessageMatchesDmPeer(outbound, telephonyId, own)).toBe(true);

    const inbound = dmMsg({
      sender_id: lxmfId,
      reticulum_sender_hash: lxmf,
      payload: 'yo',
    });
    expect(reticulumMessageMatchesDmPeer(inbound, telephonyId, own)).toBe(true);

    const reverse = dmMsg({ sender_id: selfId, to: telephonyId, payload: 'old' });
    expect(reticulumMessageMatchesDmPeer(reverse, lxmfId, own)).toBe(true);
  });
});

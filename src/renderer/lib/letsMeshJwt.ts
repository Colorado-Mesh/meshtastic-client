export const LETSMESH_HOST = 'mqtt-us-v1.letsmesh.net';

export function isLetsMeshSettings(server: string): boolean {
  return server.trim() === LETSMESH_HOST;
}

// Read the identity cached by RadioPanel after a config-file import.
export function readMeshcoreIdentity(): {
  private_key?: string | number[];
  public_key?: string | number[];
} | null {
  try {
    const raw = localStorage.getItem('mesh-client:meshcoreIdentity');
    if (!raw) return null;
    return JSON.parse(raw) as { private_key?: string | number[]; public_key?: string | number[] };
  } catch {
    // catch-no-log-ok localStorage read — non-critical identity cache; returns null on any parse error
    return null;
  }
}

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  // btoa works on small buffers; spread is fine for 32–64 byte keys/sigs
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeKey(key: string | number[]): Uint8Array {
  // Array of byte values (e.g. [170, 187, ...]) — take first 32 bytes
  if (Array.isArray(key)) {
    return new Uint8Array(key.slice(0, 32));
  }
  // 64 hex chars = 32 bytes (seed only)
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return new Uint8Array(key.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  }
  // 128 hex chars = 64 bytes (seed + public key concatenated); take first 32 bytes
  if (/^[0-9a-fA-F]{128}$/.test(key)) {
    return new Uint8Array(
      key
        .slice(0, 64)
        .match(/.{2}/g)!
        .map((b) => parseInt(b, 16)),
    );
  }
  // Fall back to standard or URL-safe base64
  const bin = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
  return new Uint8Array(bin.split('').map((c) => c.charCodeAt(0)));
}

// PKCS#8 DER wrapper for a raw 32-byte Ed25519 seed (RFC 8410)
const PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

/**
 * Generate a LetsMesh MQTT password token.
 * Header: { alg: "EdDSA", typ: "JWT" }
 * Payload: { sub: username, iat: now, exp: now+30 }
 * Signed with the node's Ed25519 private key.
 */
export async function generateLetsMeshJwt(
  privateKeyRaw: string | number[],
  username: string,
): Promise<string> {
  const seed = decodeKey(privateKeyRaw);
  console.debug(
    `[letsMeshJwt] generating JWT — username: ${username}, key type: ${Array.isArray(privateKeyRaw) ? 'array' : 'string'}, key raw length: ${privateKeyRaw.length} → seed: ${seed.length} bytes`,
  );
  if (seed.length !== 32) throw new Error('LetsMesh JWT: private key must be 32 bytes');

  const pkcs8 = new Uint8Array(PKCS8_PREFIX.length + seed.length);
  pkcs8.set(PKCS8_PREFIX);
  pkcs8.set(seed, PKCS8_PREFIX.length);

  const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: username, iat: now, exp: now + 30 }));
  const message = `${header}.${payload}`;
  const sig = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(message));
  const token = `${message}.${base64url(new Uint8Array(sig))}`;
  console.debug(`[letsMeshJwt] JWT generated — header.payload: ${message}`);
  return token;
}

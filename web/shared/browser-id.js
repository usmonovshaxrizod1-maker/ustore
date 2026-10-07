// Browser contexts can expose getRandomValues without randomUUID (notably some WebViews).
// These IDs also protect frame messages and idempotent mutations, so never use Math.random.
export function secureUuidV4(cryptoRef = globalThis.crypto) {
  if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID();
  if (typeof cryptoRef?.getRandomValues !== 'function') throw new Error('Secure random generator unavailable');
  const bytes = new Uint8Array(16);
  cryptoRef.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function secureFrameNonce(cryptoRef = globalThis.crypto) {
  if (typeof cryptoRef?.getRandomValues !== 'function') throw new Error('Secure random generator unavailable');
  const bytes = new Uint8Array(32);
  cryptoRef.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

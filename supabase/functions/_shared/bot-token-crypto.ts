// USTORE — shared AES-GCM bot-token encryption, used by BOTH shop-api
// (decrypts, at request time) and platform-api (encrypts, at provisioning
// time). Living in one file and being imported by both is deliberate and
// load-bearing: if the two Edge Functions ever drifted to two independent
// implementations of "the same" encryption, a subtle mismatch (wrong IV
// length, wrong base64 alphabet, etc.) would silently make every shop
// token undecryptable — this file existing once removes that whole class
// of bug by construction (17-band of the Phase 2 spec).
//
// Master key: USTORE_BOT_TOKEN_MASTER_KEY, a base64-encoded 256-bit key,
// an Edge Function secret only — never in the database, never sent to the
// frontend. Every encryption uses a fresh random 12-byte IV (stored
// alongside the ciphertext, since GCM requires the same IV+key pair to
// decrypt) — this is why shop_bots has both token_ciphertext AND token_iv
// columns.

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  return btoa(binary);
}
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function importMasterKey(masterKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", base64ToBytes(masterKeyB64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
export async function encryptBotToken(masterKeyB64: string, token: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await importMasterKey(masterKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return { ciphertext: bytesToBase64(new Uint8Array(cipherBuf)), iv: bytesToBase64(iv) };
}
export async function decryptBotToken(masterKeyB64: string, ciphertextB64: string, ivB64: string): Promise<string> {
  const key = await importMasterKey(masterKeyB64);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(ivB64) }, key, base64ToBytes(ciphertextB64));
  return new TextDecoder().decode(plainBuf);
}

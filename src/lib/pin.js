// PIN hashing via SubtleCrypto (browser-native). Per-user salt; we never
// store the raw PIN anywhere. Swap to argon2/bcrypt later if needed.

function randomSalt() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin, salt) {
  const useSalt = salt ?? randomSalt();
  const hash = await sha256Hex(`${useSalt}:${pin}`);
  return { salt: useSalt, pin_hash: hash };
}

export async function verifyPin(pin, salt, expectedHash) {
  const { pin_hash } = await hashPin(pin, salt);
  return pin_hash === expectedHash;
}

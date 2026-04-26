import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';

// Derive a 32-byte key from JWT_SECRET using scrypt (consistent across restarts)
function getKey(): Buffer {
  return scryptSync(env.JWT_SECRET, 'leadreai-email-salt', 32);
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const key = getKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Invalid ciphertext format');
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8');
}

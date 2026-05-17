import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

function getMasterKey(): Buffer {
  const key = process.env.MASTER_KEY;
  if (!key || key.length < 32) {
    throw new Error('MASTER_KEY environment variable is required and must be at least 32 characters');
  }
  return scryptSync(key, 'liveknowledge-salt', 32);
}

/**
 * Encrypt a string using AES-256-GCM
 * Returns: salt:iv:authTag:ciphertext (all hex encoded)
 */
export function encrypt(text: string): string {
  const masterKey = getMasterKey();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypt a string encrypted with encrypt()
 * Input format: salt:iv:authTag:ciphertext (all hex encoded)
 */
export function decrypt(encryptedData: string): string {
  const masterKey = getMasterKey();
  const [saltHex, ivHex, authTagHex, encryptedHex] = encryptedData.split(':');

  if (!saltHex || !ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * 加密工具 - 用于敏感配置的加密存储
 * 使用 AES-256-GCM 加密
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!key) {
    // 如果未配置加密密钥，使用固定密钥（仅用于开发环境）
    return crypto.scryptSync('default-dev-key', 'salt', 32);
  }
  // 将密钥哈希为 32 字节
  return crypto.scryptSync(key, 'salt', 32);
}

export function encrypt(text: string): string {
  if (!text) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  // 格式: iv:tag:encrypted
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const key = getEncryptionKey();
    const [ivHex, tagHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !tagHex || !encrypted) return '';
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}

export function maskSecret(secret: string): string {
  if (!secret || secret.length < 8) return '****';
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

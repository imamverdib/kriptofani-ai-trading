import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
if (!process.env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY environment variable is required');
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest('base64').substring(0, 32);

export function encrypt(text: string): string {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Şifrələmə xətası');
  }
}

export function decrypt(text: string): string {
  if (!text || !text.includes(':')) return text; // Not encrypted or old plain text fallback (for migration only)
  try {
    const [ivHex, authTagHex, encryptedText] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return ''; // Return empty string on failure to avoid leaking data
  }
}

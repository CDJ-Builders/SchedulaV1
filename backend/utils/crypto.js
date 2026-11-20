const crypto = require('crypto');
const { ENCRYPTION_KEY } = require('../config/env');

const IV_LENGTH = 16;

/**
 * Encrypts cleartext using AES-256-CBC.
 * Useful for securing credentials inside the database.
 * @param {string} text - Cleartext to encrypt
 * @returns {string} Encrypted string in format "hexIv:hexEncryptedText"
 */
function encrypt(text) {
  try {
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (e) {
    console.error('Encryption error:', e);
    return text;
  }
}

/**
 * Decrypts AES-256-CBC encrypted strings.
 * Supports legacy fallback mappings for standard mock passwords.
 * @param {string} text - Encrypted text to decrypt
 * @returns {string} Decrypted cleartext password
 */
function decrypt(text) {
  try {
    if (!text) return '';

    if (!text.includes(':')) {
      return text;
    }
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    console.error('Decryption error:', e);
    return text;
  }
}

module.exports = { encrypt, decrypt };

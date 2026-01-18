import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
} from "crypto";

/**
 * Encryption utility for secure credential storage.
 * Uses AES-256-GCM with organization-specific derived keys.
 *
 * Key derivation: HMAC-SHA256 from master key + org ID
 * Encryption format: iv:authTag:ciphertext (all base64)
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;

/**
 * Get the master encryption key from environment.
 * Must be a 64-character hex string (32 bytes).
 */
function getMasterKey(): Buffer {
  const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKeyHex) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY environment variable is not set. " +
        "Generate one with: openssl rand -hex 32"
    );
  }

  if (masterKeyHex.length !== 64) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY must be exactly 64 hex characters (32 bytes). " +
        "Generate one with: openssl rand -hex 32"
    );
  }

  return Buffer.from(masterKeyHex, "hex");
}

/**
 * Derive an organization-specific encryption key from the master key.
 * Uses HMAC-SHA256 for key derivation.
 *
 * @param orgId - The organization ID to derive the key for
 * @returns 32-byte derived key
 */
export function deriveOrgKey(orgId: string): Buffer {
  const masterKey = getMasterKey();
  return createHmac("sha256", masterKey).update(`org-key:${orgId}`).digest();
}

/**
 * Encrypt a credential using AES-256-GCM with an organization-specific key.
 *
 * @param plaintext - The credential to encrypt
 * @param orgId - The organization ID (used for key derivation)
 * @returns Encrypted string in format: iv:authTag:ciphertext (base64)
 */
export function encryptCredential(plaintext: string, orgId: string): string {
  const key = deriveOrgKey(orgId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt a credential using AES-256-GCM with an organization-specific key.
 *
 * @param encrypted - The encrypted string in format: iv:authTag:ciphertext
 * @param orgId - The organization ID (used for key derivation)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (invalid format, tampered data, etc.)
 */
export function decryptCredential(encrypted: string, orgId: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted credential format. Expected iv:authTag:ciphertext"
    );
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length. Expected ${IV_LENGTH} bytes`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Invalid auth tag length. Expected ${AUTH_TAG_LENGTH} bytes`
    );
  }

  const key = deriveOrgKey(orgId);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error(
      "Failed to decrypt credential. Data may be corrupted or tampered."
    );
  }
}

/**
 * Encrypt a credentials object (username, password, token, etc.).
 * Serializes to JSON before encryption.
 *
 * @param credentials - Object containing credential fields
 * @param orgId - The organization ID
 * @returns Encrypted string
 */
export function encryptCredentials(
  credentials: Record<string, string>,
  orgId: string
): string {
  const json = JSON.stringify(credentials);
  return encryptCredential(json, orgId);
}

/**
 * Decrypt a credentials object.
 *
 * @param encrypted - The encrypted string
 * @param orgId - The organization ID
 * @returns Decrypted credentials object
 */
export function decryptCredentials(
  encrypted: string,
  orgId: string
): Record<string, string> {
  const json = decryptCredential(encrypted, orgId);
  return JSON.parse(json);
}

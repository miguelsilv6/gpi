import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Cifra de segredos guardados na base de dados (ex: palavra-passe SMTP).
 *
 * Usa AES-256-GCM com uma chave derivada (scrypt) de um segredo de aplicação.
 * O formato serializado é `v1:<iv>:<authTag>:<ciphertext>` (cada parte em
 * base64). O authTag garante integridade — `decryptSecret` lança se o texto
 * cifrado tiver sido adulterado ou se a chave for diferente.
 *
 * A chave provém de `SETTINGS_ENCRYPTION_KEY` (preferida) ou, em fallback, de
 * `NEXTAUTH_SECRET` (sempre presente em produção). Nunca guardamos a chave em
 * DB — apenas o ciphertext.
 */

const VERSION = 'v1'
const ALGO = 'aes-256-gcm'
const IV_BYTES = 12 // GCM nonce padrão
const KEY_BYTES = 32 // AES-256
// Salt fixo: a derivação serve para esticar o segredo para 32 bytes de forma
// determinística, não para proteger uma password de utilizador. A entropia vem
// do próprio segredo da aplicação.
const SCRYPT_SALT = 'gpi-settings-secret-v1'

function getKey(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY ou NEXTAUTH_SECRET em falta — não é possível cifrar segredos.',
    )
  }
  return scryptSync(secret, SCRYPT_SALT, KEY_BYTES)
}

/** Cifra `plain` e devolve a string serializada `v1:<iv>:<tag>:<ct>`. */
export function encryptSecret(plain: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

/** Decifra uma string produzida por `encryptSecret`. Lança se inválida/adulterada. */
export function decryptSecret(enc: string): string {
  const parts = enc.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Formato de segredo cifrado inválido.')
  }
  const [, ivB64, tagB64, ctB64] = parts
  const key = getKey()
  const iv = Buffer.from(ivB64!, 'base64')
  const authTag = Buffer.from(tagB64!, 'base64')
  const ciphertext = Buffer.from(ctB64!, 'base64')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plain.toString('utf8')
}

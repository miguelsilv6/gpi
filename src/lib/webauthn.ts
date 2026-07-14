import 'server-only'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types'

/**
 * Núcleo do WebAuthn (passkeys) — geração de opções e verificação das
 * cerimónias de registo e autenticação, com `@simplewebauthn/server`.
 *
 * Login sem nome de utilizador: usam-se credenciais descobríveis (resident
 * keys), pelo que a autenticação não precisa do email — o autenticador oferece
 * as passkeys que tem para este RP e o servidor identifica-a pelo id devolvido.
 *
 * Segurança: a verificação valida sempre o challenge (single-use, guardado num
 * cookie httpOnly da cerimónia), a origem e o RP ID, e o contador de assinaturas
 * (deteção de clonagem). O par de chaves é por credencial — não há segredos
 * partilhados nem chaves de servidor.
 */

export interface RpConfig {
  rpID: string
  rpName: string
  origin: string
}

/**
 * Resolve a configuração do Relying Party. Prioriza env
 * (`WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` / `WEBAUTHN_RP_NAME`) — recomendado em
 * produção — e recorre ao host do pedido em desenvolvimento. `rpID` é o domínio
 * sem esquema nem porta; `origin` é o URL completo.
 */
export function resolveRp(host: string | null | undefined, proto?: string | null): RpConfig {
  const envRpId = process.env.WEBAUTHN_RP_ID
  const envOrigin = process.env.WEBAUTHN_ORIGIN
  const rpName = process.env.WEBAUTHN_RP_NAME || 'GPI'
  const h = host || 'localhost'
  const hostname = h.split(':')[0]
  // Esquema: usa o proto do pedido (x-forwarded-proto de um proxy) quando
  // presente; senão, http para hosts locais e https para os restantes.
  const isLocal =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')
  const scheme = proto || (isLocal ? 'http' : 'https')
  return {
    rpID: envRpId || hostname,
    origin: envOrigin || `${scheme}://${h}`,
    rpName,
  }
}

/** Credencial guardada, no formato usado para verificar asserções. */
export interface StoredCredential {
  credentialId: string // base64url
  publicKey: string // base64url
  counter: number
  transports: string | null
}

/** Credencial nova, normalizada a partir de uma cerimónia de registo. */
export interface NewCredential {
  credentialId: string
  publicKey: string
  counter: number
  transports: string | null
  deviceType: string | null
  backedUp: boolean
}

function parseTransports(t: string | null): AuthenticatorTransportFuture[] | undefined {
  const list = t?.split(',').map((s) => s.trim()).filter(Boolean)
  return list && list.length > 0 ? (list as AuthenticatorTransportFuture[]) : undefined
}

export async function buildRegistrationOptions(params: {
  user: { id: string; email: string; nome: string }
  existing: StoredCredential[]
  rp: RpConfig
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { user, existing, rp } = params
  return generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userID: user.id,
    userName: user.email,
    userDisplayName: user.nome,
    attestationType: 'none',
    // Evita registar duas vezes o mesmo autenticador.
    excludeCredentials: existing.map((c) => ({
      id: isoBase64URL.toBuffer(c.credentialId),
      type: 'public-key',
      transports: parseTransports(c.transports),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })
}

export async function verifyRegistration(params: {
  response: RegistrationResponseJSON
  expectedChallenge: string
  rp: RpConfig
}): Promise<NewCredential | null> {
  const { response, expectedChallenge, rp } = params
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    requireUserVerification: false,
  })
  if (!verification.verified || !verification.registrationInfo) return null
  const info = verification.registrationInfo
  return {
    credentialId: isoBase64URL.fromBuffer(info.credentialID),
    publicKey: isoBase64URL.fromBuffer(info.credentialPublicKey),
    counter: info.counter,
    transports: response.response.transports?.join(',') || null,
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
  }
}

export async function buildAuthenticationOptions(rp: RpConfig): Promise<PublicKeyCredentialRequestOptionsJSON> {
  // allowCredentials vazio → login sem nome de utilizador (o autenticador
  // escolhe entre as suas passkeys descobríveis para este RP).
  return generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: 'preferred',
    allowCredentials: [],
  })
}

export async function verifyAuthentication(params: {
  response: AuthenticationResponseJSON
  expectedChallenge: string
  rp: RpConfig
  stored: StoredCredential
}): Promise<{ newCounter: number } | null> {
  const { response, expectedChallenge, rp, stored } = params
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    requireUserVerification: false,
    authenticator: {
      credentialID: isoBase64URL.toBuffer(stored.credentialId),
      credentialPublicKey: isoBase64URL.toBuffer(stored.publicKey),
      counter: stored.counter,
      transports: parseTransports(stored.transports),
    },
  })
  if (!verification.verified) return null
  return { newCounter: verification.authenticationInfo.newCounter }
}

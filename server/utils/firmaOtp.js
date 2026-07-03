const crypto = require('crypto')
const { supabase } = require('../config')
const { hashToken, risolviInvioDaToken } = require('./firmaData')
const { inviaEmailOtpFirma } = require('./email')

const OTP_VALIDITY_MS = 10 * 60 * 1000
const OTP_MAX_TENTATIVI = 5
const OTP_LOCKOUT_MS = 15 * 60 * 1000
const SESSION_JWT_TTL_SEC = 15 * 60

const RISPOSTA_RICHIEDI_OK = {
  ok: true,
  message: 'Se l\'indirizzo email è corretto, riceverai a breve un codice di verifica.',
}

function jwtSecret() {
  return process.env.FIRMA_OTP_JWT_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || ''
}

function generaCodiceOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

function hashOtpCodice(codice) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(`${salt}:${codice}`).digest('hex')
  return `${salt}:${hash}`
}

function verificaOtpHash(codice, stored) {
  if (!stored || typeof stored !== 'string') return false
  const sep = stored.indexOf(':')
  if (sep <= 0) return false
  const salt = stored.slice(0, sep)
  const expected = stored.slice(sep + 1)
  if (!salt || !expected) return false
  const hash = crypto.createHash('sha256').update(`${salt}:${codice}`).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function invioProntoPerOtp(risolto) {
  return risolto.invio && !risolto.errore
}

function isOtpBloccato(invio) {
  const tentativi = invio.otp_tentativi ?? 0
  if (tentativi < OTP_MAX_TENTATIVI) return false
  if (!invio.otp_expires_at) return false
  return new Date(invio.otp_expires_at) > new Date()
}

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function creaSessionTokenFirma(tokenHash, invioId) {
  const secret = jwtSecret()
  if (!secret) throw new Error('JWT secret non configurato')

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64url(JSON.stringify({
    th: tokenHash,
    invio_id: invioId,
    typ: 'firma_otp',
    iat: now,
    exp: now + SESSION_JWT_TTL_SEC,
  }))
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `${header}.${payload}.${signature}`
}

function verificaSessionTokenFirma(linkToken, sessionToken, invio) {
  if (!sessionToken || typeof sessionToken !== 'string') {
    return { ok: false, errore: 'sessione_mancante' }
  }
  const secret = jwtSecret()
  if (!secret) return { ok: false, errore: 'sessione_non_valida' }

  const parts = sessionToken.split('.')
  if (parts.length !== 3) return { ok: false, errore: 'sessione_non_valida' }

  const [header, payload, signature] = parts
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url')

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { ok: false, errore: 'sessione_non_valida' }
    }
  } catch {
    return { ok: false, errore: 'sessione_non_valida' }
  }

  let decoded
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, errore: 'sessione_non_valida' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (decoded.typ !== 'firma_otp' || !decoded.exp || decoded.exp < now) {
    return { ok: false, errore: 'sessione_scaduta' }
  }
  if (decoded.th !== hashToken(linkToken) || decoded.invio_id !== invio.id) {
    return { ok: false, errore: 'sessione_non_valida' }
  }
  if (!invio.otp_verificato_at) {
    return { ok: false, errore: 'sessione_non_valida' }
  }

  const verificatoAt = new Date(invio.otp_verificato_at).getTime()
  if (Date.now() - verificatoAt > SESSION_JWT_TTL_SEC * 1000) {
    return { ok: false, errore: 'sessione_scaduta' }
  }

  return { ok: true }
}

async function richiediOtpFirma(linkToken, email) {
  const risolto = await risolviInvioDaToken(linkToken)
  if (!invioProntoPerOtp(risolto)) {
    return RISPOSTA_RICHIEDI_OK
  }

  const invio = risolto.invio
  if (isOtpBloccato(invio)) {
    return RISPOSTA_RICHIEDI_OK
  }

  let emailTarget = email
  if (!isValidEmail(emailTarget)) {
    const fromCliente = invio.preventivi?.clienti?.email
    if (isValidEmail(fromCliente)) emailTarget = fromCliente
  }
  if (!isValidEmail(emailTarget)) {
    return RISPOSTA_RICHIEDI_OK
  }

  const codice = generaCodiceOtp()
  const otpHash = hashOtpCodice(codice)
  const otpExpiresAt = new Date(Date.now() + OTP_VALIDITY_MS).toISOString()
  const emailNorm = emailTarget.trim().toLowerCase()

  const { error } = await supabase
    .from('preventivo_invii')
    .update({
      otp_hash: otpHash,
      otp_email: emailNorm,
      otp_expires_at: otpExpiresAt,
      otp_tentativi: 0,
      otp_verificato_at: null,
    })
    .eq('id', invio.id)

  if (error) {
    console.error('[firmaOtp] richiedi update:', error.message)
    return RISPOSTA_RICHIEDI_OK
  }

  const preventivo = invio.preventivi
  const nomeCliente = preventivo?.clienti?.nome || preventivo?.nome_cliente || 'Cliente'
  const { data: profile } = await supabase
    .from('profiles')
    .select('nome_azienda')
    .eq('id', invio.user_id)
    .maybeSingle()

  await inviaEmailOtpFirma({
    emailCliente: emailNorm,
    nomeCliente,
    nomeArtigiano: profile?.nome_azienda || 'Artigiano',
    codice,
  })

  return RISPOSTA_RICHIEDI_OK
}

async function verificaOtpFirma(linkToken, codice) {
  const normalized = String(codice || '').replace(/\D/g, '')
  if (normalized.length !== 6) {
    return { ok: false, status: 400, error: 'Inserisci un codice valido a 6 cifre.' }
  }

  const risolto = await risolviInvioDaToken(linkToken)
  if (!invioProntoPerOtp(risolto)) {
    return { ok: false, status: 400, error: 'Codice non valido o scaduto.' }
  }

  const invio = risolto.invio

  if (isOtpBloccato(invio)) {
    return {
      ok: false,
      status: 429,
      error: 'Troppi tentativi errati. Richiedi un nuovo codice tra qualche minuto.',
      tentativiRimasti: 0,
    }
  }

  if (!invio.otp_hash || !invio.otp_expires_at) {
    return { ok: false, status: 400, error: 'Nessun codice attivo. Richiedine uno nuovo.' }
  }

  if (new Date(invio.otp_expires_at) < new Date()) {
    return {
      ok: false,
      status: 400,
      error: 'Il codice è scaduto. Richiedi un nuovo codice di verifica.',
    }
  }

  if (!verificaOtpHash(normalized, invio.otp_hash)) {
    const tentativi = (invio.otp_tentativi ?? 0) + 1
    const rimasti = Math.max(0, OTP_MAX_TENTATIVI - tentativi)
    const update = { otp_tentativi: tentativi }

    if (tentativi >= OTP_MAX_TENTATIVI) {
      update.otp_hash = null
      update.otp_expires_at = new Date(Date.now() + OTP_LOCKOUT_MS).toISOString()
    }

    await supabase.from('preventivo_invii').update(update).eq('id', invio.id)

    if (tentativi >= OTP_MAX_TENTATIVI) {
      return {
        ok: false,
        status: 429,
        error: 'Troppi tentativi errati. Richiedi un nuovo codice tra 15 minuti.',
        tentativiRimasti: 0,
      }
    }

    return {
      ok: false,
      status: 400,
      error: 'Codice non valido.',
      tentativiRimasti: rimasti,
    }
  }

  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('preventivo_invii')
    .update({
      otp_verificato_at: nowIso,
      otp_hash: null,
      otp_tentativi: 0,
    })
    .eq('id', invio.id)

  if (error) {
    console.error('[firmaOtp] verifica update:', error.message)
    return { ok: false, status: 500, error: 'Errore temporaneo. Riprova.' }
  }

  const sessionToken = creaSessionTokenFirma(hashToken(linkToken), invio.id)
  return { ok: true, sessionToken }
}

module.exports = {
  richiediOtpFirma,
  verificaOtpFirma,
  verificaSessionTokenFirma,
  RISPOSTA_RICHIEDI_OK,
}

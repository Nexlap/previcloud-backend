require('dotenv').config()

const Sentry = require('@sentry/node')

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'messages',
  'recap',
  'testo',
  'pdf_base64',
  'immagine_base64',
  'logo_base64',
  'documento_base64',
  'audio_base64',
  'authorization',
  'api_key',
  'secret',
  'stripe',
  'service_key',
  'email',
  'telefono',
  'whatsapp',
  'nome',
  'nome_cliente',
  'nome_azienda',
  'cliente_nome',
  'indirizzo',
  'piva',
  'importo',
  'amount',
  'prezzo',
  'costo',
  'audio',
  'codice',
  'otp',
  'firma_base64',
  'session_token',
])

const EMAIL_RE = /\S+@\S+\.\S+/g
const MAX_EXCEPTION_VALUE_LEN = 500

function filterSensitiveValue(key, value) {
  if (SENSITIVE_KEYS.has(String(key).toLowerCase())) return '[Filtered]'
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return filterSensitiveObject(value)
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => filterSensitiveValue(String(index), item))
  }
  return value
}

function filterSensitiveObject(obj) {
  if (!obj || typeof obj !== 'object') return '[Filtered]'
  const out = {}
  for (const [key, value] of Object.entries(obj)) {
    out[key] = filterSensitiveValue(key, value)
  }
  return out
}

function sanitizeExceptionMessage(text) {
  if (typeof text !== 'string') return text
  let out = text.replace(EMAIL_RE, '[EMAIL_FILTERED]')
  if (out.length > MAX_EXCEPTION_VALUE_LEN) {
    out = `${out.slice(0, MAX_EXCEPTION_VALUE_LEN)}…[TRUNCATED]`
  }
  return out
}

function sanitizeEvent(event) {
  if (event.request?.headers) {
    const headers = { ...event.request.headers }
    delete headers.authorization
    delete headers.Authorization
    delete headers.cookie
    delete headers.Cookie
    event.request.headers = headers
  }

  delete event.request?.cookies

  if (event.request?.data !== undefined) {
    if (typeof event.request.data === 'string') {
      event.request.data = '[Filtered]'
    } else if (typeof event.request.data === 'object' && event.request.data !== null) {
      event.request.data = filterSensitiveObject(event.request.data)
    }
  }

  if (event.extra && typeof event.extra === 'object') {
    event.extra = filterSensitiveObject(event.extra)
  }

  if (event.contexts && typeof event.contexts === 'object') {
    event.contexts = filterSensitiveObject(event.contexts)
  }

  const exceptions = event.exception?.values
  if (Array.isArray(exceptions)) {
    for (const item of exceptions) {
      if (item && typeof item.value === 'string') {
        item.value = sanitizeExceptionMessage(item.value)
      }
    }
  }

  return event
}

function beforeBreadcrumb(breadcrumb) {
  if (breadcrumb?.data && typeof breadcrumb.data === 'object') {
    breadcrumb.data = filterSensitiveObject(breadcrumb.data)
  }
  return breadcrumb
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT || 'development',
    sendDefaultPii: false,
    beforeSend: sanitizeEvent,
    beforeBreadcrumb,
  })
} else {
  console.warn('[sentry] SENTRY_DSN non configurato — monitoraggio errori disattivato')
}

module.exports = Sentry

/**
 * Rate limit in-memory per utente (stesso pattern di aiRateLimit.js).
 * Finestra scorrevole basata su timestamp.
 */

function creaLimitePerUtente({ windowMs, maxRequests, messaggioErrore, logTag }) {
  /** @type {Map<string, number[]>} */
  const richiestePerUtente = new Map()

  function pulisciTimestamps(timestamps, now) {
    return timestamps.filter((t) => now - t < windowMs)
  }

  function controllaLimite(userId) {
    const now = Date.now()
    const precedenti = richiestePerUtente.get(userId) || []
    const attivi = pulisciTimestamps(precedenti, now)

    if (attivi.length >= maxRequests) {
      richiestePerUtente.set(userId, attivi)
      return {
        allowed: false,
        count: attivi.length,
        retryAfterMs: windowMs - (now - attivi[0]),
      }
    }

    attivi.push(now)
    richiestePerUtente.set(userId, attivi)
    return { allowed: true, count: attivi.length }
  }

  function applicaLimite(userId, endpoint, res) {
    const esito = controllaLimite(userId)
    if (esito.allowed) return true

    const retryMin = Math.max(1, Math.ceil((esito.retryAfterMs || windowMs) / 60000))
    console.warn(
      `[${logTag}] endpoint=${endpoint} richieste=${esito.count}/${maxRequests} finestra=${windowMs / 60000}min retry~${retryMin}min`,
    )
    res.status(429).json({ error: messaggioErrore })
    return false
  }

  return { applicaLimite, controllaLimite, windowMs, maxRequests }
}

const trascriviLimite = creaLimitePerUtente({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  messaggioErrore: 'Hai raggiunto il limite di trascrizioni orarie. Riprova più tardi.',
  logTag: 'trascrivi-rate-limit',
})

const segnalazioneLimite = creaLimitePerUtente({
  windowMs: 24 * 60 * 60 * 1000,
  maxRequests: 5,
  messaggioErrore: 'Hai raggiunto il limite giornaliero di segnalazioni. Riprova domani.',
  logTag: 'segnalazione-rate-limit',
})

function applicaLimiteTrascrivi(userId, endpoint, res) {
  return trascriviLimite.applicaLimite(userId, endpoint, res)
}

function applicaLimiteSegnalazione(userId, endpoint, res) {
  return segnalazioneLimite.applicaLimite(userId, endpoint, res)
}

module.exports = {
  applicaLimiteTrascrivi,
  applicaLimiteSegnalazione,
  creaLimitePerUtente,
}

function sendError(res, err, fallback = 'Errore interno') {
  if (err) {
    console.error(err)
  }

  if (process.env.SENTRY_DSN && err instanceof Error) {
    try {
      const Sentry = require('@sentry/node')
      Sentry.captureException(err)
    } catch {
      // Sentry non disponibile
    }
  }

  // Errori 4xx intenzionali (es. preventivoBozza.js: err.status = 400/404)
  const status = Number(err?.status ?? err?.statusCode)
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    const message = err.userMessage || err.message || fallback
    return res.status(status).json({ error: message })
  }

  // Messaggio esplicito pensato per l'utente (senza status 4xx)
  if (typeof err?.userMessage === 'string' && err.userMessage.trim()) {
    return res.status(500).json({ error: err.userMessage })
  }

  // Mai esporre err.message tecnico (Supabase, Storage, Puppeteer, AI, ecc.)
  return res.status(500).json({ error: fallback })
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next)
    } catch (err) {
      sendError(res, err)
    }
  }
}

module.exports = { asyncRoute, sendError }

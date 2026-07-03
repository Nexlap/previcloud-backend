const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')

const WINDOW_MS = 5 * 60 * 1000
const MAX_REQUESTS = 20

const generaPdfFileRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  keyGenerator: (req) => req.pdfUser?.id || ipKeyGenerator(req),
  message: { error: 'Troppe richieste di generazione PDF, riprova tra qualche minuto' },
})

module.exports = { generaPdfFileRateLimit, MAX_REQUESTS, WINDOW_MS }

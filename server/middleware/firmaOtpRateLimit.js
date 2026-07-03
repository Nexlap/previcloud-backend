const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')

const RICHIEDI_WINDOW_MS = 10 * 60 * 1000
const RICHIEDI_MAX = 3

const firmaOtpRichiediRateLimit = rateLimit({
  windowMs: RICHIEDI_WINDOW_MS,
  max: RICHIEDI_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  keyGenerator: (req) => req.params.token || ipKeyGenerator(req),
  message: {
    ok: true,
    message: 'Se l\'indirizzo email è corretto, riceverai a breve un codice di verifica.',
  },
})

module.exports = { firmaOtpRichiediRateLimit, RICHIEDI_MAX, RICHIEDI_WINDOW_MS }

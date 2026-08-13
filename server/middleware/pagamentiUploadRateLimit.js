const { creaLimitePerUtente } = require('./varieRateLimit')

const ORA_MS = 60 * 60 * 1000
const GIORNO_MS = 24 * 60 * 60 * 1000

const linkPagamentoLimite = creaLimitePerUtente({
  windowMs: ORA_MS,
  maxRequests: 10,
  messaggioErrore: 'Hai raggiunto il limite di link di pagamento orari. Riprova più tardi.',
  logTag: 'link-pagamento-rate-limit',
})

const linkPagamentoRataLimite = creaLimitePerUtente({
  windowMs: ORA_MS,
  maxRequests: 10,
  messaggioErrore: 'Hai raggiunto il limite di link di pagamento rate orari. Riprova più tardi.',
  logTag: 'link-pagamento-rata-rate-limit',
})

const connettiAccountLimite = creaLimitePerUtente({
  windowMs: GIORNO_MS,
  maxRequests: 3,
  messaggioErrore: 'Hai raggiunto il limite giornaliero di collegamenti Stripe. Riprova domani.',
  logTag: 'stripe-connetti-rate-limit',
})

const salvaPdfLimite = creaLimitePerUtente({
  windowMs: ORA_MS,
  maxRequests: 20,
  messaggioErrore: 'Hai raggiunto il limite di upload PDF orari. Riprova più tardi.',
  logTag: 'salva-pdf-rate-limit',
})

const uploadLogoLimite = creaLimitePerUtente({
  windowMs: ORA_MS,
  maxRequests: 10,
  messaggioErrore: 'Hai raggiunto il limite di upload logo orari. Riprova più tardi.',
  logTag: 'upload-logo-rate-limit',
})

const registraPushTokenLimite = creaLimitePerUtente({
  windowMs: ORA_MS,
  maxRequests: 30,
  messaggioErrore: 'Hai raggiunto il limite di registrazioni push orarie. Riprova più tardi.',
  logTag: 'registra-push-token-rate-limit',
})

function applicaLimiteLinkPagamento(userId, endpoint, res) {
  return linkPagamentoLimite.applicaLimite(userId, endpoint, res)
}

function applicaLimiteLinkPagamentoRata(userId, endpoint, res) {
  return linkPagamentoRataLimite.applicaLimite(userId, endpoint, res)
}

function applicaLimiteConnettiAccount(userId, endpoint, res) {
  return connettiAccountLimite.applicaLimite(userId, endpoint, res)
}

function applicaLimiteSalvaPdf(userId, endpoint, res) {
  return salvaPdfLimite.applicaLimite(userId, endpoint, res)
}

function applicaLimiteUploadLogo(userId, endpoint, res) {
  return uploadLogoLimite.applicaLimite(userId, endpoint, res)
}

function applicaLimiteRegistraPushToken(userId, endpoint, res) {
  return registraPushTokenLimite.applicaLimite(userId, endpoint, res)
}

module.exports = {
  applicaLimiteLinkPagamento,
  applicaLimiteLinkPagamentoRata,
  applicaLimiteConnettiAccount,
  applicaLimiteSalvaPdf,
  applicaLimiteUploadLogo,
  applicaLimiteRegistraPushToken,
}

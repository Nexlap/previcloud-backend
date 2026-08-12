const express = require('express')
const router = express.Router()
const verificaUtente = require('../middleware/auth')
const { asyncRoute, sendError } = require('../utils/http')
const { trascriviAudioBase64 } = require('../utils/audioTranscription')
const { caricaTrascrizioni, salvaPreventivoBozza } = require('../utils/varieData')
const { calcolaIncassatoTotale } = require('../utils/incassi')
const { supabase } = require('../config')
const { inviaEmailNuovaSegnalazione } = require('../utils/email')

router.post('/api/salva-preventivo', asyncRoute(async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  const { data, error } = await salvaPreventivoBozza(user.id, req.body)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}))

// ── POST /api/trascrivi ────────────────────────────────────────────
router.post('/api/trascrivi', express.json({ limit: '50mb' }), async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  try {
    const { audio } = req.body
    if (!audio) return res.status(400).json({ error: 'Audio mancante' })
    const trascrizione = await trascriviAudioBase64(audio)
    res.json({ trascrizione })
  } catch (err) {
    console.error('Errore trascrizione:', err)
    sendError(res, err)
  }
})

// ── GET /api/trascrizioni ──────────────────────────────────────────
router.get('/api/trascrizioni', asyncRoute(async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  const { data, error } = await caricaTrascrizioni(user.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}))

router.get('/api/home-stats', async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  try {
    const incassatoTotale = await calcolaIncassatoTotale(user.id)
    res.json({ incassatoTotale })
  } catch (err) {
    sendError(res, err)
  }
})

// ── POST /api/upload-logo ──────────────────────────────────────────

router.get('/api/versione-minima', (req, res) => {
  res.json({
    android: process.env.VERSION_MINIMA_ANDROID ?? '1.0.0',
    desktop: process.env.VERSION_MINIMA_DESKTOP ?? '1.0.0',
    ios: process.env.VERSION_MINIMA_IOS ?? '1.0.0',
  })
})

router.post('/api/segnalazione-notifica', express.json(), async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  try {
    const { titolo, descrizione, tipo, schermata, piattaforma } = req.body
    if (!titolo || !descrizione) {
      return res.status(400).json({ error: 'Titolo e descrizione obbligatori' })
    }
    // Recupera nome azienda dal profilo per il contesto email
    const { data: profilo } = await supabase
      .from('profiles')
      .select('nome_azienda')
      .eq('id', user.id)
      .single()
    await inviaEmailNuovaSegnalazione({
      titolo,
      descrizione,
      tipo,
      schermata,
      piattaforma,
      nomeAzienda: profilo?.nome_azienda,
      emailUtente: user.email,
    })
    res.json({ ok: true })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router

const express = require('express')
const router = express.Router()
const verificaUtente = require('../middleware/auth')
const { applicaLimiteAi } = require('../middleware/aiRateLimit')
const { asyncRoute, sendError } = require('../utils/http')
const { trackAI, trackEvento } = require('../utils/analytics')
const { salvaLogoProfilo } = require('../utils/logoStorage')
const { creaMessaggioClaude } = require('../utils/aiClient')
const { caricaProfilo } = require('../utils/profiloData')
const { parseJsonArrayFromAI } = require('../utils/parseJsonArray')

router.get('/api/profilo', asyncRoute(async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  const { data, error } = await caricaProfilo(user.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}))

// ── POST /api/chat ────────────────────────────────────────────────

router.post('/api/upload-logo', express.json(), async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  try {
    const { logo_base64, mime_type } = req.body
    const { logoUrl, error } = await salvaLogoProfilo({ userId: user.id, logoBase64: logo_base64, mimeType: mime_type })
    if (error) return res.status(500).json({ error: error.message })
    res.json({ logo_url: logoUrl })
  } catch (err) {
    sendError(res, err)
  }
})

// ── POST /api/genera-pdf ───────────────────────────────────────────

router.post('/api/elabora-servizi', express.json(), async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  if (!applicaLimiteAi(user.id, '/api/elabora-servizi', res)) return
  try {
    const { testo, immagine_base64, mime_type } = req.body
    if (!testo && !immagine_base64) return res.status(400).json({ error: 'Testo o immagine mancante' })

    const prompt = `Analizza questo listino prezzi e restituisci un array JSON di servizi strutturati.

Il listino può essere tabella (colonne separate da tab), elenco o testo libero.
Per fasce di prezzo (es. 60–100 €, 500–1.200 €) usa il valore medio arrotondato come costo numerico.
Mappa le unità così: Orario/ora -> "ora", Progetto -> "progetto", Giorno/giornata -> "giorno", altrimenti "cad".
Includi TUTTI i servizi presenti nel listino.

Rispondi SOLO con un array JSON valido, niente altro. Formato:
[
  {
    "nome": "Nome servizio",
    "descrizione": "Breve descrizione opzionale",
    "costo": 300,
    "unita": "cad"
  }
]

Per unita usa: cad, ora, giorno, mq, ml, set, progetto
Se il costo non è specificato, metti null.
Se il testo non include una descrizione esplicita per un servizio,
genera tu una breve descrizione plausibile (una frase, max 15 parole)
basata sul nome del servizio e sulla tua conoscenza del settore
(idraulica, elettricista, edilizia, ecc.). Non lasciare mai il campo
descrizione vuoto a meno che il nome del servizio stesso sia troppo
generico o ambiguo per generarne una sensata.`

    const content = immagine_base64
      ? [
          { type: 'image', source: { type: 'base64', media_type: mime_type || 'image/jpeg', data: immagine_base64 } },
          { type: 'text', text: prompt }
        ]
      : `${prompt}\n\nListino:\n${testo}`

    const { response, latenzaMs } = await creaMessaggioClaude({
      max_tokens: 4096,
      messages: [{ role: 'user', content }]
    })
    
    trackAI({
      userId: user.id,
      endpoint: '/api/elabora-servizi',
      tokenInput: response.usage.input_tokens,
      tokenOutput: response.usage.output_tokens,
      latenzaMs
    })
    trackEvento({ userId: user.id, evento: 'listino_smart', schermata: 'settings', dati: { tipo: immagine_base64 ? 'foto' : 'testo' } })
    const servizi = parseJsonArrayFromAI(response.content[0].text)
    res.json({ servizi })
  } catch (err) {
    sendError(res, err)
  }
})

// ── Parser testo preventivo ────────────────────────────────────────

module.exports = router

const express = require('express')
const router = express.Router()
const verificaUtente = require('../middleware/auth')
const { applicaLimiteAi } = require('../middleware/aiRateLimit')
const { trackAI, trackEvento } = require('../utils/analytics')
const { sendError } = require('../utils/http')
const { creaMessaggioClaude } = require('../utils/aiClient')
const { caricaClienteChat, caricaProfiloChat, caricaProfiloConvertiRecap, caricaServiziChat } = require('../utils/chatData')
const { buildChatSystemBlocks } = require('../utils/chatSystemPrompt')

router.post('/api/chat', async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  if (!applicaLimiteAi(user.id, '/api/chat', res)) return

  const { messages, cliente_id } = req.body
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages mancanti' })
  }

  const profile = await caricaProfiloChat(user.id)
  const servizi = await caricaServiziChat(user.id)

  // Carica dati cliente se disponibile
  let clienteTesto = ''
  if (cliente_id) {
    const cliente = await caricaClienteChat(cliente_id, user.id)
    if (cliente) {
      clienteTesto = `\nCLIENTE PER QUESTO PREVENTIVO:\n- Nome: ${cliente.nome}${cliente.telefono ? '\n- Telefono: ' + cliente.telefono : ''}${cliente.email ? '\n- Email: ' + cliente.email : ''}${cliente.indirizzo ? '\n- Indirizzo: ' + cliente.indirizzo : ''}${cliente.note ? '\n- Note: ' + cliente.note : ''}`
    }
  }

  const serviziTesto = servizi && servizi.length > 0
    ? servizi.map(s => `- ${s.nome}${s.descrizione ? ': ' + s.descrizione : ''}${s.costo ? ' - EUR' + s.costo + '/' + s.unita : ''}`).join('\n')
    : profile?.listino || 'Nessun listino specificato'

  const system = buildChatSystemBlocks(profile, serviziTesto, clienteTesto)

  try {
    const { response, latenzaMs } = await creaMessaggioClaude({
      max_tokens: 1024,
      system,
      messages
    })
    const reply = response.content[0].text

    trackAI({
      userId: user.id,
      endpoint: '/api/chat',
      tokenInput: response.usage.input_tokens,
      tokenOutput: response.usage.output_tokens,
      latenzaMs
    })
    trackEvento({ userId: user.id, evento: 'chat_messaggio', schermata: 'chat', dati: { ha_recap: reply.includes('RECAP_PRONTO') } })

    res.json({ reply })
  } catch (err) {
    console.error('Errore Claude:', err)
    sendError(res, new Error('Errore AI: ' + err.message))
  }
})

// POST /api/converti-recap
router.post('/api/converti-recap', express.json(), async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  if (!applicaLimiteAi(user.id, '/api/converti-recap', res)) return
  try {
    const { recap } = req.body
    const profile = await caricaProfiloConvertiRecap(user.id)

    const { response, latenzaMs } = await creaMessaggioClaude({
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Converti questo riepilogo in un preventivo formattato.
Rispondi SOLO con il preventivo, nient'altro, nessuna introduzione.

RIEPILOGO:
${recap}

FORMATO OBBLIGATORIO:
PREVENTIVO - ${profile?.nome_azienda || 'Azienda'}
Data: ${new Date().toLocaleDateString('it-IT')}  |  Validita': 30 giorni

SERVIZI:

SERVIZIO: [nome servizio]
DETTAGLI:
- [dettaglio 1]
- [dettaglio 2]
PREZZO: EUR XX

[Se ci sono rimborsi spese nel riepilogo:]
RIMBORSI SPESE:
RIMBORSO: [nome]
DETTAGLIO: [dettaglio]
TIPO: [Imponibile|Esente]
IMPORTO: EUR XX   ← solo per spese vive, non per km

[oppure per trasferta km:]
RIMBORSO: Trasferta km
DETTAGLIO: [N] km x EUR 0.25 = EUR [tot]
TIPO: Imponibile

RIEPILOGO:
[Se sconto senza IVA:]
TOTALE LORDO: EUR XX
Sconto [X%|'']: -EUR XX
─────────────────
TOTALE: EUR XX

[Se sconto con IVA:]
Imponibile: EUR XX
IVA 22%: EUR XX
TOTALE LORDO: EUR XX
Sconto [X%|'']: -EUR XX
─────────────────
TOTALE: EUR XX

[Se IVA senza sconto:]
Imponibile: EUR XX
IVA 22%: EUR XX
─────────────────
TOTALE: EUR XX

[Se ritenuta d'acconto:]
TOTALE IMPONIBILE: EUR XX
Ritenuta d'acconto 20%: -EUR XX
─────────────────
TOTALE NETTO: EUR XX

[Se NO IVA, NO ritenuta, NO sconto:]
TOTALE: EUR XX

[Se NOTE PAGAMENTO: rate nel riepilogo:]
PAGAMENTO A RATE: da definire

[Se NOTE PAGAMENTO: acconto+saldo nel riepilogo:]
PAGAMENTO A RATE: Acconto + saldo

[Se NOTE PAGAMENTO: canone mensile nel riepilogo:]
CANONE MENSILE: da definire

Note: [breve nota se presente nel riepilogo]
Contatti: ${profile?.nome_azienda || 'Azienda'}

REGOLE IMPORTANTI:
- Includi IVA SOLO se presente nel riepilogo originale
- Includi rimborsi SOLO se presenti nel riepilogo originale
- Includi sconto SOLO se presente nel riepilogo originale
- Includi NOTE PAGAMENTO SOLO se presenti nel riepilogo originale
- Non inventare dati non presenti nel riepilogo
- TOTALE IMPONIBILE e' usato SOLO per la ritenuta d'acconto fiscale`
      }]
    })
    trackAI({
      userId: user.id,
      endpoint: '/api/converti-recap',
      tokenInput: response.usage.input_tokens,
      tokenOutput: response.usage.output_tokens,
      latenzaMs
    })
    res.json({ preventivo: response.content[0].text.trim() })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router

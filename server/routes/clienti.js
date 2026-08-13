const express = require('express')
const router = express.Router()
const verificaUtente = require('../middleware/auth')
const { sendError } = require('../utils/http')
const { cercaClientiPerNome, creaClienteChat } = require('../utils/clientiData')

router.post('/api/cerca-cliente', express.json(), async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  try {
    const { nome } = req.body
    if (!nome) return res.json({ risultati: [] })
    const risultati = await cercaClientiPerNome(user.id, nome)
    res.json({ risultati })
  } catch (err) {
    sendError(res, err)
  }
})

// ── POST /api/crea-cliente-da-chat ────────────────────────────────
router.post('/api/crea-cliente-da-chat', express.json(), async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  try {
    const { nome, telefono, email, indirizzo } = req.body
    const { data, error } = await creaClienteChat({ userId: user.id, nome, telefono, email, indirizzo })
    if (error) return sendError(res, error)
    res.json({ cliente: data })
  } catch (err) {
    sendError(res, err)
  }
})

// ── POST /api/salva-preventivo ────────────────────────────────────

module.exports = router

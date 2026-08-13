const { supabase } = require('../config')
const { generaHTML } = require('./templates')

function formatNumeroPreventivo(contatore, anno = new Date().getFullYear()) {
  return `PRV-${anno}-${String(contatore).padStart(4, '0')}`
}

async function generaHtmlPreventivo(req, user, options = {}) {
  const assegnaNumero = options.assegnaNumero !== false
  const { testo, template, versione_padre_id, cliente_id, nascondi_prezzi, demo_profile, demo_cliente } = req.body
  const { data: profile } = await supabase.from('profiles').select('nome_azienda, citta, piva, telefono, logo_url, colore_brand, template_preferito, note_pagamento, firma_nome, contatore_preventivi').eq('id', user.id).single()
  const colore = profile?.colore_brand || '0D1B2A'
  const logo = profile?.logo_url || null
  const nome = demo_profile?.nome_azienda || profile?.nome_azienda || 'Azienda'
  const citta = demo_profile?.citta || profile?.citta || ''
  const piva = demo_profile?.piva || profile?.piva || ''
  const telefono = demo_profile?.telefono || profile?.telefono || ''
  const tmpl = template || profile?.template_preferito || 'pulito'
  const notePagamento = profile?.note_pagamento || ''
  const firmaNome = demo_profile?.firma_nome || profile?.firma_nome || ''

  let clienteDati = null
  if (demo_cliente) {
    clienteDati = demo_cliente
  } else if (cliente_id) {
    const { data: cl } = await supabase.from('clienti')
      .select('nome, telefono, email, indirizzo')
      .eq('id', cliente_id)
      .eq('user_id', user.id)
      .single()
    if (cl) clienteDati = cl
  }

  const contatoreAttuale = profile?.contatore_preventivi || 0
  let numeroPreventivo
  let numeroProvvisorio = false

  if (assegnaNumero) {
    const { data: nuovoContatore, error: contatoreError } = await supabase.rpc(
      'incrementa_contatore_preventivi',
      { user_id_input: user.id }
    )
    if (contatoreError) throw contatoreError
    numeroPreventivo = formatNumeroPreventivo(nuovoContatore)
  } else {
    numeroPreventivo = formatNumeroPreventivo(contatoreAttuale + 1)
    numeroProvvisorio = true
  }

  const html = generaHTML(testo, tmpl, { nome, citta, piva, telefono, logo, colore, notePagamento, firmaNome, numeroPreventivo, clienteDati, nascondiPrezzi: !!nascondi_prezzi })
  if (versione_padre_id) {
    await supabase.from('preventivi').update({ is_ultimo: false }).eq('id', versione_padre_id).eq('user_id', user.id)
  }
  let versione = 1
  if (versione_padre_id) {
    const { data: padre } = await supabase.from('preventivi').select('versione').eq('id', versione_padre_id).eq('user_id', user.id).single()
    if (padre) versione = (padre.versione || 1) + 1
  }

  return { html, versione, numeroPreventivo, numeroProvvisorio }
}

module.exports = { generaHtmlPreventivo }

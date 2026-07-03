const { supabase } = require('../config')

async function creaPreventivoBozza(userId, payload) {
  const {
    testo,
    cliente_id,
    importo_totale,
    nome_cliente,
    titolo,
    template,
    versione_padre_id,
  } = payload

  if (!testo || typeof testo !== 'string' || !testo.trim()) {
    const err = new Error('testo obbligatorio')
    err.status = 400
    throw err
  }

  const importo = importo_totale != null && importo_totale !== '' ? Number(importo_totale) : null
  if (importo == null || !Number.isFinite(importo) || importo <= 0) {
    const err = new Error('importo_totale obbligatorio e maggiore di zero')
    err.status = 400
    throw err
  }

  let versione = 1
  if (versione_padre_id) {
    await supabase
      .from('preventivi')
      .update({ is_ultimo: false })
      .eq('id', versione_padre_id)
      .eq('user_id', userId)

    const { data: padre } = await supabase
      .from('preventivi')
      .select('versione')
      .eq('id', versione_padre_id)
      .eq('user_id', userId)
      .single()

    if (padre) versione = (padre.versione || 1) + 1
  }

  let nomeCliente = nome_cliente?.trim() || null
  if (!nomeCliente && cliente_id) {
    const { data: cliente } = await supabase
      .from('clienti')
      .select('nome')
      .eq('id', cliente_id)
      .eq('user_id', userId)
      .single()
    if (cliente?.nome) nomeCliente = cliente.nome
  }

  const { data, error } = await supabase
    .from('preventivi')
    .insert({
      user_id: userId,
      testo_preventivo: testo,
      importo_totale: importo,
      cliente_id: cliente_id || null,
      nome_cliente: nomeCliente,
      titolo: titolo?.trim() || null,
      template: template || null,
      stato: 'bozza',
      is_ultimo: true,
      versione,
      preventivo_padre_id: versione_padre_id || null,
      numero_preventivo: null,
      pdf_url: null,
    })
    .select('id')
    .single()

  if (error) throw error
  return { preventivo_id: data.id }
}

async function caricaBozzaFinalizzabile(userId, preventivoId) {
  const { data, error } = await supabase
    .from('preventivi')
    .select('id, stato, numero_preventivo')
    .eq('id', preventivoId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  if (data.stato !== 'bozza' || data.numero_preventivo) return null
  return data
}

async function finalizzaPreventivoBozza(userId, preventivoId, { numeroPreventivo, testo, versione, pdf_url }) {
  const patch = {
    numero_preventivo: numeroPreventivo,
    testo_preventivo: testo,
    versione,
  }
  if (pdf_url !== undefined && pdf_url !== null) {
    patch.pdf_url = pdf_url
  }

  const { data, error } = await supabase
    .from('preventivi')
    .update(patch)
    .eq('id', preventivoId)
    .eq('user_id', userId)
    .eq('stato', 'bozza')
    .is('numero_preventivo', null)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) {
    const err = new Error('Bozza non trovata o già finalizzata')
    err.status = 404
    throw err
  }
  return data
}

module.exports = {
  creaPreventivoBozza,
  caricaBozzaFinalizzabile,
  finalizzaPreventivoBozza,
}

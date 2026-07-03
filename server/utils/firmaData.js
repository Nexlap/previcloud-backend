const crypto = require('crypto')
const { supabase } = require('../config')
const { generaHTML, formattaFirmaDigitaleCliente } = require('./templates')
const { generaPdfBufferDaHtml } = require('./pdfRenderer')
const {
  BUCKET_PREVENTIVI_PDF,
  SIGNED_URL_EXPIRY_ARTIGIANO_SEC,
  storagePathFromPdfReference,
  signedUrlArtigianoPdfReference,
  signedUrlClientePdfReference,
  signedUrlRenderPdfReference,
} = require('./pdfSignedUrls')
const { mandaPushNotifica } = require('./pushNotifications')

const GIORNI_SCADENZA = 30

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function generaToken() {
  const token = crypto.randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

function baseUrlFirma() {
  return (process.env.FIRMA_WEB_BASE_URL || 'https://preventivoai-web.vercel.app').replace(/\/$/, '')
}

function urlFirma(token) {
  return `${baseUrlFirma()}/p/${token}`
}

async function caricaPreventivoPerFirma(preventivoId, userId) {
  const { data, error } = await supabase
    .from('preventivi')
    .select('id, user_id, testo_preventivo, template, importo_totale, stato, titolo, pdf_url, cliente_id, nome_cliente, clienti(nome, telefono, email, indirizzo)')
    .eq('id', preventivoId)
    .eq('user_id', userId)
    .single()
  if (error || !data) throw new Error('Preventivo non trovato')
  return data
}

async function invioAttivo(preventivoId) {
  const now = new Date().toISOString()
  const { data } = await supabase
    .from('preventivo_invii')
    .select('*')
    .eq('preventivo_id', preventivoId)
    .is('firmato_at', null)
    .is('revocato_at', null)
    .gt('scade_at', now)
    .order('inviato_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function creaInvio({ preventivoId, userId, canale }) {
  const esistente = await invioAttivo(preventivoId)
  if (esistente) {
    return { invio: esistente, token: null, riuso: true }
  }

    const { token, tokenHash } = generaToken()
  const scadeAt = new Date()
  scadeAt.setDate(scadeAt.getDate() + GIORNI_SCADENZA)

  const { data: invio, error } = await supabase
    .from('preventivo_invii')
    .insert({
      preventivo_id: preventivoId,
      user_id: userId,
      token_hash: tokenHash,
      link_token: token,
      canale: canale || 'link',
      scade_at: scadeAt.toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await supabase.from('preventivo_invii_eventi').insert({
    invio_id: invio.id,
    tipo: 'invio_iniziale',
  })

  await supabase
    .from('preventivi')
    .update({ stato: 'inviato' })
    .eq('id', preventivoId)
    .eq('user_id', userId)

  return { invio, token, riuso: false }
}

async function risolviInvioDaToken(token) {
  const tokenHash = hashToken(token)
  const { data: invio, error } = await supabase
    .from('preventivo_invii')
    .select('*, preventivi(id, testo_preventivo, template, importo_totale, stato, titolo, pdf_url, cliente_id, nome_cliente, user_id, clienti(nome, email))')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !invio) return { errore: 'link_non_valido' }
  if (invio.revocato_at) return { errore: 'link_revocato', invio }
  if (invio.firmato_at) return { errore: 'gia_firmato', invio }
  if (new Date(invio.scade_at) < new Date()) return { errore: 'link_scaduto', invio }
  return { invio }
}

async function caricaProfiloPerPreventivo(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('nome_azienda, citta, piva, telefono, logo_url, colore_brand, template_preferito, note_pagamento, firma_nome, contatore_preventivi')
    .eq('id', userId)
    .single()
  return data
}

async function htmlPreventivoDaRecord(preventivo, profile) {
  const cliente = preventivo.clienti || (preventivo.nome_cliente ? { nome: preventivo.nome_cliente } : null)
  const tmpl = preventivo.template || profile?.template_preferito || 'pulito'
  const contatore = profile?.contatore_preventivi || 1
  const numeroPreventivo = `PRV-${new Date().getFullYear()}-${String(contatore).padStart(4, '0')}`

  return generaHTML(preventivo.testo_preventivo || '', tmpl, {
    nome: profile?.nome_azienda || 'Azienda',
    citta: profile?.citta || '',
    piva: profile?.piva || '',
    telefono: profile?.telefono || '',
    logo: profile?.logo_url || null,
    colore: profile?.colore_brand || '0D1B2A',
    notePagamento: profile?.note_pagamento || '',
    firmaNome: profile?.firma_nome || '',
    numeroPreventivo,
    clienteDati: cliente,
    nascondiPrezzi: false,
  })
}

/** Altezza riserva spazio fantasma per paginazione blocco 2 (px layout A4). */
const FIRMA_CLIENTE_RESERVE_PX = 148

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function bloccoFirmaCliente(firmaUrl, nomeCliente, firmatoAt, metodoFirma) {
  const rigaAttestazione = formattaFirmaDigitaleCliente(firmatoAt, metodoFirma)
  const nome = escapeHtml(nomeCliente || 'Cliente')
  const rigaAttestazioneHtml = rigaAttestazione
    ? `<div style="font-size:10px;color:#6B7280;margin-top:5px;margin-bottom:6px;">${escapeHtml(rigaAttestazione)}</div>`
    : ''
  return `
    <div data-section="firma-cliente" style="margin-top:18px;max-width:260px;text-align:left;min-height:${FIRMA_CLIENTE_RESERVE_PX}px;">
      <div style="font-size:10px;font-weight:600;color:#6B7280;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:6px;">Data e firma del cliente</div>
      <img src="${firmaUrl}" alt="Firma ${nome}" style="display:block;height:48px;max-width:220px;object-fit:contain;object-position:left bottom;margin-bottom:5px;" />
      ${rigaAttestazioneHtml}
      <div style="border-bottom:1px solid #374151;width:210px;"></div>
    </div>
  `
}

/** Inserisce il box firma nel flusso del macro blocco 2 (dopo footer, prima del page-footer). */
function inserisciBloccoFirmaInHtml(html, bloccoFirma) {
  const flagBody = html.includes('<body ')
    ? html.replace('<body ', '<body data-firma-pdf="true" ')
    : html.replace('<body>', '<body data-firma-pdf="true">')

  const anchor = 'data-page-footer-template'
  const pos = flagBody.indexOf(anchor)
  if (pos === -1) {
    return flagBody.replace('</body>', `${bloccoFirma}</body>`)
  }
  const insertAt = flagBody.lastIndexOf('<div', pos)
  if (insertAt === -1) {
    return flagBody.replace('</body>', `${bloccoFirma}</body>`)
  }
  return flagBody.slice(0, insertAt) + bloccoFirma + flagBody.slice(insertAt)
}

async function invioPendente(preventivoId) {
  const { data } = await supabase
    .from('preventivo_invii')
    .select('*')
    .eq('preventivo_id', preventivoId)
    .is('firmato_at', null)
    .order('inviato_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function giaFirmato(preventivoId) {
  const { data } = await supabase
    .from('preventivo_invii')
    .select('id')
    .eq('preventivo_id', preventivoId)
    .not('firmato_at', 'is', null)
    .limit(1)
    .maybeSingle()
  return !!data
}

async function salvaDocumentoFirmaManuale(userId, preventivoId, invioId, documentoBase64, mimeType) {
  const raw = documentoBase64.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(raw, 'base64')
  const isPdf = mimeType === 'application/pdf' || mimeType?.includes('pdf')
  const ext = isPdf ? 'pdf' : mimeType?.includes('png') ? 'png' : 'jpg'
  const contentType = isPdf ? 'application/pdf' : mimeType?.includes('png') ? 'image/png' : 'image/jpeg'
  const path = `${userId}/firmati-manuali/${preventivoId}-${invioId}-${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET_PREVENTIVI_PDF)
    .upload(path, buffer, { contentType, upsert: false })
  if (error) throw new Error(error.message)
  return { storagePath: path, tipo: isPdf ? 'pdf' : 'immagine' }
}

async function creaInvioManuale(preventivoId, userId) {
  const { token, tokenHash } = generaToken()
  const scadeAt = new Date()
  scadeAt.setDate(scadeAt.getDate() + GIORNI_SCADENZA)
  const { data: invio, error } = await supabase
    .from('preventivo_invii')
    .insert({
      preventivo_id: preventivoId,
      user_id: userId,
      token_hash: tokenHash,
      link_token: token,
      canale: 'manuale',
      scade_at: scadeAt.toISOString(),
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return invio
}

async function registraFirmaManuale(preventivoId, userId, { documentoBase64, mimeType } = {}) {
  const preventivo = await caricaPreventivoPerFirma(preventivoId, userId)
  if (await giaFirmato(preventivoId)) {
    throw new Error('Preventivo già firmato')
  }

  let invio = await invioAttivo(preventivoId)
  if (!invio) invio = await invioPendente(preventivoId)
  if (!invio) invio = await creaInvioManuale(preventivoId, userId)

  const firmatoAt = new Date().toISOString()
  let firmaImmaginePath = null
  let pdfFirmatoPath = null

  if (documentoBase64) {
    const saved = await salvaDocumentoFirmaManuale(
      userId,
      preventivoId,
      invio.id,
      documentoBase64,
      mimeType || 'application/octet-stream',
    )
    if (saved.tipo === 'pdf') pdfFirmatoPath = saved.storagePath
    else firmaImmaginePath = saved.storagePath
  }

  const audit = {
    metodo: 'manuale',
    firmato_at: firmatoAt,
    mime_type: mimeType || null,
    documento_caricato: !!documentoBase64,
  }

  await supabase
    .from('preventivo_invii')
    .update({
      firmato_at: firmatoAt,
      metodo_firma: 'manuale',
      canale: invio.canale === 'manuale' || !invio.canale ? 'manuale' : invio.canale,
      firma_immagine_url: firmaImmaginePath,
      pdf_firmato_url: pdfFirmatoPath,
      audit_json: { ...(invio.audit_json || {}), ...audit },
      reminder_disabilitato: true,
    })
    .eq('id', invio.id)

  const updatePreventivo = { stato: 'accettato' }
  if (pdfFirmatoPath) updatePreventivo.pdf_url = pdfFirmatoPath
  await supabase.from('preventivi').update(updatePreventivo).eq('id', preventivoId).eq('user_id', userId)

  await supabase.from('preventivo_invii_eventi').insert({
    invio_id: invio.id,
    tipo: 'firma_manuale',
  })

  const nomeCliente = preventivo.clienti?.nome || preventivo.nome_cliente || 'Cliente'

  await creaNotifica({
    userId,
    tipo: 'firma_ricevuta',
    preventivoId,
    invioId: invio.id,
    titolo: 'Preventivo firmato a mano',
    messaggio: documentoBase64
      ? `${nomeCliente}: documento firmato caricato. Quando vuoi, segnalo come pagato?`
      : `${nomeCliente}: preventivo segnato come firmato a mano. Quando vuoi, segnalo come pagato?`,
    payload: {
      nomeCliente,
      pdf_firmato_path: pdfFirmatoPath,
      firma_immagine_path: firmaImmaginePath,
      chiediPagato: true,
      metodo: 'manuale',
    },
  })

  return {
    ok: true,
    invio_id: invio.id,
    firmato_at: firmatoAt,
    pdf_firmato_url: pdfFirmatoPath
      ? await signedUrlArtigianoPdfReference(pdfFirmatoPath)
      : null,
    firma_immagine_url: firmaImmaginePath
      ? await signedUrlArtigianoPdfReference(firmaImmaginePath)
      : null,
    metodo_firma: 'manuale',
  }
}

async function generaPdfOriginale(preventivo, profile) {
  const html = await htmlPreventivoDaRecord(preventivo, profile)
  const pdfBuffer = await generaPdfBufferDaHtml(html)
  const path = `${preventivo.user_id}/originale/${preventivo.id}-${Date.now()}.pdf`
  const { error } = await supabase.storage
    .from(BUCKET_PREVENTIVI_PDF)
    .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: false })
  if (error) throw new Error(error.message)
  return path
}

async function invioFirmatoOnline(preventivoId) {
  const { data: rows, error } = await supabase
    .from('preventivo_invii')
    .select('*')
    .eq('preventivo_id', preventivoId)
    .not('firmato_at', 'is', null)
    .order('firmato_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (rows || []).find((invio) => {
    if (invio.metodo_firma === 'manuale' || invio.canale === 'manuale') return false
    if (invio.metodo_firma === 'online') return true
    return invio.metodo_firma == null && !!invio.firma_immagine_url
  }) || null
}

async function annullaFirmaOnline(preventivoId, userId) {
  const preventivo = await caricaPreventivoPerFirma(preventivoId, userId)
  const invio = await invioFirmatoOnline(preventivoId)
  if (!invio) throw new Error('Nessuna firma online da annullare')

  const profile = await caricaProfiloPerPreventivo(userId)
  const pdfUrlOriginale = invio.audit_json?.pdf_url_pre_firma || await generaPdfOriginale(preventivo, profile)
  const annullatoAt = new Date().toISOString()
  const storico = Array.isArray(invio.audit_json?.storico_firme) ? invio.audit_json.storico_firme : []

  storico.push({
    firmato_at: invio.firmato_at,
    firma_immagine_url: invio.firma_immagine_url,
    pdf_firmato_url: invio.pdf_firmato_url,
    annullato_at: annullatoAt,
  })

  await supabase
    .from('preventivo_invii')
    .update({
      firmato_at: null,
      metodo_firma: null,
      firma_immagine_url: null,
      pdf_firmato_url: null,
      audit_json: {
        ...(invio.audit_json || {}),
        storico_firme: storico,
        ultimo_annullamento_at: annullatoAt,
        pdf_url_pre_firma: pdfUrlOriginale,
      },
    })
    .eq('id', invio.id)

  await supabase
    .from('preventivi')
    .update({ stato: 'inviato', pdf_url: pdfUrlOriginale })
    .eq('id', preventivoId)
    .eq('user_id', userId)

  await supabase.from('preventivo_invii_eventi').insert({
    invio_id: invio.id,
    tipo: 'firma_annullata',
  })

  const linkAttivo = !invio.revocato_at && new Date(invio.scade_at) > new Date()

  return {
    ok: true,
    invio_id: invio.id,
    link_attivo: linkAttivo,
    url: invio.link_token ? urlFirma(invio.link_token) : null,
    scade_at: invio.scade_at,
  }
}

async function salvaImmagineFirma(userId, invioId, firmaBase64) {
  const base64 = firmaBase64.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')
  const path = `${userId}/firme/${invioId}.png`
  const { error } = await supabase.storage
    .from(BUCKET_PREVENTIVI_PDF)
    .upload(path, buffer, { contentType: 'image/png', upsert: true })
  if (error) throw new Error(error.message)
  const renderUrl = await signedUrlRenderPdfReference(path)
  return { storagePath: path, renderUrl }
}

async function generaPdfFirmato(preventivo, profile, firmaRenderUrl, nomeCliente, firmatoAt) {
  let html = await htmlPreventivoDaRecord(preventivo, profile)
  html = inserisciBloccoFirmaInHtml(html, bloccoFirmaCliente(firmaRenderUrl, nomeCliente, firmatoAt, 'online'))
  const pdfBuffer = await generaPdfBufferDaHtml(html)
  const path = `${preventivo.user_id}/firmati/${preventivo.id}-${Date.now()}.pdf`
  const { error } = await supabase.storage
    .from(BUCKET_PREVENTIVI_PDF)
    .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: false })
  if (error) throw new Error(error.message)
  return path
}

function payloadNotificaConPath(payload = {}) {
  const out = { ...payload }

  const pdfRef = out.pdf_firmato_path ?? out.pdfFirmatoUrl ?? out.pdfFirmatoPath ?? null
  const imgRef = out.firma_immagine_path ?? out.firmaImmagineUrl ?? out.firmaImmaginePath ?? null

  delete out.pdfFirmatoUrl
  delete out.firmaImmagineUrl
  delete out.pdfFirmatoPath
  delete out.firmaImmaginePath

  if (pdfRef) {
    out.pdf_firmato_path = storagePathFromPdfReference(pdfRef) || pdfRef
  }
  if (imgRef) {
    out.firma_immagine_path = storagePathFromPdfReference(imgRef) || imgRef
  }

  return out
}

async function creaNotifica({ userId, tipo, preventivoId, invioId, titolo, messaggio, payload }) {
  const { error } = await supabase.from('notifiche').insert({
    user_id: userId,
    tipo,
    preventivo_id: preventivoId,
    invio_id: invioId,
    titolo,
    messaggio,
    payload: payloadNotificaConPath(payload),
  })
  if (error) console.error('creaNotifica', error.message)

  // Manda push nativa in parallelo alla notifica in-app
  mandaPushNotifica(
    userId,
    titolo,
    messaggio,
    { tipo, riferimentoId: preventivoId ?? null }
  ).catch(() => {})
}

async function ultimoInvioFirma(preventivoId) {
  const { data, error } = await supabase
    .from('preventivo_invii')
    .select('id, pdf_firmato_url, firma_immagine_url, firmato_at, metodo_firma, inviato_at')
    .eq('preventivo_id', preventivoId)
    .order('inviato_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

async function urlInvioFirmaArtigiano(preventivoId, userId) {
  await caricaPreventivoPerFirma(preventivoId, userId)

  const invio = await ultimoInvioFirma(preventivoId)
  if (!invio) throw new Error('Nessun invio firma trovato')

  const pdf_firmato_url = invio.pdf_firmato_url
    ? await signedUrlArtigianoPdfReference(invio.pdf_firmato_url)
    : null
  const firma_immagine_url = invio.firma_immagine_url
    ? await signedUrlArtigianoPdfReference(invio.firma_immagine_url)
    : null

  return {
    invio_id: invio.id,
    pdf_firmato_url,
    firma_immagine_url,
    expires_in: SIGNED_URL_EXPIRY_ARTIGIANO_SEC,
    firmato_at: invio.firmato_at,
    metodo_firma: invio.metodo_firma,
  }
}

async function accettaFirma(token, { firmaBase64, accettato, sessionToken }, audit) {
  const risolto = await risolviInvioDaToken(token)
  if (risolto.errore && risolto.errore !== 'gia_firmato') {
    return { ok: false, errore: risolto.errore }
  }
  if (risolto.errore === 'gia_firmato') {
    return {
      ok: true,
      giaFirmato: true,
      pdfFirmatoUrl: await signedUrlClientePdfReference(risolto.invio.pdf_firmato_url),
    }
  }

  const invio = risolto.invio
  const { verificaSessionTokenFirma } = require('./firmaOtp')
  const sessione = verificaSessionTokenFirma(token, sessionToken, invio)
  if (!sessione.ok) {
    return {
      ok: false,
      errore: sessione.errore || 'sessione_non_valida',
      httpStatus: 401,
    }
  }

  if (!accettato) return { ok: false, errore: 'accettazione_richiesta' }
  if (!firmaBase64) return { ok: false, errore: 'firma_richiesta' }

  const preventivo = invio.preventivi
  const profile = await caricaProfiloPerPreventivo(invio.user_id)
  const nomeCliente = preventivo.clienti?.nome || preventivo.nome_cliente || 'Cliente'

  const firmatoAt = new Date().toISOString()
  const { storagePath: firmaImmaginePath, renderUrl: firmaRenderUrl } = await salvaImmagineFirma(
    invio.user_id,
    invio.id,
    firmaBase64,
  )
  const pdfFirmatoPath = await generaPdfFirmato(preventivo, profile, firmaRenderUrl, nomeCliente, firmatoAt)

  await supabase
    .from('preventivo_invii')
    .update({
      firmato_at: firmatoAt,
      metodo_firma: 'online',
      firma_immagine_url: firmaImmaginePath,
      pdf_firmato_url: pdfFirmatoPath,
      audit_json: {
        ...audit,
        metodo: 'online',
        pdf_url_pre_firma: preventivo.pdf_url || null,
        accettato_checkbox: true,
        firmato_at: firmatoAt,
      },
    })
    .eq('id', invio.id)

  await supabase
    .from('preventivi')
    .update({ stato: 'accettato', pdf_url: pdfFirmatoPath })
    .eq('id', preventivo.id)

  const pdfFirmatoUrl = await signedUrlClientePdfReference(pdfFirmatoPath)

  await creaNotifica({
    userId: invio.user_id,
    tipo: 'firma_ricevuta',
    preventivoId: preventivo.id,
    invioId: invio.id,
    titolo: 'Preventivo firmato',
    messaggio: `${nomeCliente} ha accettato il preventivo. Quando vuoi, segnalo come pagato?`,
    payload: { nomeCliente, pdf_firmato_path: pdfFirmatoPath, chiediPagato: true },
  })

  return { ok: true, pdfFirmatoUrl, nomeCliente, firmatoAt }
}

async function pdfOriginaleUrlPerPaginaFirma(preventivo, profile) {
  try {
    let pdfRef = preventivo.pdf_url
    if (!pdfRef) {
      pdfRef = await generaPdfOriginale(preventivo, profile)
    }
    if (!pdfRef) return undefined
    return (await signedUrlClientePdfReference(pdfRef)) || undefined
  } catch {
    return undefined
  }
}

async function datiPaginaFirma(token) {
  const risolto = await risolviInvioDaToken(token)
  if (!risolto.invio) {
    return { stato: risolto.errore || 'link_non_valido' }
  }

  const invio = risolto.invio
  const preventivo = invio.preventivi
  const nomeCliente = preventivo?.clienti?.nome || preventivo?.nome_cliente || 'Cliente'
  const emailRaw = preventivo?.clienti?.email
  const emailCliente = typeof emailRaw === 'string' && emailRaw.trim() ? emailRaw.trim() : null
  const nomeAzienda = (await caricaProfiloPerPreventivo(invio.user_id))?.nome_azienda || 'Azienda'

  if (risolto.errore === 'gia_firmato') {
    return {
      stato: 'gia_firmato',
      nomeCliente,
      nomeAzienda,
      pdfFirmatoUrl: await signedUrlClientePdfReference(invio.pdf_firmato_url),
      firmatoAt: invio.firmato_at,
    }
  }
  if (risolto.errore === 'link_scaduto') {
    return { stato: 'scaduto', nomeCliente, nomeAzienda }
  }
  if (risolto.errore === 'link_revocato') {
    return { stato: 'revocato', nomeCliente, nomeAzienda }
  }

  const profile = await caricaProfiloPerPreventivo(invio.user_id)
  const html = await htmlPreventivoDaRecord(preventivo, profile)
  const pdfOriginaleUrl = await pdfOriginaleUrlPerPaginaFirma(preventivo, profile)

  const payload = {
    stato: 'pronto',
    nomeCliente,
    nomeAzienda,
    emailCliente,
    importoTotale: preventivo.importo_totale,
    titolo: preventivo.titolo,
    html,
    scadeAt: invio.scade_at,
  }
  if (pdfOriginaleUrl) payload.pdfOriginaleUrl = pdfOriginaleUrl

  return payload
}

module.exports = {
  urlFirma,
  baseUrlFirma,
  creaInvio,
  invioAttivo,
  risolviInvioDaToken,
  datiPaginaFirma,
  accettaFirma,
  registraFirmaManuale,
  annullaFirmaOnline,
  caricaPreventivoPerFirma,
  urlInvioFirmaArtigiano,
  creaNotifica,
  hashToken,
}

const express = require('express')
const { supabase } = require('../config')
const verificaUtente = require('../middleware/auth')
const { sendError } = require('../utils/http')
const { getStripeClient } = require('../utils/stripePayments')
const { creaNotifica } = require('../utils/firmaData')
const { inviaEmailPagamentoRicevuto, inviaEmailPagamentoClienteOk } = require('../utils/email')
const { applicaLimiteConnettiAccount } = require('../middleware/pagamentiUploadRateLimit')

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

function formatImportoEuro(n) {
  return Number(n).toFixed(2).replace('.', ',')
}

/** Stripe può passare id stringa o oggetto espanso. */
function paymentIntentIdDaStripe(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value.id) return value.id
  return null
}

/**
 * Lookup record da charge/dispute: gli eventi charge.* espongono payment_intent,
 * non il checkout session id. Il PI viene salvato su checkout.session.completed.
 */
async function trovaRecordPerPaymentIntent(paymentIntentId) {
  if (!paymentIntentId) return null

  const { data: preventivo, error: prevErr } = await supabase
    .from('preventivi')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (prevErr) throw prevErr
  if (preventivo) return { tipo: 'preventivo', id: preventivo.id }

  const { data: rata, error: rataErr } = await supabase
    .from('rate_abbonamento')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (rataErr) throw rataErr
  if (rata) return { tipo: 'rata', id: rata.id }

  return null
}

async function marcaPreventivoRimborsato(preventivoId) {
  const { error } = await supabase
    .from('preventivi')
    .update({
      pagato: false,
      rimborsato: true,
      rimborsato_at: new Date().toISOString(),
      in_disputa: false,
    })
    .eq('id', preventivoId)
  if (error) throw error
}

async function marcaRataRimborsata(rataId) {
  const { error } = await supabase
    .from('rate_abbonamento')
    .update({
      stato: 'da_incassare',
      acconto: 0,
      data_incasso: null,
      rimborsato: true,
      rimborsato_at: new Date().toISOString(),
      in_disputa: false,
    })
    .eq('id', rataId)
  if (error) throw error
}

async function gestisciChargeRefunded(charge) {
  const paymentIntentId = paymentIntentIdDaStripe(charge.payment_intent)
  const record = await trovaRecordPerPaymentIntent(paymentIntentId)

  if (!record) {
    console.warn(
      '[stripe webhook] charge.refunded: nessun preventivo/rata per payment_intent (possibile pagamento pre-colonna)',
      { payment_intent: paymentIntentId, charge_id: charge.id }
    )
    return
  }

  if (record.tipo === 'preventivo') {
    await marcaPreventivoRimborsato(record.id)
    console.info('[stripe webhook] preventivo rimborsato:', record.id)
    return
  }

  await marcaRataRimborsata(record.id)
  console.info('[stripe webhook] rata rimborsata:', record.id)
}

async function gestisciDisputeCreated(dispute) {
  const paymentIntentId = paymentIntentIdDaStripe(dispute.payment_intent)
  const record = await trovaRecordPerPaymentIntent(paymentIntentId)

  if (!record) {
    console.error(
      '[ATTENZIONE] Disputa Stripe aperta ma nessun preventivo/rata per payment_intent - richiede intervento manuale',
      { payment_intent: paymentIntentId, dispute_id: dispute.id }
    )
    return
  }

  const tabella = record.tipo === 'preventivo' ? 'preventivi' : 'rate_abbonamento'
  const { error } = await supabase
    .from(tabella)
    .update({ in_disputa: true })
    .eq('id', record.id)
  if (error) throw error

  console.error(
    `[ATTENZIONE] Disputa Stripe aperta su ${record.tipo} id=${record.id} - richiede intervento manuale`,
    { dispute_id: dispute.id, payment_intent: paymentIntentId }
  )
}

async function gestisciDisputeClosed(dispute) {
  const paymentIntentId = paymentIntentIdDaStripe(dispute.payment_intent)
  const record = await trovaRecordPerPaymentIntent(paymentIntentId)
  const status = dispute.status

  if (!record) {
    console.warn(
      '[stripe webhook] charge.dispute.closed: nessun preventivo/rata per payment_intent',
      { payment_intent: paymentIntentId, dispute_id: dispute.id, status }
    )
    return
  }

  if (status === 'won') {
    const tabella = record.tipo === 'preventivo' ? 'preventivi' : 'rate_abbonamento'
    const { error } = await supabase
      .from(tabella)
      .update({ in_disputa: false })
      .eq('id', record.id)
    if (error) throw error
    console.info('[stripe webhook] disputa vinta, in_disputa rimosso:', record.tipo, record.id)
    return
  }

  if (status === 'lost') {
    if (record.tipo === 'preventivo') {
      await marcaPreventivoRimborsato(record.id)
    } else {
      await marcaRataRimborsata(record.id)
    }
    console.info('[stripe webhook] disputa persa, record rimborsato:', record.tipo, record.id)
    return
  }

  console.info('[stripe webhook] charge.dispute.closed status non gestito:', status, {
    tipo: record.tipo,
    id: record.id,
  })
}

async function caricaRataPerWebhook(rataId) {
  const { data: rata, error } = await supabase
    .from('rate_abbonamento')
    .select('*, abbonamenti(user_id, preventivo_id)')
    .eq('id', rataId)
    .single()

  if (error) throw error
  return rata
}

async function riconciliaPagamentoAbbonamento(session) {
  const metadata = session.metadata || {}
  const userId = metadata.user_id
  const rataId = metadata.rata_id
  const tipo = metadata.tipo

  if (tipo === 'preventivo') {
    // Verifica che il pagamento sia effettivamente completato
    if (session.payment_status !== 'paid') {
      console.info('[stripe webhook] preventivo skip: payment_status non paid:', session.payment_status)
      return
    }

    const { data: preventivo, error: preventivoError } = await supabase
      .from('preventivi')
      .select('id, user_id, pagato, importo_totale, is_ultimo')
      .eq('stripe_session_id', session.id)
      .limit(1)
      .maybeSingle()

    if (preventivoError) throw preventivoError

    if (!preventivo) {
      console.warn('[stripe webhook] preventivo non trovato per stripe_session_id:', session.id)
      return
    }

    // Idempotenza: se già pagato non fare nulla
    if (preventivo.pagato) {
      console.info('[stripe webhook] preventivo già pagato, skip:', preventivo.id)
      return
    }

    if (preventivo.is_ultimo === false) {
      console.warn(
        '[stripe webhook] pagamento ricevuto su versione preventivo non più attuale, richiede intervento manuale',
        { preventivo_id: preventivo.id, stripe_session_id: session.id }
      )
      return
    }

    // Verifica importo: amount_total deve corrispondere all'importo atteso nei metadata
    const importoAtteso = metadata.importo_atteso ? Number(metadata.importo_atteso) : null
    if (importoAtteso && session.amount_total !== importoAtteso) {
      console.warn('[stripe webhook] importo non corrispondente:', session.amount_total, 'atteso:', importoAtteso)
      // Non blocchiamo il pagamento ma lo logghiamo per audit
    }

    const paymentIntentId = paymentIntentIdDaStripe(session.payment_intent)
    const updatePreventivo = {
      pagato: true,
      data_pagamento: new Date().toISOString(),
      stato: 'accettato',
    }
    if (paymentIntentId) {
      updatePreventivo.stripe_payment_intent_id = paymentIntentId
    }

    const { error: updatePreventivoError } = await supabase
      .from('preventivi')
      .update(updatePreventivo)
      .eq('id', preventivo.id)

    if (updatePreventivoError) throw updatePreventivoError

    const importoFormattato = formatImportoEuro(session.amount_total / 100)
    await creaNotifica({
      userId: preventivo.user_id,
      tipo: 'pagamento_ricevuto',
      preventivoId: preventivo.id,
      invioId: null,
      titolo: 'Pagamento ricevuto',
      messaggio: `Pagamento di €${importoFormattato} ricevuto.`,
      payload: {
        preventivo_id: preventivo.id,
        importo: session.amount_total / 100,
        stripe_session_id: session.id,
      },
    })

    // Email artigiano
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(preventivo.user_id)
      const { data: profilo } = await supabase
        .from('profiles')
        .select('nome_azienda')
        .eq('id', preventivo.user_id)
        .maybeSingle()
      const { data: preventivoDettaglio } = await supabase
        .from('preventivi')
        .select('numero_preventivo, cliente_id, nome_cliente')
        .eq('id', preventivo.id)
        .maybeSingle()

      const emailArtigiano = authUser?.user?.email
      const nomeArtigiano = profilo?.nome_azienda || ''
      const numeroPreventivo = preventivoDettaglio?.numero_preventivo || ''
      const importoFormattato2 = formatImportoEuro(session.amount_total / 100)

      if (emailArtigiano) {
        await inviaEmailPagamentoRicevuto({
          emailArtigiano,
          nomeArtigiano,
          importo: importoFormattato2,
          numeroPreventivo,
        })
      }

      // Email cliente (se disponibile)
      let emailCliente = session.customer_email || null
      if (!emailCliente && preventivoDettaglio?.cliente_id) {
        const { data: cliente } = await supabase
          .from('clienti')
          .select('email, nome')
          .eq('id', preventivoDettaglio.cliente_id)
          .maybeSingle()
        emailCliente = cliente?.email || null
        if (emailCliente) {
          await inviaEmailPagamentoClienteOk({
            emailCliente,
            nomeCliente: cliente?.nome || preventivoDettaglio?.nome_cliente || '',
            importo: importoFormattato2,
            nomeArtigiano,
            numeroPreventivo,
          })
        }
      } else if (emailCliente) {
        await inviaEmailPagamentoClienteOk({
          emailCliente,
          nomeCliente: preventivoDettaglio?.nome_cliente || '',
          importo: importoFormattato2,
          nomeArtigiano,
          numeroPreventivo,
        })
      }
    } catch (emailErr) {
      console.error('[stripe webhook] errore invio email pagamento:', emailErr.message)
    }

    return
  }

  if (tipo !== 'abbonamento' || !rataId) {
    console.info('[stripe webhook] checkout skip: metadata non abbonamento')
    return
  }

  const rata = await caricaRataPerWebhook(rataId)
  if (!rata) {
    console.error('[stripe webhook] rata non trovata')
    return
  }

  const abbonamento = rata.abbonamenti
  if (!abbonamento || abbonamento.user_id !== userId) {
    console.error('[stripe webhook] ownership rata non valida')
    return
  }

  if (rata.stato === 'incassato') {
    console.info('[stripe webhook] rata già incassata, skip')
    return
  }

  const paymentIntentId = paymentIntentIdDaStripe(session.payment_intent)
  const updateRata = {
    stato: 'incassato',
    data_incasso: new Date().toISOString(),
    acconto: rata.importo,
  }
  if (paymentIntentId) {
    updateRata.stripe_payment_intent_id = paymentIntentId
  }

  const { error: updateError } = await supabase
    .from('rate_abbonamento')
    .update(updateRata)
    .eq('id', rataId)

  if (updateError) throw updateError

  const etichettaMese = `${MESI[rata.mese - 1]} ${rata.anno}`
  await creaNotifica({
    userId,
    tipo: 'pagamento_ricevuto',
    preventivoId: abbonamento.preventivo_id || null,
    invioId: null,
    titolo: 'Pagamento ricevuto',
    messaggio: `€${formatImportoEuro(rata.importo)} incassato per ${etichettaMese}.`,
    payload: {
      rata_id: rataId,
      abbonamento_id: rata.abbonamento_id,
      importo: rata.importo,
      mese: rata.mese,
      anno: rata.anno,
      stripe_session_id: session.id,
    },
  })
}

const router = express.Router()
const webhookRouter = express.Router()

async function caricaStripeProfilo(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('stripe_account_id, stripe_onboarding_status, stripe_charges_enabled')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

function statoOnboardingDaAccountStripe(account) {
  const chargesEnabled = account.charges_enabled === true
  const detailsSubmitted = account.details_submitted === true

  if (chargesEnabled) {
    return { stripe_onboarding_status: 'verificato', stripe_charges_enabled: true }
  }
  if (detailsSubmitted) {
    return { stripe_onboarding_status: 'in_attesa', stripe_charges_enabled: false }
  }
  return { stripe_onboarding_status: 'non_connesso', stripe_charges_enabled: false }
}

router.post('/api/stripe/connetti-account', express.json(), async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return
  if (!applicaLimiteConnettiAccount(user.id, '/api/stripe/connetti-account', res)) return

  const stripe = getStripeClient()
  if (!stripe) return res.status(500).json({ error: 'Stripe non configurato' })

  try {
    const profilo = await caricaStripeProfilo(user.id)

    if (profilo.stripe_account_id) {
      return res.json({ stripe_account_id: profilo.stripe_account_id })
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'IT',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    })

    const { error } = await supabase
      .from('profiles')
      .update({ stripe_account_id: account.id })
      .eq('id', user.id)

    if (error) return sendError(res, error)

    res.json({ stripe_account_id: account.id })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/api/stripe/onboarding-link', express.json(), async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return

  const stripe = getStripeClient()
  if (!stripe) return res.status(500).json({ error: 'Stripe non configurato' })

  try {
    const { return_url, refresh_url } = req.body || {}
    if (!return_url || !refresh_url) {
      return res.status(400).json({ error: 'return_url e refresh_url sono obbligatori' })
    }

    const profilo = await caricaStripeProfilo(user.id)
    if (!profilo.stripe_account_id) {
      return res.status(400).json({ error: 'Account Stripe non collegato. Chiama prima /api/stripe/connetti-account.' })
    }

    const accountLink = await stripe.accountLinks.create({
      account: profilo.stripe_account_id,
      refresh_url,
      return_url,
      type: 'account_onboarding',
    })

    res.json({ url: accountLink.url })
  } catch {
    res.status(500).json({ error: 'Errore durante la creazione del link di onboarding' })
  }
})

router.get('/api/stripe/stato-account', async (req, res) => {
  const user = await verificaUtente(req, res)
  if (!user) return

  const stripe = getStripeClient()
  if (!stripe) return res.status(500).json({ error: 'Stripe non configurato' })

  try {
    const profilo = await caricaStripeProfilo(user.id)

    if (!profilo.stripe_account_id) {
      return res.json({
        stripe_onboarding_status: 'non_connesso',
        stripe_charges_enabled: false,
      })
    }

    const account = await stripe.accounts.retrieve(profilo.stripe_account_id)
    const stato = statoOnboardingDaAccountStripe(account)

    await supabase
      .from('profiles')
      .update({
        stripe_charges_enabled: stato.stripe_charges_enabled,
        stripe_onboarding_status: stato.stripe_onboarding_status,
      })
      .eq('id', user.id)

    res.json(stato)
  } catch (err) {
    sendError(res, err)
  }
})

webhookRouter.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripeClient()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripe || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe webhook non configurato' })
  }

  const signature = req.headers['stripe-signature']
  if (!signature) {
    return res.status(400).json({ error: 'Firma webhook mancante' })
  }

  const webhookSecretConnect = process.env.STRIPE_WEBHOOK_SECRET_CONNECT
  let event
  let errFirma

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret)
    console.info('[stripe webhook] firma verificata')
  } catch (err) {
    errFirma = err
    if (webhookSecretConnect) {
      try {
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecretConnect)
        console.info('[stripe webhook] firma verificata (Connect)')
      } catch (errConnect) {
        errFirma = errConnect
      }
    }
  }

  if (!event) {
    console.error('[stripe webhook] firma non valida:', errFirma?.message || errFirma)
    return res.status(400).json({ error: 'Firma webhook non valida' })
  }

  if (event.type === 'account.updated') {
    const account = event.data.object
    const chargesEnabled = account.charges_enabled === true

    await supabase
      .from('profiles')
      .update({
        stripe_charges_enabled: chargesEnabled,
        stripe_onboarding_status: chargesEnabled ? 'verificato' : 'in_attesa',
      })
      .eq('stripe_account_id', account.id)
  } else if (event.type === 'checkout.session.completed') {
    try {
      const session = event.data.object
      await riconciliaPagamentoAbbonamento(session)
    } catch (err) {
      console.error('[stripe webhook] checkout.session.completed', err.message)
    }
  } else if (event.type === 'charge.refunded') {
    try {
      await gestisciChargeRefunded(event.data.object)
    } catch (err) {
      console.error('[stripe webhook] charge.refunded', err.message)
    }
  } else if (event.type === 'charge.dispute.created') {
    try {
      await gestisciDisputeCreated(event.data.object)
    } catch (err) {
      console.error('[stripe webhook] charge.dispute.created', err.message)
    }
  } else if (event.type === 'charge.dispute.closed') {
    try {
      await gestisciDisputeClosed(event.data.object)
    } catch (err) {
      console.error('[stripe webhook] charge.dispute.closed', err.message)
    }
  }

  res.json({ received: true })
})

module.exports = router
module.exports.webhookRouter = webhookRouter

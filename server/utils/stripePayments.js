const Stripe = require('stripe')
const { supabase } = require('../config')

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

function getStripeClient() {
  return stripe
}

async function caricaStripeProfiloArtigiano(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('stripe_account_id, stripe_charges_enabled')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

async function creaSessionePagamento({ amount, descrizione, metadata }) {
  const userId = metadata?.user_id
  if (!userId) {
    const err = new Error('user_id mancante nei metadata del pagamento')
    err.statusCode = 400
    throw err
  }

  const profilo = await caricaStripeProfiloArtigiano(userId)
  if (!profilo?.stripe_account_id) {
    const err = new Error('Account Stripe non collegato. Completa la configurazione Stripe dal profilo.')
    err.statusCode = 400
    throw err
  }
  if (!profilo.stripe_charges_enabled) {
    const err = new Error('Account Stripe non ancora verificato. Completa l\'onboarding Stripe.')
    err.statusCode = 400
    throw err
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: amount,
        product_data: { name: descrizione || 'Preventivo' }
      }
    }],
    success_url: 'https://preventivoai-web.vercel.app/pagamento-ok',
    cancel_url: 'https://preventivoai-web.vercel.app/pagamento-annullato',
    metadata
  }, {
    stripeAccount: profilo.stripe_account_id,
  })
  return session
}

async function caricaRataAbbonamento(rataId) {
  const { data: rata } = await supabase
    .from('rate_abbonamento')
    .select('*, abbonamenti(user_id, importo_default, giorno_scadenza)')
    .eq('id', rataId)
    .single()

  return rata
}

/**
 * Invalida una Checkout Session aperta. Per Direct Charges Connect serve lo
 * stesso stripeAccount usato in create. Errori attesi (già scaduta/pagata/assente)
 * vengono ignorati; solo errori inattesi vengono loggati.
 */
async function scadiSessionePagamento(sessionId, userId) {
  if (!stripe || !sessionId) return

  try {
    const options = {}
    if (userId) {
      const profilo = await caricaStripeProfiloArtigiano(userId)
      if (profilo?.stripe_account_id) {
        options.stripeAccount = profilo.stripe_account_id
      }
    }
    await stripe.checkout.sessions.expire(sessionId, options)
  } catch (err) {
    const msg = (err?.message || '').toLowerCase()
    const code = err?.code || ''
    const atteso =
      code === 'resource_missing' ||
      msg.includes('already expired') ||
      msg.includes('has already been completed') ||
      msg.includes('cannot be expired') ||
      msg.includes('no such checkout.session')

    if (!atteso) {
      console.error('[stripe] scadiSessionePagamento errore inatteso:', err.message)
    }
  }
}

module.exports = { caricaRataAbbonamento, creaSessionePagamento, getStripeClient, scadiSessionePagamento }

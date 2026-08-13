const { createClient } = require('@supabase/supabase-js')

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

/**
 * Registra un Expo push token sul profilo, con dedup cross-account:
 * azzera lo stesso token su altri profili prima di assegnarlo all'utente corrente.
 */
async function registraPushTokenPerUtente(userId, token) {
  if (typeof token !== 'string' || !token.startsWith('ExponentPushToken[')) {
    const err = new Error('Token push non valido')
    err.status = 400
    throw err
  }

  const { error: clearError } = await supabaseAdmin
    .from('profiles')
    .update({ expo_push_token: null })
    .eq('expo_push_token', token)
    .neq('id', userId)

  if (clearError) throw clearError

  const { error: setError } = await supabaseAdmin
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', userId)

  if (setError) throw setError
}

/**
 * Manda una notifica push Expo a un utente specifico.
 * Non lancia eccezioni: se la push fallisce, il flusso continua.
 *
 * @param {string} userId - ID utente destinatario
 * @param {string} titolo - Titolo della notifica
 * @param {string} corpo - Testo della notifica
 * @param {Object} dati - Dati extra per la navigazione (opzionale)
 */
async function mandaPushNotifica(userId, titolo, corpo, dati = {}) {
  try {
    const { data: profilo, error } = await supabaseAdmin
      .from('profiles')
      .select('expo_push_token')
      .eq('id', userId)
      .single()

    if (error || !profilo?.expo_push_token) return

    const token = profilo.expo_push_token

    // Valida formato token Expo
    if (!token.startsWith('ExponentPushToken[')) return

    const messaggio = {
      to: token,
      sound: 'default',
      title: titolo,
      body: corpo,
      data: dati,
    }

    const risposta = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messaggio),
    })

    const risultato = await risposta.json()

    // Se il token non è più valido, rimuovilo dal profilo
    if (risultato?.data?.status === 'error' &&
        risultato?.data?.details?.error === 'DeviceNotRegistered') {
      await supabaseAdmin
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('id', userId)
    }

  } catch (error) {
    console.error('Push notification failed:', error.message)
  }
}

module.exports = { mandaPushNotifica, registraPushTokenPerUtente }

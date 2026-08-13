const { Resend } = require('resend')

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM = 'PreviCloud <noreply@previcloud.it>'

async function inviaEmailPagamentoRicevuto({ emailArtigiano, nomeArtigiano, importo, numeroPreventivo }) {
  if (!resend) return
  try {
    await resend.emails.send({
      from: FROM,
      to: emailArtigiano,
      subject: `Pagamento ricevuto — ${numeroPreventivo || 'Preventivo'}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
          <h2 style="color:#0D1B2A">Pagamento ricevuto 🎉</h2>
          <p>Ciao${nomeArtigiano ? ` ${nomeArtigiano}` : ''},</p>
          <p>Hai ricevuto un pagamento di <strong>€${importo}</strong>${numeroPreventivo ? ` per il preventivo <strong>${numeroPreventivo}</strong>` : ''}.</p>
          <p>Il preventivo è stato marcato come <strong>pagato</strong> nel tuo account PreventivoAI.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="font-size:12px;color:#888">PreventivoAI — Solvex</p>
        </div>
      `
    })
  } catch (err) {
    console.error('[email] inviaEmailPagamentoRicevuto:', err.message)
  }
}

async function inviaEmailPagamentoClienteOk({ emailCliente, nomeCliente, importo, nomeArtigiano, numeroPreventivo }) {
  if (!resend) return
  try {
    await resend.emails.send({
      from: FROM,
      to: emailCliente,
      subject: `Pagamento confermato — ${numeroPreventivo || 'Preventivo'}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
          <h2 style="color:#0D1B2A">Pagamento confermato ✓</h2>
          <p>Ciao${nomeCliente ? ` ${nomeCliente}` : ''},</p>
          <p>Il tuo pagamento di <strong>€${importo}</strong>${numeroPreventivo ? ` per il preventivo <strong>${numeroPreventivo}</strong>` : ''}${nomeArtigiano ? ` di <strong>${nomeArtigiano}</strong>` : ''} è andato a buon fine.</p>
          <p>Grazie per aver pagato tramite PreventivoAI.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="font-size:12px;color:#888">PreventivoAI — Solvex</p>
        </div>
      `
    })
  } catch (err) {
    console.error('[email] inviaEmailPagamentoClienteOk:', err.message)
  }
}

async function inviaEmailOtpFirma({ emailCliente, nomeCliente, nomeArtigiano, codice }) {
  if (!resend) {
    console.warn('[email] inviaEmailOtpFirma: RESEND_API_KEY assente, email non inviata')
    return
  }
  try {
    await resend.emails.send({
      from: FROM,
      to: emailCliente,
      subject: 'Codice di verifica — Firma preventivo',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
          <h2 style="color:#0D1B2A">Verifica la tua identità</h2>
          <p>Ciao${nomeCliente ? ` ${nomeCliente}` : ''},</p>
          <p>Per firmare il preventivo${nomeArtigiano ? ` di <strong>${nomeArtigiano}</strong>` : ''}, usa questo codice:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#0E9F8E;margin:24px 0">${codice}</p>
          <p style="font-size:13px;color:#666">Il codice scade tra <strong>10 minuti</strong>. Se non hai richiesto tu questo codice, ignora l'email.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="font-size:12px;color:#888">PreventivoAI — PreviCloud</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[email] inviaEmailOtpFirma:', err.message)
  }
}

async function inviaEmailNuovaSegnalazione({ titolo, descrizione, tipo, schermata, piattaforma, nomeAzienda, emailUtente }) {
  if (!resend) return
  const to = process.env.ADMIN_EMAIL || 'info@previcloud.it'
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Nuova segnalazione: ${titolo}`,
      html: `
        <h2>Nuova segnalazione</h2>
        <p><strong>Titolo:</strong> ${titolo}</p>
        <p><strong>Tipo:</strong> ${tipo}</p>
        <p><strong>Descrizione:</strong> ${descrizione}</p>
        <p><strong>Schermata:</strong> ${schermata || '—'}</p>
        <p><strong>Piattaforma:</strong> ${piattaforma || '—'}</p>
        <p><strong>Utente:</strong> ${nomeAzienda || '—'} (${emailUtente || '—'})</p>
      `,
    })
  } catch (err) {
    console.error('Errore invio email segnalazione:', err.message)
  }
}

module.exports = { inviaEmailPagamentoRicevuto, inviaEmailPagamentoClienteOk, inviaEmailOtpFirma, inviaEmailNuovaSegnalazione }

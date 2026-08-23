function parsaPreventivo(testo) {
  const righe = testo.split('\n').map(r => r.trim()).filter(r => r)
  
  let titolo = ''
  let data = ''
  let validita = '30 giorni'
  let problema = ''
  let voci = []
  let imponibile = ''
  let iva = ''
  let totaleLordo = ''
  let totaleImponibile = ''
  let sconto = ''
  let totale = ''
  let note = ''
  let pagamento = ''
  let canoneMensile = ''
  let canoneScadenza = ''
  let canoneMensilita = ''
  let pagamentoRate = null
  let contatti = ''
  let rimborsi = []
  let rimborsoCorrente = null
  let fase = 'header'
  let servizioCorrente = null

  for (const riga of righe) {
    if (riga.startsWith('PREVENTIVO')) { titolo = riga; fase = 'header'; continue }
    if (riga.startsWith('Data:')) {
      const match = riga.match(/Data:\s*([^\|]+)/)
      if (match) data = match[1].trim()
      const vMatch = riga.match(/Validit\S*:\s*(.+)/)
      if (vMatch) validita = vMatch[1].trim()
      continue
    }
    if (riga.startsWith('Problema:')) { problema = riga.replace('Problema:', '').trim(); continue }
    if (riga === 'SERVIZI:' || riga === 'SERVIZI') { fase = 'servizi'; continue }
    
    if (riga.startsWith('SERVIZIO:') && fase === 'servizi') {
      if (servizioCorrente) voci.push(servizioCorrente)
      const nomeServizio = riga.replace('SERVIZIO:', '').trim()
      const colonnaIdx = nomeServizio.indexOf(': ')
      const nomeClean = colonnaIdx > -1 ? nomeServizio.substring(0, colonnaIdx).trim() : nomeServizio
      const descClean = colonnaIdx > -1 ? nomeServizio.substring(colonnaIdx + 2).trim() : ''
      servizioCorrente = { nome: nomeClean, descrizione: descClean, dettagli: [], prezzo: '', totale: '' }
      continue
    }
    if (riga === 'DETTAGLI:' && servizioCorrente) { continue }
    if (riga.startsWith('- ') && servizioCorrente && fase === 'servizi') {
      servizioCorrente.dettagli.push(riga.substring(2).trim())
      continue
    }
    if (riga.startsWith('PREZZO:') && servizioCorrente) {
      servizioCorrente.prezzo = riga.replace('PREZZO:', '').trim()
      servizioCorrente.totale = servizioCorrente.prezzo
      continue
    }

    if (riga === 'VOCI:' || riga === 'VOCI') { fase = 'voci'; continue }
    if (riga.startsWith('- ') && fase === 'voci') {
      const testo_voce = riga.substring(2)
      const matchCompleto = testo_voce.match(/^(.+?)\s*[-]\s*?([\d.,]+)(?:\/\w+)?\s*=\s*?([\d.,]+)/)
      if (matchCompleto) {
        voci.push({ nome: matchCompleto[1].trim(), dettagli: [], prezzo: matchCompleto[2].trim(), totale: matchCompleto[3].trim() })
      } else {
        const matchSemplice = testo_voce.match(/^(.+?):\s*?([\d.,]+)/)
        if (matchSemplice) {
          voci.push({ nome: matchSemplice[1].trim(), dettagli: [], prezzo: matchSemplice[2].trim(), totale: matchSemplice[2].trim() })
        } else {
          const matchNomeDesc = testo_voce.match(/^(.+?):\s*(.+)$/)
          if (matchNomeDesc && !/\d+/.test(matchNomeDesc[2])) {
            voci.push({ nome: matchNomeDesc[1].trim(), descrizione: matchNomeDesc[2].trim(), dettagli: [], prezzo: '', totale: '' })
          } else {
            voci.push({ nome: testo_voce, dettagli: [], prezzo: '', totale: '' })
          }
        }
      }
      continue
    }

    if (riga === 'RIMBORSI SPESE:') {
      if (servizioCorrente) { voci.push(servizioCorrente); servizioCorrente = null }
      fase = 'rimborsi'
      continue
    }
    if (fase === 'rimborsi') {
      if (riga.startsWith('RIMBORSO:')) {
        if (rimborsoCorrente) rimborsi.push(rimborsoCorrente)
        rimborsoCorrente = { nome: riga.replace('RIMBORSO:', '').trim(), dettaglio: '', tipo: '', importo: '' }
        continue
      }
      if (riga.startsWith('DETTAGLIO:') && rimborsoCorrente) {
        rimborsoCorrente.dettaglio = riga.replace('DETTAGLIO:', '').trim()
        const matchImporto = rimborsoCorrente.dettaglio.match(/=\s*€?([\d.,]+)/)
        if (matchImporto) rimborsoCorrente.importo = '€' + matchImporto[1]
        continue
      }
      if (riga.startsWith('TIPO:') && rimborsoCorrente) { rimborsoCorrente.tipo = riga.replace('TIPO:', '').trim(); continue }
      if (riga.startsWith('IMPORTO:') && rimborsoCorrente) { rimborsoCorrente.importo = riga.replace('IMPORTO:', '').trim(); continue }
    }
    if (riga === 'RIEPILOGO:') {
      if (servizioCorrente) { voci.push(servizioCorrente); servizioCorrente = null }
      if (rimborsoCorrente) { rimborsi.push(rimborsoCorrente); rimborsoCorrente = null }
      fase = 'totali'
      continue
    }
    if (riga.startsWith('Imponibile:')) { imponibile = riga.replace('Imponibile:', '').trim(); continue }
    if (riga.startsWith('IVA')) { iva = riga; continue }
    if (riga.startsWith('TOTALE LORDO:')) { totaleLordo = riga.replace('TOTALE LORDO:', '').trim(); continue }
    if (riga.startsWith('TOTALE IMPONIBILE:')) { totaleImponibile = riga.replace('TOTALE IMPONIBILE:', '').trim(); continue }
    if (riga.startsWith('Totale lordo:')) { totaleImponibile = riga.replace('Totale lordo:', '').trim(); continue }
    if (riga.startsWith('SCONTO:') || riga.startsWith('Sconto')) {
      sconto = riga.replace(/^(SCONTO:|Sconto\s*\d*%?:?)\s*/i, '').trim(); continue
    }
    if (riga.startsWith('TOTALE:')) { totale = riga.replace('TOTALE:', '').trim(); continue }
    if (riga.startsWith('Note:')) { note = riga.replace('Note:', '').trim(); continue }
    if (riga.startsWith('CANONE MENSILE:')) { canoneMensile = riga.replace('CANONE MENSILE:', '').trim(); continue }
    if (riga.startsWith('MENSILITA:')) { canoneMensilita = riga.replace('MENSILITA:', '').trim(); continue }
    if (riga.startsWith('SCADENZA PRIMO CANONE:')) { canoneScadenza = riga.replace('SCADENZA PRIMO CANONE:', '').trim(); continue }
    if (riga.startsWith('PAGAMENTO A RATE:')) {
      pagamentoRate = pagamentoRate || {}
      pagamentoRate.numero = riga.replace('PAGAMENTO A RATE:', '').trim()
      continue
    }
    if (riga.startsWith('IMPORTO RATA:')) {
      pagamentoRate = pagamentoRate || {}
      pagamentoRate.importoRata = riga.replace('IMPORTO RATA:', '').trim()
      continue
    }
    if (riga.startsWith('IMPORTO ACCONTO:')) {
      pagamentoRate = pagamentoRate || {}
      pagamentoRate.importoAcconto = riga.replace('IMPORTO ACCONTO:', '').trim()
      continue
    }
    if (riga.startsWith('IMPORTO SALDO:')) {
      pagamentoRate = pagamentoRate || {}
      pagamentoRate.importoSaldo = riga.replace('IMPORTO SALDO:', '').trim()
      continue
    }
    if (riga.startsWith('ULTIMA RATA:')) {
      pagamentoRate = pagamentoRate || {}
      pagamentoRate.ultimaRata = riga.replace('ULTIMA RATA:', '').trim()
      continue
    }
    if (riga.startsWith('SCADENZA PRIMA RATA:')) {
      pagamentoRate = pagamentoRate || {}
      pagamentoRate.scadenza = riga.replace('SCADENZA PRIMA RATA:', '').trim()
      continue
    }
    if (riga.startsWith('PAGAMENTO:')) { pagamento = riga.replace('PAGAMENTO:', '').trim(); continue }
    if (riga.startsWith('ACCONTO RICHIESTO:') && pagamento) { pagamento += '  ' + riga.replace('ACCONTO RICHIESTO:', '').trim(); continue }
    if (riga.startsWith('IBAN:') && pagamento) { pagamento += '  IBAN ' + riga.replace('IBAN:', '').trim(); continue }
    if (riga.startsWith('Intestatario:') && pagamento) { pagamento += '  ' + riga.replace('Intestatario:', '').trim(); continue }
    if (riga.startsWith('PayPal:') && pagamento) { pagamento += '  PayPal ' + riga.replace('PayPal:', '').trim(); continue }
    if (riga.startsWith('LINK PAGAMENTO:') && pagamento) {
      const link = riga.replace('LINK PAGAMENTO:', '').trim()
      pagamento += `<br><div style="margin-top:10px;text-align:center"><a href="${link}" target="_blank" style="display:inline-block;padding:10px 24px;background:#0e9f8e;color:#ffffff;font-weight:700;font-size:13px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">Clicca qui per pagare →</a></div>`
      continue
    }
    if (riga.startsWith('Contatti:')) { contatti = riga.replace('Contatti:', '').trim(); continue }
    if (riga === '---') continue
  }

  if (servizioCorrente) voci.push(servizioCorrente)
  if (rimborsoCorrente) rimborsi.push(rimborsoCorrente)
  return { titolo, data, validita, problema, voci, rimborsi, imponibile, iva, totaleLordo, totaleImponibile, sconto, totale, note, pagamento, canoneMensile, canoneScadenza, canoneMensilita, pagamentoRate, contatti }
}

module.exports = { parsaPreventivo }

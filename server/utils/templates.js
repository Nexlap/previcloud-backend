const { generaPageBreakScript } = require('./pageBreakScript')

const { parsaPreventivo } = require('./parserPreventivo')

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeClienteDati(clienteDati) {
  if (!clienteDati) return null
  return {
    nome: escapeHtml(clienteDati.nome),
    indirizzo: escapeHtml(clienteDati.indirizzo),
    email: escapeHtml(clienteDati.email),
    telefono: escapeHtml(clienteDati.telefono),
  }
}

function escapeParsedPreventivo(p) {
  return {
    ...p,
    problema: escapeHtml(p.problema),
    note: escapeHtml(p.note),
    pagamento: p.pagamento && p.pagamento.includes('<') ? p.pagamento : escapeHtml(p.pagamento),
    validita: escapeHtml(p.validita),
    canoneMensile: escapeHtml(p.canoneMensile),
    canoneScadenza: escapeHtml(p.canoneScadenza),
    imponibile: escapeHtml(p.imponibile),
    iva: escapeHtml(p.iva),
    totaleLordo: escapeHtml(p.totaleLordo),
    sconto: escapeHtml(p.sconto),
    totale: escapeHtml(p.totale),
    voci: (p.voci || []).map((v) => ({
      ...v,
      nome: escapeHtml(v.nome),
      descrizione: escapeHtml(v.descrizione),
      prezzo: escapeHtml(v.prezzo),
      totale: escapeHtml(v.totale),
      dettagli: (v.dettagli || []).map(escapeHtml),
    })),
    rimborsi: (p.rimborsi || []).map((r) => ({
      ...r,
      nome: escapeHtml(r.nome),
      dettaglio: escapeHtml(r.dettaglio),
      tipo: escapeHtml(r.tipo),
      importo: escapeHtml(r.importo),
    })),
    pagamentoRate: p.pagamentoRate
      ? {
          ...p.pagamentoRate,
          numero: escapeHtml(p.pagamentoRate.numero),
          importoAcconto: escapeHtml(p.pagamentoRate.importoAcconto),
          importoSaldo: escapeHtml(p.pagamentoRate.importoSaldo),
          importoRata: escapeHtml(p.pagamentoRate.importoRata),
          ultimaRata: escapeHtml(p.pagamentoRate.ultimaRata),
          scadenza: escapeHtml(p.pagamentoRate.scadenza),
        }
      : p.pagamentoRate,
  }
}

function generaHTML(testo, template, dati) {
  const {
    logo,
    colore,
    nascondiPrezzi,
  } = dati
  const nome = escapeHtml(dati.nome)
  const citta = escapeHtml(dati.citta)
  const piva = escapeHtml(dati.piva)
  const telefono = escapeHtml(dati.telefono)
  const notePagamento = escapeHtml(dati.notePagamento)
  const firmaNome = escapeHtml(dati.firmaNome)
  const numeroPreventivo = escapeHtml(dati.numeroPreventivo)
  const clienteDati = escapeClienteDati(dati.clienteDati)
  const testoEscapato = escapeHtml(testo)
  const data = new Date().toLocaleDateString('it-IT')
  const logoHtml = logo ? `<img src="${logo}" style="max-height:60px;max-width:180px;object-fit:contain;" />` : ''
  const p = escapeParsedPreventivo(parsaPreventivo(testo))
  const coloreHex = colore.startsWith('#') ? colore : `#${colore}`
  const canoneMensileHtml = p.canoneMensile ? (() => {
    const righe = [
      p.canoneMensile,
      p.canoneScadenza ? `Primo canone: ${p.canoneScadenza}` : '',
    ].filter(Boolean).join('<br>')
    return `<div style="margin-top:12px;padding:12px 16px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;font-size:12px;color:#3730a3"><strong>Canone mensile:</strong><br>${righe}</div>`
  })() : ''
  const pagamentoRateHtml = p.pagamentoRate && p.pagamentoRate.numero ? (() => {
    const isAccontoSaldo = p.pagamentoRate.numero === 'Acconto + saldo'
      && p.pagamentoRate.importoAcconto
      && p.pagamentoRate.importoSaldo
    const righe = isAccontoSaldo
      ? [`Acconto: ${p.pagamentoRate.importoAcconto} · Saldo: ${p.pagamentoRate.importoSaldo}`]
      : [
        p.pagamentoRate.numero,
        p.pagamentoRate.importoRata ? `Importo rata: ${p.pagamentoRate.importoRata}` : '',
        p.pagamentoRate.ultimaRata ? `Ultima rata: ${p.pagamentoRate.ultimaRata}` : '',
        p.pagamentoRate.scadenza ? `Scadenza prima rata: ${p.pagamentoRate.scadenza}` : '',
      ].filter(Boolean)
    return `<div style="margin-top:12px;padding:12px 16px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:6px;font-size:12px;color:#065f46"><strong>Pagamento a rate:</strong><br>${righe.join('<br>')}</div>`
  })() : ''
  const extraPagamentoHtml = `${canoneMensileHtml}${pagamentoRateHtml}`

  const rimborsiHtml = p.rimborsi && p.rimborsi.length > 0 ? `
    <div style="margin-top:20px;margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB">Rimborso spese</div>
      ${p.rimborsi.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#F9FAFB;border-radius:6px;margin-bottom:4px;border:1px solid #E5E7EB">
          <div>
            <div style="font-size:12px;font-weight:600;color:#374151">${r.nome}</div>
            <div style="font-size:11px;color:#9CA3AF;margin-top:2px">${r.dettaglio} · <span style="color:${r.tipo === 'Esente' ? '#059669' : '#D97706'}">${r.tipo}</span></div>
          </div>
          <div style="font-size:13px;font-weight:700;color:#374151">${r.importo || ''}</div>
        </div>
      `).join('')}
    </div>
  ` : ''

function tabellaVoci(sfondoHeader, testoHeader, sfondoRiga, sfondoAlt, testoPrimario, testoSecondario, fontFamily) {
    if (p.voci.length === 0) return `<div style="font-family:${fontFamily};font-size:13px;white-space:pre-wrap;color:${testoPrimario};line-height:1.9">${testoEscapato}</div>`
    if (nascondiPrezzi) {
      const righe = p.voci.map((v, i) => {
        const dettagliHtml = v.dettagli && v.dettagli.length > 0
          ? `<div style="margin-top:5px">${v.dettagli.map(d => `<div style="font-size:11px;color:${testoSecondario};padding-left:4px"> ${d}</div>`).join('')}</div>`
          : ''
        const descHtml1 = v.descrizione ? `<div style="font-size:11px;color:${testoSecondario};margin-top:3px;font-style:italic">${v.descrizione}</div>` : ''
        return `<tr data-paginate="servizio-row" style="background:${i % 2 === 0 ? sfondoRiga : sfondoAlt}"><td style="padding:10px 14px;font-size:13px;color:${testoPrimario};vertical-align:top"><strong>${v.nome}</strong>${descHtml1}${dettagliHtml}</td></tr>`
      }).join('')
      return `<div data-section="servizi"><table style="width:100%;border-collapse:collapse;font-family:${fontFamily};margin-bottom:20px"><thead><tr style="background:${sfondoHeader}"><th style="padding:10px 14px;font-size:11px;font-weight:700;color:${testoHeader};text-align:left;letter-spacing:1px;text-transform:uppercase">Servizio incluso</th></tr></thead><tbody>${righe}</tbody></table></div>`
    }
    const righe = p.voci.map((v, i) => {
      const dettagliHtml = v.dettagli && v.dettagli.length > 0
        ? `<div style="margin-top:5px">${v.dettagli.map(d => `<div style="font-size:11px;color:${testoSecondario};padding-left:4px"> ${d}</div>`).join('')}</div>`
        : ''
      const descHtml2 = v.descrizione ? `<div style="font-size:11px;color:${testoSecondario};margin-top:3px;font-style:italic">${v.descrizione}</div>` : ''
      return `<tr data-paginate="servizio-row" style="background:${i % 2 === 0 ? sfondoRiga : sfondoAlt}"><td style="padding:10px 14px;font-size:13px;color:${testoPrimario};vertical-align:top"><strong>${v.nome}</strong>${descHtml2}${dettagliHtml}</td><td style="padding:10px 14px;font-size:13px;color:${testoSecondario};text-align:right;vertical-align:top">${v.prezzo ? '' + v.prezzo : ''}</td><td style="padding:10px 14px;font-size:13px;color:${testoPrimario};text-align:right;font-weight:600;vertical-align:top">${v.totale ? '' + v.totale : ''}</td></tr>`
    }).join('')
    return `<div data-section="servizi"><table style="width:100%;border-collapse:collapse;font-family:${fontFamily};margin-bottom:20px"><thead><tr style="background:${sfondoHeader}"><th style="padding:10px 14px;font-size:11px;font-weight:700;color:${testoHeader};text-align:left;letter-spacing:1px;text-transform:uppercase">Servizio</th><th style="padding:10px 14px;font-size:11px;font-weight:700;color:${testoHeader};text-align:right;letter-spacing:1px;text-transform:uppercase">Prezzo</th><th style="padding:10px 14px;font-size:11px;font-weight:700;color:${testoHeader};text-align:right;letter-spacing:1px;text-transform:uppercase">Totale</th></tr></thead><tbody>${righe}</tbody></table></div>`
  }

  function righeTotaleLordoESconto(coloreTestoBarrato) {
    return `${p.totaleLordo ? `
    <div style="display:flex;justify-content:space-between;font-size:12px;
      color:${coloreTestoBarrato};margin-bottom:4px;text-decoration:line-through">
      <span>Totale</span><span>${p.totaleLordo}</span>
    </div>` : ''}${p.sconto ? `
    <div style="display:flex;justify-content:space-between;font-size:12px;
      color:#0E9F8E;font-weight:600;margin-bottom:6px">
      <span>Sconto</span><span>-${p.sconto}</span>
    </div>` : ''}`
  }

  function riepilogoTotali(align, fontFamily, coloreTesto, coloreAccento, sfondo) {
    if (!p.totale && !p.imponibile) return ''
    return `<div style="display:flex;justify-content:${align};margin-top:8px"><div style="background:${sfondo};border-radius:8px;padding:12px 20px;min-width:220px;font-family:${fontFamily}">${p.imponibile ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:${coloreTesto};margin-bottom:6px"><span>Imponibile</span><span>${p.imponibile}</span></div>` : ''}${p.iva ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:${coloreTesto};margin-bottom:10px"><span>${p.iva.split(':')[0]}</span><span>${p.iva.split(':')[1] ? p.iva.split(':')[1].trim() : ''}</span></div>` : ''}${righeTotaleLordoESconto(`${coloreTesto}80`)}${p.totale ? `<div style="display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:700;color:${coloreAccento};border-top:1px solid ${coloreTesto}20;padding-top:8px;padding-bottom:8px"><span>TOTALE</span><span>${p.totale}</span></div>` : ''}</div></div>`
  }

  function bloccoFooter(contenuto) {
    return `<div id="preventivo-footer-block" data-section="footer">${contenuto}</div>`
  }

  function testoSinistraPageFooter(tmpl, { nome, citta, telefono, numeroPreventivo }) {
    const parti = []
    if (numeroPreventivo) parti.push(numeroPreventivo)
    if (tmpl === 'minimal_dark' && telefono) {
      parti.push(telefono)
    } else {
      if (nome) parti.push(nome)
      if (citta && tmpl !== 'bold') parti.push(citta)
    }
    return parti.join(' · ')
  }

  function stilePageFooterTemplate(tmpl, coloreHex) {
    const base = 'justify-content:space-between;align-items:center;width:100%;box-sizing:border-box;padding:6px 0;'
    const map = {
      pulito: `${base}font-size:11px;color:#aaa;border-top:1px solid #eee;`,
      classico: `${base}font-size:11px;color:#999;font-style:italic;border-top:1px solid #ddd;`,
      bold: `${base}font-size:11px;color:#999;border-top:1px solid #eee;`,
      minimal_dark: `${base}font-size:10px;color:#64748b;border-top:1px solid #e2e8f0;`,
      artigiano: `${base}font-size:11px;color:#8b6355;font-style:italic;border-top:3px double ${coloreHex};`,
    }
    return map[tmpl] || map.pulito
  }

  function bloccoPageFooter(tmpl, opts) {
    const { nome, citta, telefono, numeroPreventivo, data, coloreHex } = opts
    const sinistra = testoSinistraPageFooter(tmpl, { nome, citta, telefono, numeroPreventivo })
    const stile = stilePageFooterTemplate(tmpl, coloreHex)
    const inner = `<span data-footer-left>${sinistra}</span><span data-footer-right>Documento generato il ${data} · Pagina <span data-page-current>1</span> di <span data-page-total>1</span></span>`
    return `<div data-section="page-footer" data-page-footer-template="true" style="display:none;${stile}">${inner}</div>`
  }

  const contattiAzienda = [citta, piva ? `P.IVA ${piva}` : '', telefono].filter(Boolean).join(' | ')

  const templates = {
    pulito: `<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',Arial,sans-serif;padding:48px;color:#1a1a2e;background:#fff;font-size:13px;line-height:1.6}</style><div data-paginate="intro-block"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:2px solid ${coloreHex}"><div>${logoHtml ? `<div style="margin-bottom:10px">${logoHtml}</div>` : ''}<div style="font-size:20px;font-weight:700;color:${coloreHex};letter-spacing:-0.5px">${nome}</div><div style="font-size:11px;color:#888;margin-top:4px;line-height:1.8">${contattiAzienda}</div></div><div style="text-align:right;font-size:11px;color:#888;line-height:1.8"><div style="font-size:22px;font-weight:700;color:${coloreHex};letter-spacing:-0.5px;margin-bottom:6px">PREVENTIVO</div>${numeroPreventivo ? `<div style="font-size:10px;color:#aaa;margin-bottom:4px;letter-spacing:1px">${numeroPreventivo}</div>` : ""}<div>Data: <strong>${data}</strong></div><div>Validit: ${p.validita || '30 giorni'}</div></div></div>${clienteDati ? `<div style="margin-bottom:24px;padding:14px 16px;background:#f8f9fa;border-radius:8px;border-left:3px solid ${coloreHex}"><div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:1px;margin-bottom:6px">INTESTATO A</div><div style="font-size:14px;font-weight:600;color:#1a1a2e">${clienteDati.nome}</div>${clienteDati.indirizzo ? `<div style="font-size:12px;color:#6B7280;margin-top:2px">${clienteDati.indirizzo}</div>` : ''}${clienteDati.email ? `<div style="font-size:12px;color:#6B7280;margin-top:1px">${clienteDati.email}</div>` : ''}${clienteDati.telefono ? `<div style="font-size:12px;color:#6B7280;margin-top:1px">${clienteDati.telefono}</div>` : ''}</div>` : ''}${p.problema ? `<div style="background:#f8f9fa;border-left:3px solid ${coloreHex};padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;font-size:13px;color:#444">${p.problema}</div>` : ''}</div>${tabellaVoci(coloreHex, '#fff', '#fff', '#f8f9fa', '#1a1a2e', '#666', "'Inter',Arial,sans-serif")}${bloccoFooter(`${rimborsiHtml}${riepilogoTotali('flex-end', "'Inter',Arial,sans-serif", '#666', coloreHex, '#f8f9fa')}${p.note ? `<div style="margin-top:24px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e"><strong>Note:</strong> ${p.note}</div>` : ''}${extraPagamentoHtml}${p.pagamento ? `<div style="margin-top:12px;padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:12px;color:#166534"><strong> Pagamento:</strong> ${p.pagamento}</div>` : ''}${notePagamento ? `<div style="margin-top:12px;padding:12px 16px;background:#f8f9fa;border-radius:6px;font-size:12px;color:#6B7280"> ${notePagamento}</div>` : ''}${firmaNome ? `<div style="margin-top:24px;text-align:right;font-size:20px;color:#374151;font-family:'Dancing Script',cursive;font-style:italic">${firmaNome}</div>` : ''}`)}`,

    classico: `<style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Serif+4:wght@300;400;600&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Source Serif 4',Georgia,serif;padding:48px;color:#1a1a1a;background:#fff}</style><div data-paginate="intro-block"><div style="text-align:center;border:2px solid ${coloreHex};padding:24px;margin-bottom:32px;border-radius:4px">${logoHtml ? `<div style="margin-bottom:12px">${logoHtml}</div>` : ''}<div style="font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:${coloreHex}">${nome}</div><div style="font-size:11px;color:#666;margin-top:6px">${contattiAzienda}</div></div><div style="display:flex;justify-content:space-between;margin-bottom:28px"><div style="font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:700;color:${coloreHex};letter-spacing:2px;text-transform:uppercase;border-bottom:2px solid ${coloreHex};padding-bottom:6px">Preventivo</div><div style="text-align:right;font-size:11px;color:#666;line-height:1.9">${numeroPreventivo ? `<div style="font-size:10px;color:#aaa;letter-spacing:1px;margin-bottom:2px">${numeroPreventivo}</div>` : ""}Data: ${data}<br>Validit: ${p.validita || '30 giorni'}</div></div>${clienteDati ? `<div style="margin-bottom:24px;padding:14px 16px;background:#f8f9fa;border-radius:8px;border-left:3px solid ${coloreHex}"><div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:1px;margin-bottom:6px">INTESTATO A</div><div style="font-size:14px;font-weight:600;color:#1a1a2e">${clienteDati.nome}</div>${clienteDati.indirizzo ? `<div style="font-size:12px;color:#6B7280;margin-top:2px">${clienteDati.indirizzo}</div>` : ''}${clienteDati.email ? `<div style="font-size:12px;color:#6B7280;margin-top:1px">${clienteDati.email}</div>` : ''}${clienteDati.telefono ? `<div style="font-size:12px;color:#6B7280;margin-top:1px">${clienteDati.telefono}</div>` : ''}</div>` : ''}${p.problema ? `<div style="font-style:italic;color:#555;margin-bottom:20px;font-size:13px;padding:10px 0;border-bottom:1px solid #eee">${p.problema}</div>` : ''}</div>${tabellaVoci(coloreHex, '#fff', '#fff', '#fafafa', '#1a1a1a', '#555', "'Source Serif 4',Georgia,serif")}${bloccoFooter(`${rimborsiHtml}${riepilogoTotali('flex-end', "'Source Serif 4',Georgia,serif", '#555', coloreHex, '#f9f9f9')}${p.note ? `<div style="margin-top:20px;font-size:12px;color:#666;font-style:italic"><strong>Note:</strong> ${p.note}</div>` : ''}${extraPagamentoHtml}${p.pagamento ? `<div style="margin-top:12px;padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:12px;color:#166534"><strong> Pagamento:</strong> ${p.pagamento}</div>` : ''}${notePagamento ? `<div style="margin-top:12px;padding:12px 16px;background:#f9f9f9;border-radius:6px;font-size:12px;color:#6B7280"> ${notePagamento}</div>` : ""}${firmaNome ? `<div style="margin-top:24px;text-align:right;font-size:20px;color:#555;font-family:'Dancing Script',cursive;font-style:italic">${firmaNome}</div>` : ""}`)}`,

    bold: `<style>@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Montserrat',Arial,sans-serif;margin:0;padding:0;color:#1a1a1a;background:#fff}</style><div data-paginate="intro-block"><div style="background:${coloreHex};padding:36px 48px">${logoHtml ? `<div style="margin-bottom:12px">${logoHtml}</div>` : ''}<div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-1px">${nome}</div><div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px">${contattiAzienda}</div></div><div style="background:#f8f9fa;padding:20px 48px;display:flex;justify-content:space-between;align-items:center;margin-bottom:32px"><div style="font-size:22px;font-weight:800;color:${coloreHex};text-transform:uppercase;letter-spacing:1px">Preventivo</div><div style="font-size:11px;color:#666;text-align:right;line-height:1.8">${numeroPreventivo ? `<div style="font-size:10px;color:#aaa;letter-spacing:1px;margin-bottom:2px">${numeroPreventivo}</div>` : ""}Data: <strong>${data}</strong><br>Validit: ${p.validita || '30 giorni'}</div></div></div><div style="padding:0 48px">${clienteDati ? `<div style="margin-bottom:24px;padding:14px 16px;background:#f8f9fa;border-radius:8px;border-left:3px solid ${coloreHex}"><div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:0.8px;margin-bottom:6px;white-space:nowrap">INTESTATO A</div><div style="font-size:14px;font-weight:600;color:#1a1a2e">${clienteDati.nome}</div>${clienteDati.indirizzo ? `<div style="font-size:12px;color:#6B7280;margin-top:2px">${clienteDati.indirizzo}</div>` : ''}${clienteDati.email ? `<div style="font-size:12px;color:#6B7280;margin-top:1px">${clienteDati.email}</div>` : ''}${clienteDati.telefono ? `<div style="font-size:12px;color:#6B7280;margin-top:1px">${clienteDati.telefono}</div>` : ''}</div>` : ''}${p.problema ? `<div style="background:${coloreHex}15;border-left:4px solid ${coloreHex};padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;font-size:13px;font-weight:500;color:#333">${p.problema}</div>` : ''}${tabellaVoci(coloreHex, '#fff', '#fff', '#f8f9fa', '#1a1a1a', '#666', "'Montserrat',Arial,sans-serif")}</div>${bloccoFooter(`<div style="padding:0 48px">${rimborsiHtml}${riepilogoTotali('flex-end', "'Montserrat',Arial,sans-serif", '#666', coloreHex, coloreHex + '10')}${p.note ? `<div style="margin-top:20px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e"><strong>Note:</strong> ${p.note}</div>` : ''}${extraPagamentoHtml}${p.pagamento ? `<div style="margin-top:12px;padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:12px;color:#166534"><strong> Pagamento:</strong> ${p.pagamento}</div>` : ''}${notePagamento ? `<div style="margin-top:12px;padding:12px 16px;background:#f8f9fa;border-radius:6px;font-size:12px;color:#6B7280"> ${notePagamento}</div>` : ""}${firmaNome ? `<div style="margin-top:24px;padding:0 0 24px 0;text-align:right;font-size:20px;color:#374151;font-family:'Dancing Script',cursive;font-style:italic">${firmaNome}</div>` : ""}</div>`)}`,

    minimal_dark: `<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#0d1b2a;color:#e2e8f0}</style><div data-paginate="intro-block"><div style="padding:40px 48px;border-bottom:1px solid rgba(255,255,255,0.1)">${logoHtml ? `<div style="margin-bottom:12px">${logoHtml}</div>` : ''}<div style="display:flex;justify-content:space-between;align-items:flex-end"><div><div style="font-size:20px;font-weight:300;letter-spacing:3px;text-transform:uppercase;color:#fff">${nome}</div><div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px;letter-spacing:1px">${contattiAzienda}</div></div><div style="text-align:right"><div style="font-size:18px;font-weight:600;color:#0e9f8e;letter-spacing:2px;text-transform:uppercase">Preventivo</div>${numeroPreventivo ? `<div style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:1px;margin-top:2px">${numeroPreventivo}</div>` : ""}<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">${data}  Validit ${p.validita || '30 giorni'}</div></div></div></div></div><div style="padding:36px 48px;background:#111827">${clienteDati ? `<div style="margin-bottom:24px;padding:14px 16px;background:rgba(255,255,255,0.05);border-radius:8px;border-left:3px solid #0e9f8e"><div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:1px;margin-bottom:6px;white-space:nowrap">INTESTATO A</div><div style="font-size:14px;font-weight:600;color:#e2e8f0">${clienteDati.nome}</div>${clienteDati.indirizzo ? `<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px">${clienteDati.indirizzo}</div>` : ''}${clienteDati.email ? `<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:1px">${clienteDati.email}</div>` : ''}${clienteDati.telefono ? `<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:1px">${clienteDati.telefono}</div>` : ''}</div>` : ''}${p.problema ? `<div style="color:rgba(255,255,255,0.6);font-size:13px;margin-bottom:24px;padding:12px 16px;border:1px solid rgba(255,255,255,0.1);border-radius:6px">${p.problema}</div>` : ''}${nascondiPrezzi ? `<div data-section="servizi"><table style="width:100%;border-collapse:collapse;margin-bottom:20px"><thead><tr style="border-bottom:1px solid rgba(255,255,255,0.15)"><th style="padding:10px 0;font-size:10px;font-weight:600;color:rgba(255,255,255,0.35);text-align:left;letter-spacing:2px;text-transform:uppercase">DESCRIZIONE</th></tr></thead><tbody>${p.voci.map(v => `<tr data-paginate="servizio-row" style="border-bottom:1px solid rgba(255,255,255,0.06)"><td style="padding:12px 0;font-size:13px;color:#e2e8f0;vertical-align:top"><strong>${v.nome}</strong>${v.descrizione ? '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:3px;font-style:italic">' + v.descrizione + '</div>' : ''}${v.dettagli && v.dettagli.length > 0 ? v.dettagli.map(d => '<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px;padding-left:4px"> ' + d + '</div>').join('') : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div data-section="servizi"><table style="width:100%;border-collapse:collapse;margin-bottom:20px"><thead><tr style="border-bottom:1px solid rgba(255,255,255,0.15)"><th style="padding:10px 0;font-size:10px;font-weight:600;color:rgba(255,255,255,0.35);text-align:left;letter-spacing:2px;text-transform:uppercase">DESCRIZIONE</th><th style="padding:10px 0;font-size:10px;font-weight:600;color:rgba(255,255,255,0.35);text-align:right;letter-spacing:2px;text-transform:uppercase">PREZZO</th><th style="padding:10px 0;font-size:10px;font-weight:600;color:rgba(255,255,255,0.35);text-align:right;letter-spacing:2px;text-transform:uppercase">TOTALE</th></tr></thead><tbody>${p.voci.map(v => `<tr data-paginate="servizio-row" style="border-bottom:1px solid rgba(255,255,255,0.06)"><td style="padding:12px 0;font-size:13px;color:#e2e8f0;vertical-align:top"><strong>${v.nome}</strong>${v.descrizione ? '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:3px;font-style:italic">' + v.descrizione + '</div>' : ''}${v.dettagli && v.dettagli.length > 0 ? v.dettagli.map(d => '<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px;padding-left:4px"> ' + d + '</div>').join('') : ''}</td><td style="padding:12px 0;font-size:13px;color:rgba(255,255,255,0.5);text-align:right;vertical-align:top">${v.prezzo ? '' + v.prezzo : ''}</td><td style="padding:12px 0;font-size:13px;color:#0e9f8e;font-weight:600;text-align:right;vertical-align:top">${v.totale ? '' + v.totale : ''}</td></tr>`).join('')}</tbody></table></div>`}</div>${bloccoFooter(`<div style="padding:0 48px;background:#111827">${rimborsiHtml}${p.totale ? `<div style="display:flex;justify-content:flex-end"><div style="min-width:200px">${p.imponibile ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:6px"><span>Imponibile</span><span>${p.imponibile}</span></div>` : ''}${p.iva ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:10px"><span>${p.iva.split(':')[0]}</span><span>${p.iva.split(':')[1] ? p.iva.split(':')[1].trim() : ''}</span></div>` : ''}${righeTotaleLordoESconto('rgba(255,255,255,0.25)')}<div style="display:flex;justify-content:space-between;font-size:16px;font-weight:600;color:#0e9f8e;border-top:1px solid rgba(255,255,255,0.1);padding-top:10px;margin-top:4px"><span>TOTALE</span><span>${p.totale}</span></div></div></div>` : ''}${p.note ? `<div style="margin-top:24px;padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:12px;color:rgba(255,255,255,0.6)"><strong>Note:</strong> ${p.note}</div>` : ''}${extraPagamentoHtml}${p.pagamento ? `<div style="margin-top:12px;padding:12px 16px;background:rgba(14,159,142,0.1);border:1px solid rgba(14,159,142,0.3);border-radius:6px;font-size:12px;color:#0e9f8e"><strong> Pagamento:</strong> ${p.pagamento}</div>` : ''}${notePagamento ? `<div style="margin-top:12px;padding:12px 16px;background:rgba(255,255,255,0.05);border-radius:6px;font-size:12px;color:rgba(255,255,255,0.4)"> ${notePagamento}</div>` : ""}${firmaNome ? `<div style="margin-top:24px;text-align:right;font-size:20px;color:rgba(255,255,255,0.7);font-family:'Dancing Script',cursive;font-style:italic">${firmaNome}</div>` : ""}</div>`)}`,

    artigiano: `<style>@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Lora',Georgia,serif;padding:48px;color:#2c1810;background:#fdfaf5}</style><div data-paginate="intro-block"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px double ${coloreHex}"><div>${logoHtml ? `<div style="margin-bottom:10px">${logoHtml}</div>` : ''}<div style="font-size:22px;font-weight:600;color:${coloreHex};font-style:italic">${nome}</div><div style="font-size:11px;color:#8b6355;margin-top:4px;line-height:1.8">${contattiAzienda}</div></div><div style="text-align:right;font-size:11px;color:#8b6355;line-height:1.8">Data: ${data}<br>Validit: ${p.validita || '30 giorni'}</div></div><div style="font-size:18px;font-weight:600;color:${coloreHex};font-style:italic;margin-bottom:4px;text-align:center">~ Preventivo ~</div>${numeroPreventivo ? `<div style="font-size:10px;color:#8b6355;text-align:center;letter-spacing:1px;margin-bottom:16px">${numeroPreventivo}</div>` : ""}${clienteDati ? `<div style="margin-bottom:20px;padding:14px 16px;background:#fdf3e7;border-radius:8px;border-left:3px solid ${coloreHex}"><div style="font-size:10px;font-weight:700;color:#8b6355;letter-spacing:1px;margin-bottom:6px">INTESTATO A</div><div style="font-size:14px;font-weight:600;color:#2c1810;font-style:italic">${clienteDati.nome}</div>${clienteDati.indirizzo ? `<div style="font-size:12px;color:#8b6355;margin-top:2px">${clienteDati.indirizzo}</div>` : ''}${clienteDati.email ? `<div style="font-size:12px;color:#8b6355;margin-top:1px">${clienteDati.email}</div>` : ''}${clienteDati.telefono ? `<div style="font-size:12px;color:#8b6355;margin-top:1px">${clienteDati.telefono}</div>` : ''}</div>` : ''}${p.problema ? `<div style="font-style:italic;color:#5c3d2e;margin-bottom:20px;padding:12px 16px;border-left:3px solid ${coloreHex};background:#fdf3e7;font-size:13px">${p.problema}</div>` : ''}</div>${nascondiPrezzi ? `<div data-section="servizi"><table style="width:100%;border-collapse:collapse;margin-bottom:20px"><thead><tr style="background:${coloreHex};color:#fff"><th style="padding:10px 14px;font-size:11px;font-weight:600;text-align:left;letter-spacing:1px">Descrizione</th></tr></thead><tbody>${p.voci.map((v, i) => `<tr data-paginate="servizio-row" style="background:${i % 2 === 0 ? '#fff' : '#fdf3e7'}"><td style="padding:10px 14px;font-size:13px;color:#2c1810;vertical-align:top"><strong>${v.nome}</strong>${v.descrizione ? '<div style="font-size:11px;color:#8b6355;margin-top:3px;font-style:italic">' + v.descrizione + '</div>' : ''}${v.dettagli && v.dettagli.length > 0 ? v.dettagli.map(d => '<div style="font-size:11px;color:#8b6355;margin-top:2px;padding-left:4px"> ' + d + '</div>').join('') : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div data-section="servizi"><table style="width:100%;border-collapse:collapse;margin-bottom:20px"><thead><tr style="background:${coloreHex};color:#fff"><th style="padding:10px 14px;font-size:11px;font-weight:600;text-align:left;letter-spacing:1px">Descrizione</th><th style="padding:10px 14px;font-size:11px;font-weight:600;text-align:right;letter-spacing:1px">Prezzo</th><th style="padding:10px 14px;font-size:11px;font-weight:600;text-align:right;letter-spacing:1px">Totale</th></tr></thead><tbody>${p.voci.map((v, i) => `<tr data-paginate="servizio-row" style="background:${i % 2 === 0 ? '#fff' : '#fdf3e7'}"><td style="padding:10px 14px;font-size:13px;color:#2c1810;vertical-align:top"><strong>${v.nome}</strong>${v.descrizione ? '<div style="font-size:11px;color:#8b6355;margin-top:3px;font-style:italic">' + v.descrizione + '</div>' : ''}${v.dettagli && v.dettagli.length > 0 ? v.dettagli.map(d => '<div style="font-size:11px;color:#8b6355;margin-top:2px;padding-left:4px"> ' + d + '</div>').join('') : ''}</td><td style="padding:10px 14px;font-size:13px;color:#8b6355;text-align:right;vertical-align:top">${v.prezzo ? '' + v.prezzo : ''}</td><td style="padding:10px 14px;font-size:13px;font-weight:600;color:${coloreHex};text-align:right;vertical-align:top">${v.totale ? '' + v.totale : ''}</td></tr>`).join('')}</tbody></table></div>`}${bloccoFooter(`${rimborsiHtml}${p.totale ? `<div style="display:flex;justify-content:flex-end"><div style="background:#fdf3e7;border:1px solid ${coloreHex}40;border-radius:6px;padding:14px 18px;min-width:200px">${p.imponibile ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#8b6355;margin-bottom:6px"><span>Imponibile</span><span>${p.imponibile}</span></div>` : ''}${p.iva ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#8b6355;margin-bottom:10px"><span>${p.iva.split(':')[0]}</span><span>${p.iva.split(':')[1] ? p.iva.split(':')[1].trim() : ''}</span></div>` : ''}${righeTotaleLordoESconto('#8b635580')}<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:600;color:${coloreHex};border-top:1px solid ${coloreHex}40;padding-top:10px;margin-top:4px;font-style:italic"><span>Totale</span><span>${p.totale}</span></div></div></div>` : ''}${p.note ? `<div style="margin-top:20px;padding:12px 16px;background:#fdf3e7;border:1px dashed ${coloreHex}80;border-radius:6px;font-size:12px;color:#5c3d2e;font-style:italic"><strong>Note:</strong> ${p.note}</div>` : ''}${extraPagamentoHtml}${p.pagamento ? `<div style="margin-top:12px;padding:12px 16px;background:#fdf3e7;border:1px dashed #8b635580;border-radius:6px;font-size:12px;color:#5c3d2e;font-style:italic"><strong> Pagamento:</strong> ${p.pagamento}</div>` : ''}${notePagamento ? `<div style="margin-top:12px;padding:12px 16px;background:#fdf3e7;border-radius:6px;font-size:12px;color:#8b6355"> ${notePagamento}</div>` : ""}${firmaNome ? `<div style="margin-top:24px;text-align:right;font-size:20px;color:#5c3d2e;font-family:'Dancing Script',cursive;font-style:italic">${firmaNome}</div>` : ""}`)}`,
  }

  const pageBreakScript = generaPageBreakScript()
  const pageFooterHtml = bloccoPageFooter(template, { nome, citta, telefono, numeroPreventivo, data, coloreHex })

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=500, initial-scale=0.7, shrink-to-fit=yes"><link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" rel="stylesheet"><style>@media print{thead{display:table-row-group}}body{position:relative}</style></head><body>${templates[template] || templates.pulito}${pageFooterHtml}${pageBreakScript}</body></html>`
}

function formattaFirmaDigitaleCliente(firmatoAt, metodoFirma) {
  if (!firmatoAt) return ''
  const d = new Date(firmatoAt)
  if (Number.isNaN(d.getTime())) return ''

  const data = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
  if (metodoFirma === 'manuale') {
    return `Firmato a mano il ${data}`
  }

  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return `Firmato digitalmente il ${data} alle ${ora}`
}

module.exports = { generaHTML, parsaPreventivo, formattaFirmaDigitaleCliente }

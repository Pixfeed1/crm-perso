// backend/services/documentTemplate.js
// Rendu HTML serveur d'un DEVIS ou d'une FACTURE, pour génération PDF via Puppeteer
// (pdfService.generatePDF). Un seul template paramétré par `type` : 'quote' | 'invoice'.
// Charte sobre, mise en page A4, mentions légales FR. Tout est inline (pas d'asset externe).

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const eur = (n) => `${(Number(n) || 0).toFixed(2).replace('.', ',')} €`;
const fdate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return isNaN(x) ? '' : x.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const parseItems = (items) => {
  if (Array.isArray(items)) return items;
  try { const p = JSON.parse(items || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
};

/**
 * @param {'quote'|'invoice'} type
 * @param {object} doc  la ligne devis/facture (q.* / i.*)
 * @param {object} company  company_settings
 * @param {object|null} tvaRegime  { code, label, mention } éventuel
 */
function renderDocument(type, doc, company = {}, tvaRegime = null) {
  const isQuote = type === 'quote';
  const number = isQuote ? doc.quote_number : doc.invoice_number;
  const docLabel = isQuote ? 'DEVIS' : 'FACTURE';

  const items = parseItems(doc.items);
  const rows = items.map((it) => {
    const qty = Number(it.quantity) || 0;
    const pu = Number(it.unit_price) || 0;
    return `<tr>
      <td class="desc">${esc(it.description || '')}</td>
      <td class="num">${qty.toLocaleString('fr-FR')}</td>
      <td class="num">${eur(pu)}</td>
      <td class="num">${eur(qty * pu)}</td>
    </tr>`;
  }).join('');

  const totalHt = Number(doc.total_ht) || 0;
  const tvaAmount = Number(doc.tva_amount) || 0;
  const totalTtc = Number(doc.total_ttc) || 0;
  const discount = Number(doc.discount_amount) || 0;
  const acompte = Number(doc.acompte_amount) || 0;
  // TVA non applicable : régime franchise OU montant de TVA nul avec tva_applicable=false.
  const tvaNonApplicable = doc.tva_applicable === false || (tvaAmount === 0 && (doc.tva_regime === 'FRANCHISE'));
  const mentionTva = (tvaRegime && tvaRegime.mention)
    || (tvaNonApplicable ? 'TVA non applicable, art. 293 B du CGI' : '');

  const company_line2 = [company.postal_code, company.city].filter(Boolean).join(' ');
  const validite = isQuote && doc.validity_days ? `Validité : ${doc.validity_days} jours` : '';
  const echeance = !isQuote && doc.due_date ? `Échéance : ${fdate(doc.due_date)}` : '';

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1f2430; font-size: 12px; margin: 0; padding: 32px 36px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .company h1 { font-size: 18px; margin: 0 0 4px; color: #111827; }
  .company p { margin: 1px 0; color: #4b5563; }
  .doc-meta { text-align: right; }
  .doc-meta .badge { display: inline-block; font-size: 20px; font-weight: 700; letter-spacing: 2px; color: #6d28d9; }
  .doc-meta p { margin: 2px 0; color: #4b5563; }
  .doc-meta .num { font-size: 14px; font-weight: 600; color: #111827; }
  .client { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; margin-bottom: 22px; max-width: 55%; }
  .client .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 4px; }
  .client strong { font-size: 13px; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  table.items th { background: #6d28d9; color: #fff; font-weight: 600; text-align: left; padding: 8px 10px; font-size: 11px; }
  table.items th.num, table.items td.num { text-align: right; }
  table.items td { padding: 8px 10px; border-bottom: 1px solid #eef0f3; vertical-align: top; }
  table.items td.desc { white-space: pre-wrap; }
  .totals { width: 45%; margin-left: auto; }
  .totals tr td { padding: 4px 10px; }
  .totals tr td:last-child { text-align: right; }
  .totals .grand td { border-top: 2px solid #6d28d9; font-size: 14px; font-weight: 700; color: #111827; padding-top: 8px; }
  .totals .muted td { color: #6b7280; }
  .mention { margin-top: 6px; font-style: italic; color: #6b7280; }
  .cgv { margin-top: 26px; border-top: 1px solid #e5e7eb; padding-top: 12px; color: #4b5563; white-space: pre-wrap; font-size: 11px; }
  .cgv h3 { font-size: 12px; color: #374151; margin: 0 0 6px; }
  .foot { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 10px; }
</style></head><body>
  <div class="head">
    <div class="company">
      <h1>${esc(company.company_name || 'Mon entreprise')}</h1>
      ${company.address ? `<p>${esc(company.address)}</p>` : ''}
      ${company_line2 ? `<p>${esc(company_line2)}</p>` : ''}
      ${company.email ? `<p>${esc(company.email)}</p>` : ''}
      ${company.phone ? `<p>${esc(company.phone)}</p>` : ''}
      ${company.siret ? `<p>SIRET : ${esc(company.siret)}</p>` : ''}
    </div>
    <div class="doc-meta">
      <div class="badge">${docLabel}</div>
      <p class="num">${esc(number || '')}</p>
      <p>Date : ${fdate(doc.issue_date || doc.created_at)}</p>
      ${validite ? `<p>${esc(validite)}</p>` : ''}
      ${echeance ? `<p>${esc(echeance)}</p>` : ''}
    </div>
  </div>

  <div class="client">
    <div class="lbl">${isQuote ? 'Devis pour' : 'Facturé à'}</div>
    <strong>${esc(doc.client_name || '')}</strong>
    ${doc.client_address ? `<div>${esc(doc.client_address)}</div>` : ''}
    ${doc.client_email ? `<div>${esc(doc.client_email)}</div>` : ''}
    ${doc.client_siret ? `<div>SIRET : ${esc(doc.client_siret)}</div>` : ''}
  </div>

  ${doc.title ? `<h2 style="font-size:14px;color:#111827;margin:0 0 12px;">${esc(doc.title)}</h2>` : ''}

  <table class="items">
    <thead><tr>
      <th>Désignation</th><th class="num">Qté</th><th class="num">PU HT</th><th class="num">Total HT</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="color:#9ca3af;">Aucune ligne</td></tr>'}</tbody>
  </table>

  <table class="totals">
    ${discount > 0 ? `<tr class="muted"><td>Remise</td><td>- ${eur(discount)}</td></tr>` : ''}
    <tr><td>Total HT</td><td>${eur(totalHt)}</td></tr>
    ${tvaNonApplicable
      ? `<tr class="muted"><td>TVA</td><td>—</td></tr>`
      : `<tr><td>TVA (${(Number(doc.tva_rate) || 0).toFixed(2).replace('.', ',')} %)</td><td>${eur(tvaAmount)}</td></tr>`}
    <tr class="grand"><td>Total TTC</td><td>${eur(totalTtc)}</td></tr>
    ${acompte > 0 ? `<tr class="muted"><td>Acompte</td><td>- ${eur(acompte)}</td></tr>
      <tr class="grand"><td>Net à payer</td><td>${eur(totalTtc - acompte)}</td></tr>` : ''}
  </table>
  ${mentionTva ? `<p class="mention">${esc(mentionTva)}</p>` : ''}

  ${doc.additional_info ? `<div class="cgv"><h3>Informations complémentaires</h3>${esc(doc.additional_info)}</div>` : ''}
  ${doc.cgv && doc.cgv_type !== 'pdf' ? `<div class="cgv"><h3>Conditions générales</h3>${esc(doc.cgv)}</div>` : ''}

  <div class="foot">
    ${esc(company.company_name || '')}${company.siret ? ` · SIRET ${esc(company.siret)}` : ''}
    ${!isQuote ? ' · En cas de retard de paiement, pénalités au taux légal + indemnité forfaitaire de 40 € (art. L441-10 C. com.).' : ''}
  </div>
</body></html>`;
}

module.exports = {
  renderQuote: (doc, company, tvaRegime) => renderDocument('quote', doc, company, tvaRegime),
  renderInvoice: (doc, company, tvaRegime) => renderDocument('invoice', doc, company, tvaRegime),
};

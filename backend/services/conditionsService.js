// backend/services/conditionsService.js
//
// Génère les PDF de "Conditions" (charte cream/serif) via le MÊME moteur Chromium
// que les rapports (pdfService.generatePDF). Les templates HTML sont dans
// templates/conditions/ et contiennent des variables {{...}} injectées ici.

const fs = require('fs');
const path = require('path');
const pdfService = require('./pdfService');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'conditions');

// type -> fichier de template
const TEMPLATE_FILES = {
  'maintenance-essentiel': 'conditions-maintenance-essentiel.html',
  'maintenance-pro': 'conditions-maintenance-pro.html',
  abonnement: 'conditions-abonnement.html'
};

const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// SVG check (inclus) / croix (exclus), identiques à la charte des docs maintenance.
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const CROSS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

// Découpe un texte multi-lignes en lignes non vides.
function toLines(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// Liste "inclus" : <li> avec pastille verte.
function buildIncludedHtml(lines) {
  const items = toLines(lines);
  if (items.length === 0) {
    return `<li><span class="ic">${CHECK_SVG}</span><span class="d">Prestations définies avec le client.</span></li>`;
  }
  return items
    .map((l) => `<li><span class="ic">${CHECK_SVG}</span><span class="d">${escapeHtml(l)}</span></li>`)
    .join('\n        ');
}

// Liste "exclus" : <li> avec pastille grise.
function buildExcludedHtml(lines) {
  const items = toLines(lines);
  if (items.length === 0) {
    return `<li><span class="ic">${CROSS_SVG}</span><span class="d">Toute prestation non listée dans la section « inclus ».</span></li>`;
  }
  return items
    .map((l) => `<li><span class="ic">${CROSS_SVG}</span><span class="d">${escapeHtml(l)}</span></li>`)
    .join('\n        ');
}

// Modalités : chaque ligne "Clé : valeur" -> mod-row ; sinon paragraphe pleine largeur.
function buildModalitesHtml(text) {
  const items = toLines(text);
  if (items.length === 0) return '<p class="mod-p">Conditions communiquées avec le devis.</p>';
  return items
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx > 0 && idx < 40) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        return `<div class="mod-row"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;
      }
      return `<p class="mod-p">${escapeHtml(line)}</p>`;
    })
    .join('\n        ');
}

function loadTemplate(type) {
  const file = TEMPLATE_FILES[type];
  if (!file) {
    throw new Error(`Type de conditions inconnu : ${type}`);
  }
  return fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8');
}

// Remplace toutes les occurrences {{key}} par la valeur fournie (valeurs déjà prêtes/échappées).
function injectVariables(html, variables) {
  let out = html;
  for (const [key, value] of Object.entries(variables)) {
    out = out.split(`{{${key}}}`).join(value == null ? '' : String(value));
  }
  return out;
}

/**
 * Construit le HTML final des conditions selon le type, puis le rend en PDF.
 *
 * @param {string} type - 'maintenance-essentiel' | 'maintenance-pro' | 'abonnement'
 * @param {object} data - variables à injecter (selon le type)
 * @returns {Promise<Buffer>} PDF
 */
async function renderConditionsHtml(type, data = {}) {
  const html = loadTemplate(type);

  if (type === 'abonnement') {
    return injectVariables(html, {
      label: escapeHtml(data.label || 'Abonnement'),
      price: escapeHtml(data.price || ''),
      period: escapeHtml(data.period || ''),
      first_billing_html: data.first_billing
        ? `<p class="doc-meta">Premier prélèvement le <strong>${escapeHtml(data.first_billing)}</strong>, puis à chaque date anniversaire.</p>`
        : '',
      date: escapeHtml(data.date || ''),
      client_name: escapeHtml(data.client_name || ''),
      intro: escapeHtml(data.intro || "Ce document précise le périmètre de l'abonnement, ce qu'il comprend, ce qu'il ne comprend pas, et les modalités applicables."),
      included_html: buildIncludedHtml(data.included),
      excluded_html: buildExcludedHtml(data.excluded),
      modalites_html: buildModalitesHtml(data.modalites)
    });
  }

  // Templates maintenance (contenu fixe) : variables simples.
  return injectVariables(html, {
    client_name: escapeHtml(data.client_name || ''),
    site_url: escapeHtml(data.site_url || ''),
    price: escapeHtml(data.price || ''),
    date: escapeHtml(data.date || '')
  });
}

/**
 * Génère le PDF des conditions (réutilise le moteur Chromium des rapports).
 */
async function renderConditionsPdf(type, data = {}) {
  const html = await renderConditionsHtml(type, data);
  return await pdfService.generatePDF(html);
}

module.exports = {
  renderConditionsPdf,
  renderConditionsHtml
};

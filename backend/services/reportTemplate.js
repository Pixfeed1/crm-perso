// backend/services/reportTemplate.js
//
// Charte réutilisable + générateur HTML du rapport de maintenance.
// - Aucune dépendance réseau au rendu : polices Fraunces embarquées en base64
//   (repli Georgia si absentes), logo lu depuis assets/logo.png (repli texte "Pixfeed").
// - Toutes les données dynamiques sont échappées via escapeHtml avant injection.
// - Pensé pour le PDF (A4) : SVG inline, page-break-inside:avoid sur les blocs.

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');

/** Palette de la charte */
const BRAND = {
  bg: '#FAF6EF',
  ink: '#2B2620',
  muted: '#6F6A60',
  subMuted: '#8A8478',
  faint: '#A39C8E',
  impact: '#7A756A',
  rule: '#E7DFD2',
  violet: '#7C3AED',
  violetDark: '#5B21B6',
  badgeBg: '#F1EAFB',
  badgeBorder: '#D9CFE9',
  perfBorder: '#E2D9F2',
  green: '#2E7D52',
  orange: '#B26B00',
  red: '#C0392B',
  footerBg: '#14181F'
};

/** Échappement HTML maison (aucune dépendance) */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Icônes SVG inline (pas de webfont serveur) */
const icon = {
  check: (color = BRAND.green) =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;"><circle cx="12" cy="12" r="9"></circle><path d="M8 12.5l2.5 2.5L16 9"></path></svg>`,
  bolt: (color = BRAND.violet) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="${color}" stroke="none" style="flex:0 0 auto;"><path d="M13 2L4 14h6l-1 8 10-12h-6l0-8z"></path></svg>`,
  trash: (color = BRAND.violetDark) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 14h10l1-14"></path></svg>`,
  alert: (color = BRAND.orange) =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;"><path d="M12 3l10 18H2L12 3z"></path><path d="M12 10v5"></path><path d="M12 18h.01"></path></svg>`,
  mobile: (color = BRAND.muted) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;"><rect x="7" y="2" width="10" height="20" rx="2"></rect><path d="M11 19h2"></path></svg>`,
  desktop: (color = BRAND.muted) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8"></path><path d="M12 16v4"></path></svg>`
};

/** Couleur d'un score PageSpeed selon les seuils */
function scoreColor(score) {
  const n = Number(score);
  if (n >= 90) return BRAND.green;
  if (n >= 50) return BRAND.orange;
  return BRAND.red;
}

/**
 * Construit le @font-face Fraunces (base64) si les woff2 sont présents,
 * sinon repli propre sur Georgia. Ne casse jamais.
 */
function buildFonts() {
  try {
    const f5 = path.join(FONTS_DIR, 'fraunces-500.woff2');
    const f6 = path.join(FONTS_DIR, 'fraunces-600.woff2');
    if (fs.existsSync(f5) && fs.existsSync(f6)) {
      const b5 = fs.readFileSync(f5).toString('base64');
      const b6 = fs.readFileSync(f6).toString('base64');
      const css =
        `@font-face{font-family:'Fraunces';font-style:normal;font-weight:500;font-display:swap;src:url(data:font/woff2;base64,${b5}) format('woff2');}` +
        `@font-face{font-family:'Fraunces';font-style:normal;font-weight:600;font-display:swap;src:url(data:font/woff2;base64,${b6}) format('woff2');}`;
      return { css, serif: "'Fraunces', Georgia, 'Times New Roman', serif" };
    }
  } catch (e) {
    // repli silencieux
  }
  return { css: '', serif: "Georgia, 'Times New Roman', serif" };
}

/** Logo : <img> base64 depuis assets/logo.png, sinon texte "Pixfeed" */
function buildLogo(serif) {
  try {
    const p = path.join(ASSETS_DIR, 'logo.png');
    if (fs.existsSync(p)) {
      const b = fs.readFileSync(p).toString('base64');
      return `<img src="data:image/png;base64,${b}" alt="Pixfeed" style="height:36px;display:block;" />`;
    }
  } catch (e) {
    // repli silencieux
  }
  return `<span style="font-family:${serif};font-weight:600;font-size:22px;color:${BRAND.ink};">Pixfeed</span>`;
}

/**
 * Génère le HTML complet du rapport de maintenance.
 * Tous les blocs riches sont CONDITIONNELS (masqués si vides).
 */
function renderMaintenanceReport(data) {
  const d = data || {};
  const fonts = buildFonts();
  const serif = fonts.serif;
  const logo = buildLogo(serif);

  const interventions = Array.isArray(d.interventions) ? d.interventions : [];
  const perfTips = Array.isArray(d.perf_tips) ? d.perf_tips.filter(Boolean) : [];
  const recommendations = Array.isArray(d.recommendations) ? d.recommendations : [];
  const psM = d.pagespeed_mobile;
  const psD = d.pagespeed_desktop;
  const hasMobile = psM !== null && psM !== undefined && psM !== '';
  const hasDesktop = psD !== null && psD !== undefined && psD !== '';
  const extCount = d.extensions_count;
  const hasExt = extCount !== null && extCount !== undefined && extCount !== '';

  // --- Interventions ---
  const interventionsHtml = interventions.length
    ? interventions.map(iv => `
        <div class="intervention">
          <div class="iv-head">
            <span class="iv-title">${escapeHtml(iv.title)}</span>
            <span class="iv-date">${escapeHtml(iv.date)}</span>
          </div>
          ${iv.description ? `<p class="iv-desc">${escapeHtml(iv.description)}</p>` : ''}
          ${iv.impact ? `<p class="iv-impact">${escapeHtml(iv.impact)}</p>` : ''}
        </div>`).join('')
    : `<p class="iv-empty">Aucune intervention sur cette période.</p>`;

  // --- Scores PageSpeed ---
  const scoreCell = (label, iconSvg, value) => `
        <div class="score">
          <div class="score-lbl">${iconSvg}<span>${escapeHtml(label)}</span></div>
          <div class="score-val" style="color:${scoreColor(value)};">${escapeHtml(value)}<span class="slash">/100</span></div>
        </div>`;
  const scoresHtml = (hasMobile || hasDesktop)
    ? `<div class="scores">
        ${hasMobile ? scoreCell('PageSpeed Mobile', icon.mobile(), psM) : ''}
        ${hasDesktop ? scoreCell('PageSpeed Desktop', icon.desktop(), psD) : ''}
      </div>`
    : '';

  // --- Bloc pistes performance ---
  const perfHtml = (perfTips.length || d.perf_link)
    ? `<div class="block">
        <div class="block-lbl">${icon.bolt()}<span>Pistes pour gagner en performance</span></div>
        ${perfTips.length ? `<ul>${perfTips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
        ${d.perf_link ? `<a class="link" href="${escapeHtml(d.perf_link)}">Voir le rapport PageSpeed complet →</a>` : ''}
      </div>`
    : '';

  // --- Sauvegardes ---
  const backupsHtml = d.show_backups
    ? `<div class="line-check">${icon.check()}<span>Sauvegardes quotidiennes automatiques — vos données sont protégées.</span></div>`
    : '';

  // --- Extensions ---
  let extHtml = '';
  if (hasExt) {
    const n = Number(extCount);
    if (n <= 10) {
      extHtml = `<div class="line-check">${icon.check()}<span>${escapeHtml(n)} extensions installées — sous le seuil de 10, configuration saine.</span></div>`;
    } else {
      extHtml = `<div class="line-alert">${icon.alert()}<span>${escapeHtml(n)} extensions installées — au-dessus du seuil de 10. Il est recommandé d'en réduire le nombre pour limiter les risques de sécurité et préserver les performances.</span></div>`;
    }
  }

  // --- Recommandations de suppression ---
  const recoHtml = recommendations.length
    ? `<div class="block">
        <div class="block-lbl">${icon.trash()}<span>À optimiser · extensions à supprimer</span></div>
        <ul>${recommendations.map(r => `<li>${escapeHtml(r.name)} — ${escapeHtml(r.reason)}</li>`).join('')}</ul>
        ${d.discuss_link ? `<a class="link" href="${escapeHtml(d.discuss_link)}">En discuter →</a>` : ''}
      </div>`
    : '';

  const hasSiteSection = scoresHtml || perfHtml || backupsHtml || extHtml || recoHtml;
  const siteSectionHtml = hasSiteSection
    ? `<section class="section">
        <h2 class="serif">État du site</h2>
        ${scoresHtml}
        ${perfHtml}
        ${backupsHtml}
        ${extHtml}
        ${recoHtml}
      </section>`
    : '';

  const planBadge = (d.plan_label || d.plan_price || d.plan_price === 0)
    ? `<div class="badge">${escapeHtml(d.plan_label || 'Forfait')}${(d.plan_price || d.plan_price === 0) ? ` · ${escapeHtml(d.plan_price)} €/mois` : ''}</div>`
    : '';

  const css = `
*{margin:0;padding:0;box-sizing:border-box;}
@page{size:A4;margin:0;}
${fonts.css}
body{background:${BRAND.bg};color:${BRAND.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:13px;line-height:1.5;}
.serif{font-family:${serif};}
.report{background:${BRAND.bg};max-width:210mm;margin:0 auto;}
.rep-header{padding:36px 38px;}
.head-row{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;}
.head-title{font-family:${serif};font-weight:600;font-size:31px;line-height:1.05;color:${BRAND.ink};}
.head-sub{font-size:13px;color:${BRAND.subMuted};margin-top:8px;}
.badge{display:inline-block;margin-top:18px;background:${BRAND.badgeBg};border:1px solid ${BRAND.badgeBorder};color:${BRAND.violetDark};font-size:12.5px;font-weight:600;padding:6px 14px;border-radius:999px;}
.rule-violet{width:46px;height:2px;background:${BRAND.violet};margin-top:16px;}
.synthese{display:flex;align-items:flex-start;gap:10px;padding:4px 38px 4px;}
.synthese .txt{font-family:${serif};font-size:16.5px;line-height:1.4;color:${BRAND.ink};}
.stats{display:flex;border-top:1px solid ${BRAND.rule};border-bottom:1px solid ${BRAND.rule};margin:18px 0;}
.stat{flex:1;text-align:center;padding:22px 12px;}
.stat + .stat{border-left:1px solid ${BRAND.rule};}
.stat .num{font-family:${serif};font-weight:600;font-size:26px;color:${BRAND.violetDark};line-height:1;}
.stat .lbl{font-size:12px;color:${BRAND.muted};margin-top:6px;}
.section{padding:6px 38px 20px;}
.section h2{font-size:18px;font-weight:600;color:${BRAND.ink};margin-bottom:14px;}
.intervention{padding:14px 0;border-bottom:1px solid ${BRAND.rule};page-break-inside:avoid;}
.intervention:last-child{border-bottom:none;}
.iv-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;}
.iv-title{font-size:14px;font-weight:700;color:${BRAND.ink};}
.iv-date{font-size:11px;color:${BRAND.faint};white-space:nowrap;}
.iv-desc{font-size:13px;color:${BRAND.muted};margin-top:5px;}
.iv-impact{font-size:12px;font-style:italic;color:${BRAND.impact};margin-top:4px;}
.iv-empty{font-size:13px;color:${BRAND.muted};font-style:italic;}
.scores{display:flex;gap:28px;page-break-inside:avoid;margin-bottom:6px;}
.score{flex:1;}
.score-lbl{display:flex;align-items:center;gap:6px;font-size:11.5px;color:${BRAND.muted};}
.score-val{font-family:${serif};font-weight:600;font-size:29px;margin-top:4px;line-height:1;}
.score-val .slash{color:${BRAND.faint};font-size:15px;font-weight:500;font-family:-apple-system,'Segoe UI',sans-serif;}
.block{page-break-inside:avoid;border-left:3px solid ${BRAND.perfBorder};padding:8px 0 8px 14px;margin-top:16px;}
.block-lbl{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.violetDark};}
.block ul{list-style:none;margin-top:8px;}
.block li{position:relative;padding-left:16px;font-size:13px;color:${BRAND.muted};margin-bottom:4px;}
.block li::before{content:'•';position:absolute;left:0;color:${BRAND.violet};}
.link{display:inline-block;margin-top:8px;color:${BRAND.violet};font-size:13px;font-weight:500;text-decoration:none;}
.line-check,.line-alert{display:flex;align-items:flex-start;gap:8px;font-size:13px;margin-top:12px;page-break-inside:avoid;}
.line-check{color:${BRAND.ink};}
.line-alert{color:${BRAND.orange};}
.closing{padding:18px 38px;border-top:1px solid ${BRAND.rule};font-size:13px;color:${BRAND.muted};}
.rep-footer{background:${BRAND.footerBg};padding:22px 38px;page-break-inside:avoid;}
.rep-footer .fname{color:#ffffff;font-size:11.5px;font-weight:600;}
.rep-footer .fcontact{color:rgba(255,255,255,0.55);font-size:11px;margin-top:4px;}
.rep-footer .fedit{color:rgba(255,255,255,0.55);font-size:10.5px;margin-top:10px;}
`;

  const body = `
  <div class="report">
    <header class="rep-header">
      <div class="head-row">
        <div>
          <div class="head-title">Rapport de maintenance</div>
          <div class="head-sub">${escapeHtml(d.site_url || '')}${d.period_label ? ` · ${escapeHtml(d.period_label)}` : ''}</div>
        </div>
        <div>${logo}</div>
      </div>
      ${planBadge}
      <div class="rule-violet"></div>
    </header>

    ${d.synthese ? `<div class="synthese">${icon.check()}<div class="txt">${escapeHtml(d.synthese)}</div></div>` : ''}

    <div class="stats">
      <div class="stat"><div class="num">${escapeHtml(d.interventions_count != null ? d.interventions_count : 0)}</div><div class="lbl">Interventions</div></div>
      <div class="stat"><div class="num">${escapeHtml(d.updates_count != null ? d.updates_count : 0)}</div><div class="lbl">Mises à jour</div></div>
    </div>

    <section class="section">
      <h2 class="serif">Détail des interventions</h2>
      ${interventionsHtml}
    </section>

    ${siteSectionHtml}

    ${d.closing_text ? `<div class="closing">${escapeHtml(d.closing_text)}</div>` : ''}

    <footer class="rep-footer">
      <div class="fname">Pixfeed</div>
      <div class="fcontact">${escapeHtml([d.phone, d.email, d.site].filter(Boolean).join(' · '))}</div>
      <div class="fedit">Édité le ${escapeHtml(d.edited_date || '')} · © ${escapeHtml(d.year || new Date().getFullYear())} Pixfeed</div>
    </footer>
  </div>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Rapport de maintenance${d.site_url ? ' — ' + escapeHtml(d.site_url) : ''}</title><style>${css}</style></head><body>${body}</body></html>`;
}

/** Formatages internes pour le mapper */
function fmtDateShort(s) {
  if (!s) return '-';
  const dt = new Date(s);
  if (isNaN(dt)) return '-';
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtMonthLabel(s) {
  if (!s) return '';
  const dt = new Date(s);
  if (isNaN(dt)) return '';
  const label = dt.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Mappe un rapport (ligne maintenance_reports + report_data) vers le contrat
 * de données attendu par renderMaintenanceReport. Tolérant aux champs absents.
 */
function buildMaintenanceReportData(report = {}, reportData = {}) {
  const rd = reportData || {};
  const rawInterventions = Array.isArray(rd.interventions) ? rd.interventions : [];

  const interventions = rawInterventions.map(i => ({
    title: i.title || 'Intervention',
    date: fmtDateShort(i.completed_date || i.scheduled_date),
    description: i.description || '',
    impact: i.impact || ''
  }));

  const interventionsCount = report.interventions_count != null
    ? report.interventions_count
    : (rd.summary && rd.summary.interventions_count != null ? rd.summary.interventions_count : interventions.length);

  const updatesCount = (rd.summary && rd.summary.by_type && rd.summary.by_type.update != null)
    ? rd.summary.by_type.update
    : rawInterventions.filter(i => i.type === 'update').length;

  let synthese = rd.synthese;
  if (!synthese) {
    synthese = interventionsCount > 0
      ? `Tout est à jour. ${interventionsCount} intervention${interventionsCount > 1 ? 's' : ''} réalisée${interventionsCount > 1 ? 's' : ''} ce mois-ci.`
      : 'Aucune intervention nécessaire ce mois-ci, votre site a fonctionné normalement.';
  }

  const pickNum = (...vals) => {
    for (const v of vals) {
      if (v !== null && v !== undefined && v !== '') return v;
    }
    return null;
  };

  return {
    site_url: rd.site_url || (rd.project && rd.project.url) || report.site_url || report.project_name || 'votre site',
    period_label: rd.period_label || fmtMonthLabel(report.period_start),
    plan_label: rd.plan_label || report.plan || 'Maintenance',
    plan_price: pickNum(rd.plan_price, report.budget, rd.project && rd.project.budget) ,
    synthese,
    interventions_count: interventionsCount,
    updates_count: updatesCount,
    interventions,
    pagespeed_mobile: pickNum(rd.pagespeed_mobile, report.pagespeed_mobile),
    pagespeed_desktop: pickNum(rd.pagespeed_desktop, report.pagespeed_desktop),
    perf_tips: Array.isArray(rd.perf_tips) ? rd.perf_tips : [],
    perf_link: rd.perf_link || '',
    show_backups: rd.show_backups === true,
    extensions_count: pickNum(rd.extensions_count, report.plugins_count),
    recommendations: Array.isArray(rd.recommendations) ? rd.recommendations : [],
    discuss_link: rd.discuss_link || '',
    closing_text: rd.closing_text || 'Pour toute question concernant ce rapport ou votre contrat de maintenance, vous pouvez répondre directement à cet email.',
    phone: process.env.REPORT_PHONE || '06.45.37.39.30',
    email: process.env.REPORT_FROM || 'contact@pixfeed.net',
    site: 'pixfeed.net',
    edited_date: fmtDateShort(new Date()),
    year: new Date().getFullYear()
  };
}

module.exports = {
  BRAND,
  escapeHtml,
  scoreColor,
  renderMaintenanceReport,
  buildMaintenanceReportData
};

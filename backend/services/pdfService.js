// backend/services/pdfService.js
const puppeteer = require('puppeteer-core');

/**
 * Service de génération de PDF pour les rapports de maintenance
 */
class PDFService {
  constructor() {
    this.browser = null;
  }

  /**
   * Trouve le chemin de Chrome/Chromium installé
   */
  getChromePath() {
    const possiblePaths = [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];

    const fs = require('fs');
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }

    return null;
  }

  /**
   * Initialise le navigateur
   */
  async initBrowser() {
    if (this.browser) return this.browser;

    const chromePath = this.getChromePath();

    if (!chromePath) {
      console.warn('⚠️ Chrome/Chromium non trouvé. Installation requise pour génération PDF.');
      console.warn('   Sur Ubuntu/Debian: sudo apt install chromium-browser');
      console.warn('   Sur CentOS/RHEL: sudo yum install chromium');
      return null;
    }

    try {
      this.browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
      console.log('✅ Navigateur PDF initialisé');
      return this.browser;
    } catch (error) {
      console.error('❌ Erreur initialisation navigateur:', error.message);
      return null;
    }
  }

  /**
   * Génère un PDF à partir d'HTML
   */
  async generatePDF(html, options = {}) {
    const browser = await this.initBrowser();

    if (!browser) {
      throw new Error('Navigateur non disponible pour génération PDF');
    }

    const page = await browser.newPage();

    try {
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        ...options
      });

      return pdfBuffer;
    } finally {
      await page.close();
    }
  }

  /**
   * Génère le HTML du rapport de maintenance (version PDF)
   */
  generateReportHTML(report, data) {
    const typeLabels = {
      'update': 'Mise à jour',
      'backup': 'Sauvegarde',
      'security': 'Sécurité',
      'maintenance': 'Maintenance',
      'support': 'Support',
      'other': 'Autre'
    };

    const formatDuration = (minutes) => {
      if (!minutes) return '-';
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return hours > 0 ? hours + 'h' + (mins > 0 ? mins.toString().padStart(2, '0') : '') : mins + 'min';
    };

    const formatDateShort = (dateString) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
    };

    const formatMonth = (dateString) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('fr-FR', {
        month: 'long', year: 'numeric'
      });
    };

    let interventionsRows = '';
    if (data.interventions && data.interventions.length > 0) {
      interventionsRows = data.interventions.map(i => '<div class="work-item"><div class="work-header"><span class="work-title">' + i.title + '</span><span class="work-date">' + formatDateShort(i.completed_date || i.scheduled_date) + '</span></div>' + (i.description ? '<p class="work-desc">' + i.description + '</p>' : '') + '<div class="work-meta"><span class="work-time">⏱️ ' + formatDuration(i.duration_minutes) + '</span><span class="work-type"><span class="tag tag-' + i.type + '">' + (typeLabels[i.type] || i.type) + '</span></span></div></div>').join('');
    } else {
      interventionsRows = '<p class="no-data">Aucune intervention sur cette période</p>';
    }

    const forfaitMensuel = report.budget || data.project?.budget || 0;
    const siteUrl = data.project?.url || report.project_name || 'votre site';

    return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Rapport de Maintenance - ' + report.project_name + '</title><style>@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");:root{--primary:#0f172a;--secondary:#475569;--accent:#7c3aed;--success:#16a34a;--border:#e2e8f0;--bg:#f8fafc;--white:#ffffff}*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:0}body{font-family:"Inter",-apple-system,sans-serif;font-size:12px;line-height:1.5;color:var(--primary);background:var(--white)}.report{width:210mm;min-height:297mm;margin:0 auto;background:var(--white)}.cover{padding:50px;background:linear-gradient(135deg,#7c3aed 0%,#6366f1 50%,#8b5cf6 100%);color:white;min-height:200px}.cover-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:50px}.logo{font-size:24px;font-weight:700;letter-spacing:-0.5px}.period{text-align:right;font-size:14px;opacity:0.9}.period .month{font-size:18px;font-weight:600;text-transform:capitalize}.cover h1{font-size:32px;font-weight:700;margin-bottom:10px;letter-spacing:-1px}.site-url{font-size:16px;opacity:0.9}.forfait-badge{display:inline-block;background:rgba(255,255,255,0.2);padding:8px 20px;border-radius:25px;font-size:14px;margin-top:20px}.section{padding:35px 50px;border-bottom:1px solid var(--border)}.section:last-of-type{border-bottom:none}.section-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:var(--accent);margin-bottom:6px}.section h2{font-size:18px;font-weight:600;margin-bottom:20px;color:var(--primary)}.intro-text{color:var(--secondary);margin-bottom:12px;line-height:1.7;font-size:13px}.stats-grid{display:flex;gap:15px;margin:25px 0}.stat-card{flex:1;background:var(--bg);border-radius:12px;padding:20px;text-align:center}.stat-value{font-size:32px;font-weight:700;color:var(--accent);line-height:1}.stat-value.green{color:var(--success)}.stat-label{font-size:11px;color:var(--secondary);margin-top:8px;text-transform:uppercase;letter-spacing:0.5px}.work-item{padding:18px;border:1px solid var(--border);border-radius:10px;margin-bottom:12px}.work-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}.work-title{font-weight:600;font-size:14px;color:var(--primary)}.work-date{font-size:11px;color:var(--secondary);background:var(--bg);padding:4px 10px;border-radius:4px}.work-desc{color:var(--secondary);font-size:12px;line-height:1.6;margin-bottom:10px}.work-meta{display:flex;gap:12px;align-items:center}.work-time{color:var(--accent);font-weight:500;font-size:12px}.tag{display:inline-block;padding:3px 10px;font-size:10px;font-weight:600;text-transform:uppercase;border-radius:4px;background:#ede9fe;color:#6d28d9}.tag-update{background:#dbeafe;color:#1e40af}.tag-backup{background:#e0e7ff;color:#3730a3}.tag-security{background:#fce7f3;color:#9d174d}.tag-maintenance{background:#dcfce7;color:#166534}.tag-support{background:#fef3c7;color:#92400e}.no-data{color:var(--secondary);font-style:italic;text-align:center;padding:30px}.signature-section{padding:35px 50px;background:var(--bg)}.signature-grid{display:flex;align-items:flex-start;gap:20px}.signature-logo{width:100px}.signature-divider{width:3px;background:var(--accent);align-self:stretch;border-radius:2px;min-height:80px}.signature-info h4{font-size:15px;font-weight:600;margin-bottom:4px}.signature-info .role{color:var(--accent);font-weight:500;font-size:12px;margin-bottom:10px}.signature-info .contact-line{font-size:12px;color:var(--secondary);margin-bottom:3px}.signature-info .tagline{margin-top:10px;font-style:italic;color:var(--secondary);font-size:11px}.footer{padding:25px 50px;background:linear-gradient(135deg,#1f2937 0%,#374151 100%);text-align:center;font-size:11px;color:rgba(255,255,255,0.7)}.footer strong{color:white}</style></head><body><div class="report"><header class="cover"><div class="cover-top"><div class="logo">PixFeed</div><div class="period"><div class="month">' + formatMonth(report.period_start) + '</div><div>' + formatDateShort(report.period_start) + ' - ' + formatDateShort(report.period_end) + '</div></div></div><h1>Rapport de Maintenance</h1><div class="site-url">' + siteUrl + '</div><div class="forfait-badge">Forfait ' + forfaitMensuel + '€/mois</div></header><section class="section"><p class="intro-text">Bonjour <strong>' + (report.client_name || data.client?.name || 'Cher client') + '</strong>,</p><p class="intro-text">Voici le bilan des actions de maintenance réalisées sur votre site au cours de cette période.</p></section><section class="section"><div class="section-label">Vue d\'ensemble</div><h2>Résumé du mois</h2><div class="stats-grid"><div class="stat-card"><div class="stat-value">' + (data.summary?.interventions_count || 0) + '</div><div class="stat-label">Interventions</div></div><div class="stat-card"><div class="stat-value">' + formatDuration(data.summary?.total_duration_minutes || 0) + '</div><div class="stat-label">Temps total</div></div><div class="stat-card"><div class="stat-value green">' + forfaitMensuel + '€</div><div class="stat-label">Forfait/mois</div></div></div></section><section class="section"><div class="section-label">Travaux réalisés</div><h2>Détail des interventions</h2>' + interventionsRows + '</section>' + (report.notes ? '<section class="section"><div class="section-label">Notes</div><h2>Remarques</h2><p class="intro-text">' + report.notes + '</p></section>' : '') + '<section class="signature-section"><div class="signature-grid"><div class="signature-logo"><img src="https://pixfeed.net/wp-content/uploads/2024/01/pixfeed-logo-couleur.png" alt="Pixfeed" style="width:100px"/></div><div class="signature-divider"></div><div class="signature-info"><h4>Marc Gueffie</h4><div class="role">Développeur chez Pixfeed</div><div class="contact-line">06 12 34 56 78</div><div class="contact-line">contact@pixfeed.fr</div><div class="contact-line">pixfeed.net</div><div class="tagline">"L\'humain au cœur de nos solutions"</div></div></div></section><footer class="footer"><p>Ce rapport a été généré par <strong>Pixfeed</strong></p><p style="margin-top:5px;opacity:0.7">© ' + new Date().getFullYear() + ' Pixfeed - Tous droits réservés</p></footer></div></body></html>';
  }

  /**
   * Génère le PDF du rapport de maintenance
   */
  async generateMaintenanceReportPDF(report, data) {
    const html = this.generateReportHTML(report, data);
    return await this.generatePDF(html);
  }

  /**
   * Ferme le navigateur
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

const pdfService = new PDFService();
module.exports = pdfService;

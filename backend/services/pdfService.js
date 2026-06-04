// backend/services/pdfService.js
const puppeteer = require('puppeteer-core');
const reportTemplate = require('./reportTemplate');

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
   * Génère le HTML du rapport de maintenance (charte commune reportTemplate)
   */
  generateReportHTML(report, data) {
    return reportTemplate.renderMaintenanceReport(
      reportTemplate.buildMaintenanceReportData(report, data)
    );
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

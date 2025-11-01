// backend/services/pdfService.js
const PDFDocument = require('pdfkit');
const https = require('https');
const http = require('http');

/**
 * Service de génération de PDF pour devis et factures
 * Utilise PDFKit pour générer des PDF côté backend
 */
class PDFService {
  /**
   * Télécharge une image depuis une URL
   * @param {string} url - URL de l'image
   * @returns {Promise<Buffer>} - Buffer de l'image
   */
  async downloadImage(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Impossible de télécharger l'image: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Génère un PDF de devis
   * @param {Object} quote - Données du devis
   * @param {Object} companySettings - Paramètres entreprise
   * @param {Object} tvaRegime - Détails du régime TVA (optionnel)
   * @returns {Promise<Buffer>} - Buffer du PDF généré
   */
  async generateQuotePDF(quote, companySettings = {}, tvaRegime = null) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];

        // Capturer les données du PDF dans un buffer
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Logo URL
        const logoUrl = 'https://pixfeed.net/wp-content/uploads/2025/08/pixfeed-badge.png';
        let logoBuffer = null;

        // Télécharger le logo si show_logo est true (par défaut true)
        if (quote.show_logo !== false) {
          try {
            logoBuffer = await this.downloadImage(logoUrl);
          } catch (error) {
            console.warn('Impossible de télécharger le logo:', error.message);
          }
        }

        // === EN-TÊTE AMÉLIORÉ ===
        let currentY = 50;

        // LOGO EN HAUT À DROITE (si disponible et activé)
        if (logoBuffer) {
          try {
            doc.image(logoBuffer, 460, currentY, { width: 100, height: 60, fit: [100, 60] });
          } catch (err) {
            console.warn('Erreur lors de l\'insertion du logo:', err.message);
          }
        }

        // DEVIS ET NUMÉRO SUR UNE SEULE LIGNE EN HAUT À GAUCHE
        doc.fontSize(11)
           .fillColor('#333333')
           .font('Helvetica-Bold')
           .text(`DEVIS N° ${quote.quote_number || ''}`, 50, currentY);

        currentY += 20;

        // MES INFORMATIONS (EXPÉDITEUR) EN BAS À GAUCHE SOUS LE NUMÉRO
        const senderStartY = currentY;
        doc.fontSize(9)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text(companySettings.company_name || 'Mon Entreprise', 50, currentY);

        currentY += 12;

        doc.font('Helvetica')
           .fontSize(8)
           .fillColor('#333333');

        if (companySettings.address) {
          doc.text(companySettings.address, 50, currentY);
          currentY += 10;
        }
        if (companySettings.postal_code && companySettings.city) {
          doc.text(`${companySettings.postal_code} ${companySettings.city}`, 50, currentY);
          currentY += 10;
        }
        if (companySettings.phone) {
          doc.text(`Tél: ${companySettings.phone}`, 50, currentY);
          currentY += 10;
        }
        if (companySettings.email) {
          doc.text(`Email: ${companySettings.email}`, 50, currentY);
          currentY += 10;
        }
        if (companySettings.siret) {
          doc.text(`SIRET: ${companySettings.siret}`, 50, currentY);
          currentY += 10;
        }

        // INFORMATIONS CLIENT PRESQUE CENTRÉ À DROITE (mais proche du bord droit)
        const clientX = 340; // Position presque à droite
        let clientY = senderStartY;

        doc.fontSize(9)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text('FACTURÉ À', clientX, clientY);

        clientY += 12;

        doc.font('Helvetica')
           .fontSize(8)
           .fillColor('#333333');

        if (quote.client_name) {
          doc.text(quote.client_name, clientX, clientY, { width: 210, align: 'left' });
          clientY += 10;
        }
        if (quote.client_address) {
          doc.text(quote.client_address, clientX, clientY, { width: 210, align: 'left' });
          clientY += 10;
        }
        if (quote.client_email) {
          doc.text(quote.client_email, clientX, clientY, { width: 210, align: 'left' });
          clientY += 10;
        }
        if (quote.client_siret) {
          doc.text(`SIRET: ${quote.client_siret}`, clientX, clientY, { width: 210, align: 'left' });
          clientY += 10;
        }

        // S'assurer que currentY est après les informations les plus basses
        currentY = Math.max(currentY, clientY) + 20;

        // === DATES ET TITRE ===
        doc.fontSize(8)
           .fillColor('#666666')
           .font('Helvetica');

        const issueDate = quote.issue_date ? new Date(quote.issue_date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
        const expiryDate = quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString('fr-FR') : '';

        doc.text(`Date d'émission : ${issueDate}`, 50, currentY);
        currentY += 12;

        if (expiryDate) {
          doc.text(`Date d'échéance : ${expiryDate}`, 50, currentY);
          currentY += 12;
        }

        // Titre du devis (si présent)
        if (quote.title) {
          currentY += 10;
          doc.fontSize(11)
             .fillColor('#000000')
             .font('Helvetica-Bold')
             .text(quote.title, 50, currentY, { width: 510, align: 'left' });
          currentY += 20;
        } else {
          currentY += 15;
        }

        // === TABLEAU DES ARTICLES ===
        const tableTop = currentY;
        const tableHeaders = ['Description', 'Qté', 'Prix HT', 'Total HT'];
        const colWidths = [270, 60, 90, 90];
        const colX = [50, 320, 380, 470];

        // En-tête du tableau
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#FFFFFF')
           .rect(50, tableTop, 510, 25)
           .fill('#6366F1');

        doc.fillColor('#FFFFFF');
        tableHeaders.forEach((header, i) => {
          doc.text(header, colX[i] + 5, tableTop + 8, {
            width: colWidths[i] - 10,
            align: i === 0 ? 'left' : 'right'
          });
        });

        // Parse items
        let items = [];
        try {
          items = typeof quote.items === 'string' ? JSON.parse(quote.items) : (quote.items || []);
        } catch (e) {
          items = [];
        }

        // Filtrer les lignes de détail si elles n'ont pas de description
        items = items.filter(item => {
          if (item.type === 'detail') {
            return item.description && item.description.trim() !== '';
          }
          return true;
        });

        // Lignes du tableau
        let yPosition = tableTop + 25;
        doc.font('Helvetica')
           .fontSize(9)
           .fillColor('#000000');

        items.forEach((item, index) => {
          // Vérifier si on a besoin d'une nouvelle page
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }

          const rowHeight = item.type === 'detail' ? 15 : 20;

          // Si c'est une ligne de détail, utiliser un style différent
          if (item.type === 'detail') {
            doc.fontSize(8)
               .fillColor('#666666')
               .text(`  ${item.description || ''}`, colX[0] + 10, yPosition + 3, {
                 width: colWidths[0] - 20
               });
            doc.fontSize(9).fillColor('#000000');
          } else {
            // Fond alterné pour les articles normaux
            if (index % 2 === 0) {
              doc.rect(50, yPosition, 510, rowHeight)
                 .fill('#F9FAFB');
              doc.fillColor('#000000');
            }

            // Description
            doc.text(item.description || '', colX[0] + 5, yPosition + 5, {
              width: colWidths[0] - 10
            });

            // Quantité
            doc.text((item.quantity || 0).toString(), colX[1] + 5, yPosition + 5, {
              width: colWidths[1] - 10,
              align: 'right'
            });

            // Prix unitaire
            doc.text(this.formatAmount(item.unit_price), colX[2] + 5, yPosition + 5, {
              width: colWidths[2] - 10,
              align: 'right'
            });

            // Total ligne
            const lineTotal = (item.quantity || 0) * (item.unit_price || 0);
            doc.text(this.formatAmount(lineTotal), colX[3] + 5, yPosition + 5, {
              width: colWidths[3] - 10,
              align: 'right'
            });
          }

          yPosition += rowHeight;
        });

        // Bordure du tableau
        doc.rect(50, tableTop, 510, yPosition - tableTop)
           .stroke('#CCCCCC');

        yPosition += 20;

        // === TOTAUX ===
        const totalsX = 380;
        doc.fontSize(10)
           .fillColor('#000000');

        // Total HT avant remise
        doc.text('Total HT :', totalsX, yPosition, { continued: true, width: 90 });
        doc.text(this.formatAmount(quote.total_ht || 0), { align: 'right' });
        yPosition += 20;

        // Remise (si présente)
        if (quote.discount_amount && quote.discount_amount > 0) {
          let discountLabel = 'Remise';
          if (quote.discount_type === 'percent') {
            discountLabel += ` (${quote.discount_value}%)`;
          }
          doc.text(`${discountLabel} :`, totalsX, yPosition, { continued: true, width: 90 });
          doc.fillColor('#16A34A')
             .text(`-${this.formatAmount(quote.discount_amount)}`, { align: 'right' });
          doc.fillColor('#000000');
          yPosition += 20;

          // Total HT après remise
          const totalHtAfterDiscount = (quote.total_ht || 0) - (quote.discount_amount || 0);
          doc.font('Helvetica')
             .text('Total HT net :', totalsX, yPosition, { continued: true, width: 90 });
          doc.text(this.formatAmount(totalHtAfterDiscount), { align: 'right' });
          yPosition += 20;
        }

        // TVA avec mention du régime si disponible
        let tvaLabel = '';
        if (tvaRegime && tvaRegime.mention_legale) {
          tvaLabel = tvaRegime.mention_legale;
        } else if (quote.tva_applicable === false) {
          tvaLabel = 'TVA (non applicable)';
        } else {
          const regimeLabel = quote.tva_regime ? ` - ${quote.tva_regime}` : '';
          tvaLabel = `TVA (${quote.tva_rate || 20}%${regimeLabel})`;
        }
        doc.text(tvaLabel, totalsX, yPosition, { continued: true, width: 90 });
        doc.text(this.formatAmount(quote.tva_amount || 0), { align: 'right' });
        yPosition += 20;

        // Total TTC
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .fillColor('#6366F1');
        doc.text('Total TTC :', totalsX, yPosition, { continued: true, width: 90 });
        doc.text(this.formatAmount(quote.total_ttc || 0), { align: 'right' });
        yPosition += 20;

        // Acompte si présent
        if (quote.acompte_amount && quote.acompte_amount > 0) {
          yPosition += 5;
          doc.font('Helvetica')
             .fontSize(10)
             .fillColor('#000000');
          doc.text('Acompte :', totalsX, yPosition, { continued: true, width: 90 });
          doc.text(this.formatAmount(quote.acompte_amount), { align: 'right' });
          yPosition += 15;

          const reste = (quote.total_ttc || 0) - (quote.acompte_amount || 0);
          doc.text('Reste à payer :', totalsX, yPosition, { continued: true, width: 90 });
          doc.text(this.formatAmount(reste), { align: 'right' });
        }

        // Escompte si présent
        if (quote.escompte_percent && quote.escompte_percent > 0 && quote.escompte_days && quote.escompte_days > 0) {
          yPosition += 15;
          doc.font('Helvetica')
             .fontSize(9)
             .fillColor('#16A34A');
          const montantEscompte = (quote.total_ttc || 0) * (quote.escompte_percent / 100);
          const totalAvecEscompte = (quote.total_ttc || 0) - montantEscompte;
          doc.text(`💡 Escompte de ${quote.escompte_percent}% si paiement sous ${quote.escompte_days} jours`, 50, yPosition);
          yPosition += 12;
          doc.text(`   Montant avec escompte : ${this.formatAmount(totalAvecEscompte)}`, 50, yPosition);
          doc.fillColor('#000000');
        }

        yPosition += 30;

        // === MOYENS DE PAIEMENT ACCEPTÉS ===
        if (quote.payment_methods) {
          let paymentMethods = [];
          try {
            paymentMethods = typeof quote.payment_methods === 'string'
              ? JSON.parse(quote.payment_methods)
              : (quote.payment_methods || []);
          } catch (e) {
            paymentMethods = [];
          }

          if (paymentMethods.length > 0) {
            doc.fontSize(9)
               .fillColor('#000000')
               .font('Helvetica-Bold')
               .text('Moyens de paiement acceptés', 50, yPosition);
            yPosition += 15;

            doc.font('Helvetica')
               .fontSize(9)
               .fillColor('#333333');

            const methodLabels = {
              'VIREMENT': 'Virement bancaire',
              'CHEQUE': 'Chèque',
              'CARTE': 'Carte bancaire',
              'ESPECES': 'Espèces',
              'PRELEVEMENT': 'Prélèvement automatique',
              'PAYPAL': 'PayPal',
              'STRIPE': 'Stripe',
              'TRAITE': 'Lettre de change',
              'AUTRE': 'Autre moyen'
            };

            const methodsList = paymentMethods.map(m => methodLabels[m] || m).join(', ');
            doc.text(methodsList, 50, yPosition, { width: 510 });
            yPosition += 25;
          }
        }

        // === MODALITÉS DE PAIEMENT ===
        if (quote.payment_details) {
          let paymentDetails = null;
          try {
            paymentDetails = typeof quote.payment_details === 'string'
              ? JSON.parse(quote.payment_details)
              : quote.payment_details;
          } catch (e) {
            paymentDetails = null;
          }

          if (paymentDetails && Object.keys(paymentDetails).length > 0) {
            doc.fontSize(9)
               .fillColor('#000000')
               .font('Helvetica-Bold')
               .text('Modalités de paiement', 50, yPosition);
            yPosition += 15;

            doc.font('Helvetica')
               .fontSize(8)
               .fillColor('#333333');

            // VIREMENT
            if (paymentDetails.VIREMENT?.iban) {
              doc.text('Paiement par virement bancaire :', 50, yPosition);
              yPosition += 12;
              doc.text(`  IBAN: ${paymentDetails.VIREMENT.iban}`, 50, yPosition);
              yPosition += 10;
              if (paymentDetails.VIREMENT.bic) {
                doc.text(`  BIC: ${paymentDetails.VIREMENT.bic}`, 50, yPosition);
                yPosition += 10;
              }
              if (paymentDetails.VIREMENT.titulaire) {
                doc.text(`  Titulaire: ${paymentDetails.VIREMENT.titulaire}`, 50, yPosition);
                yPosition += 10;
              }
              if (paymentDetails.VIREMENT.banque) {
                doc.text(`  Banque: ${paymentDetails.VIREMENT.banque}`, 50, yPosition);
                yPosition += 10;
              }
              yPosition += 5;
            }

            // PAYPAL
            if (paymentDetails.PAYPAL?.email) {
              doc.text('Paiement par PayPal :', 50, yPosition);
              yPosition += 12;
              doc.text(`  Email: ${paymentDetails.PAYPAL.email}`, 50, yPosition);
              yPosition += 10;
              if (paymentDetails.PAYPAL.lien) {
                doc.fillColor('#6366F1')
                   .text(`  Lien: ${paymentDetails.PAYPAL.lien}`, 50, yPosition, { link: paymentDetails.PAYPAL.lien });
                doc.fillColor('#333333');
                yPosition += 10;
              }
              yPosition += 5;
            }

            // STRIPE
            if (paymentDetails.STRIPE?.lien) {
              doc.text('Paiement par carte bancaire (Stripe) :', 50, yPosition);
              yPosition += 12;
              doc.fillColor('#6366F1')
                 .text(`  ${paymentDetails.STRIPE.lien}`, 50, yPosition, { link: paymentDetails.STRIPE.lien });
              doc.fillColor('#333333');
              yPosition += 15;
            }

            // CARTE BANCAIRE (autre)
            if (paymentDetails.CARTE?.instructions) {
              doc.text('Paiement par carte bancaire :', 50, yPosition);
              yPosition += 12;
              doc.text(`  ${paymentDetails.CARTE.instructions}`, 50, yPosition);
              yPosition += 15;
            }

            yPosition += 10;
          }
        }

        // === NOTES ===
        if (quote.notes) {
          doc.fontSize(8)
             .fillColor('#666666')
             .font('Helvetica-Bold')
             .text('Notes', 50, yPosition);
          yPosition += 15;

          doc.font('Helvetica')
             .fontSize(8)
             .text(quote.notes, 50, yPosition, { width: 510 });
          yPosition = doc.y + 10;
        }

        // === INFORMATIONS COMPLÉMENTAIRES ===
        if (quote.additional_info) {
          yPosition = doc.y + 5;
          doc.fontSize(8)
             .fillColor('#666666')
             .font('Helvetica-Bold')
             .text('Informations complémentaires', 50, yPosition);
          yPosition += 15;

          doc.font('Helvetica')
             .fontSize(8)
             .fillColor('#333333')
             .text(quote.additional_info, 50, yPosition, { width: 510 });
          yPosition = doc.y + 10;
        }

        // === FICHIERS JOINTS ===
        if (quote.additional_files) {
          let files = [];
          try {
            files = typeof quote.additional_files === 'string'
              ? JSON.parse(quote.additional_files)
              : (quote.additional_files || []);
          } catch (e) {
            files = [];
          }

          if (files.length > 0) {
            yPosition = doc.y + 5;
            doc.fontSize(8)
               .fillColor('#666666')
               .font('Helvetica-Bold')
               .text('Fichiers joints', 50, yPosition);
            yPosition += 15;

            doc.font('Helvetica')
               .fontSize(8)
               .fillColor('#333333');

            files.forEach((file, index) => {
              const fileName = file.filename || file.name || `Document ${index + 1}`;
              const fileSize = file.size ? `(${(file.size / 1024).toFixed(2)} Ko)` : '';
              doc.text(`• ${fileName} ${fileSize}`, 50, yPosition);
              yPosition += 12;
            });
          }
        }

        // === CGV SUR UNE NOUVELLE PAGE ===
        if (quote.cgv) {
          doc.addPage();

          doc.fontSize(12)
             .fillColor('#6366F1')
             .font('Helvetica-Bold')
             .text('CONDITIONS GÉNÉRALES DE VENTE', 50, 50, { align: 'center' });

          doc.moveDown(2);

          doc.fontSize(9)
             .font('Helvetica')
             .fillColor('#333333')
             .text(quote.cgv, 50, doc.y, { width: 510, align: 'justify', lineGap: 3 });
        }

        // Finaliser le PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Génère un PDF de facture
   * (Utilise l'ancienne version pour l'instant)
   */
  async generateInvoicePDF(invoice, companySettings = {}, tvaRegime = null) {
    // Peut être refactorisé plus tard avec la même logique que les devis
    return this.generateQuotePDF(invoice, companySettings, tvaRegime);
  }

  /**
   * Formate un montant en euros
   */
  formatAmount(amount) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  }
}

// Export d'une instance unique
const pdfService = new PDFService();
module.exports = pdfService;

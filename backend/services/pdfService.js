// backend/services/pdfService.js
const PDFDocument = require('pdfkit');

/**
 * Service de génération de PDF pour devis et factures
 * Utilise PDFKit pour générer des PDF côté backend
 */
class PDFService {
  /**
   * Génère un PDF de devis
   * @param {Object} quote - Données du devis
   * @param {Object} companySettings - Paramètres entreprise
   * @param {Object} tvaRegime - Détails du régime TVA (optionnel)
   * @returns {Promise<Buffer>} - Buffer du PDF généré
   */
  async generateQuotePDF(quote, companySettings = {}, tvaRegime = null) {
    return new Promise((resolve, reject) => {
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

        // === EN-TÊTE ===
        doc.fontSize(24)
           .fillColor('#6366F1')
           .text('DEVIS', { align: 'center' });

        doc.fontSize(12)
           .fillColor('#666666')
           .text(quote.quote_number || '', { align: 'center' });

        // Titre du devis (si présent)
        if (quote.title) {
          doc.fontSize(14)
             .fillColor('#000000')
             .font('Helvetica-Bold')
             .text(quote.title, { align: 'center' });
        }

        doc.moveDown(2);

        // === INFORMATIONS ENTREPRISE ===
        const yTop = doc.y;
        doc.fontSize(10)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text(companySettings.company_name || 'Mon Entreprise', 50, yTop);

        doc.font('Helvetica')
           .fontSize(9)
           .fillColor('#333333');

        if (companySettings.address) doc.text(companySettings.address);
        if (companySettings.postal_code && companySettings.city) {
          doc.text(`${companySettings.postal_code} ${companySettings.city}`);
        }
        if (companySettings.siret) doc.text(`SIRET: ${companySettings.siret}`);
        if (companySettings.email) doc.text(`Email: ${companySettings.email}`);
        if (companySettings.phone) doc.text(`Tél: ${companySettings.phone}`);

        // === INFORMATIONS CLIENT ===
        doc.fontSize(10)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text('Client', 320, yTop);

        doc.font('Helvetica')
           .fontSize(9)
           .fillColor('#333333');

        if (quote.client_name) doc.text(quote.client_name, 320);
        if (quote.client_address) doc.text(quote.client_address, 320);
        if (quote.client_email) doc.text(quote.client_email, 320);
        if (quote.client_siret) doc.text(`SIRET: ${quote.client_siret}`, 320);

        doc.moveDown(3);

        // === DATES ET PROJET ===
        doc.fontSize(9)
           .fillColor('#666666');

        const issueDate = quote.issue_date ? new Date(quote.issue_date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
        const expiryDate = quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString('fr-FR') : '';

        doc.text(`Date d'émission : ${issueDate}`, 50);
        if (expiryDate) doc.text(`Date d'expiration : ${expiryDate}`, 50);

        // Projet associé (si présent)
        if (quote.project_name) {
          doc.text(`Projet : ${quote.project_name}`, 50);
        }

        doc.moveDown(1.5);

        // === TABLEAU DES ARTICLES ===
        const tableTop = doc.y;
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

        // Lignes du tableau
        let yPosition = tableTop + 25;
        doc.font('Helvetica')
           .fontSize(9)
           .fillColor('#000000');

        items.forEach((item, index) => {
          const rowHeight = 20;

          // Fond alterné
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

        // === CGV ===
        if (quote.cgv) {
          doc.fontSize(8)
             .fillColor('#666666')
             .font('Helvetica-Bold')
             .text('Conditions Générales de Vente', 50, yPosition);
          yPosition += 15;

          doc.font('Helvetica')
             .fontSize(8)
             .text(quote.cgv, 50, yPosition, { width: 510, align: 'justify' });
        }

        // === NOTES ===
        if (quote.notes) {
          yPosition = doc.y + 15;
          doc.fontSize(8)
             .fillColor('#666666')
             .font('Helvetica-Bold')
             .text('Notes', 50, yPosition);
          yPosition += 15;

          doc.font('Helvetica')
             .fontSize(8)
             .text(quote.notes, 50, yPosition, { width: 510 });
        }

        // === INFORMATIONS COMPLÉMENTAIRES ===
        if (quote.additional_info) {
          yPosition = doc.y + 15;
          doc.fontSize(8)
             .fillColor('#666666')
             .font('Helvetica-Bold')
             .text('Informations complémentaires', 50, yPosition);
          yPosition += 15;

          doc.font('Helvetica')
             .fontSize(8)
             .fillColor('#333333')
             .text(quote.additional_info, 50, yPosition, { width: 510 });
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
            yPosition = doc.y + 15;
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

        // Finaliser le PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Génère un PDF de facture
   * @param {Object} invoice - Données de la facture
   * @param {Object} companySettings - Paramètres entreprise
   * @param {Object} tvaRegime - Détails du régime TVA (optionnel)
   * @returns {Promise<Buffer>} - Buffer du PDF généré
   */
  async generateInvoicePDF(invoice, companySettings = {}, tvaRegime = null) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // === EN-TÊTE ===
        doc.fontSize(24)
           .fillColor('#6366F1')
           .text('FACTURE', { align: 'center' });

        doc.fontSize(12)
           .fillColor('#666666')
           .text(invoice.invoice_number || '', { align: 'center' });

        // Titre de la facture (si présent)
        if (invoice.title) {
          doc.fontSize(14)
             .fillColor('#000000')
             .font('Helvetica-Bold')
             .text(invoice.title, { align: 'center' });
        }

        doc.moveDown(2);

        // === INFORMATIONS ENTREPRISE ===
        const yTop = doc.y;
        doc.fontSize(10)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text(companySettings.company_name || 'Mon Entreprise', 50, yTop);

        doc.font('Helvetica')
           .fontSize(9)
           .fillColor('#333333');

        if (companySettings.address) doc.text(companySettings.address);
        if (companySettings.postal_code && companySettings.city) {
          doc.text(`${companySettings.postal_code} ${companySettings.city}`);
        }
        if (companySettings.siret) doc.text(`SIRET: ${companySettings.siret}`);
        if (companySettings.email) doc.text(`Email: ${companySettings.email}`);
        if (companySettings.phone) doc.text(`Tél: ${companySettings.phone}`);

        // === INFORMATIONS CLIENT ===
        doc.fontSize(10)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text('Client', 320, yTop);

        doc.font('Helvetica')
           .fontSize(9)
           .fillColor('#333333');

        if (invoice.client_name) doc.text(invoice.client_name, 320);
        if (invoice.client_address) doc.text(invoice.client_address, 320);
        if (invoice.client_email) doc.text(invoice.client_email, 320);
        if (invoice.client_siret) doc.text(`SIRET: ${invoice.client_siret}`, 320);

        doc.moveDown(3);

        // === DATES ET PROJET ===
        doc.fontSize(9)
           .fillColor('#666666');

        const issueDate = invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
        const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('fr-FR') : '';

        doc.text(`Date d'émission : ${issueDate}`, 50);
        if (dueDate) doc.text(`Date d'échéance : ${dueDate}`, 50);

        // Projet associé (si présent)
        if (invoice.project_name) {
          doc.text(`Projet : ${invoice.project_name}`, 50);
        }

        doc.moveDown(1.5);

        // === TABLEAU (identique au devis) ===
        const tableTop = doc.y;
        const tableHeaders = ['Description', 'Qté', 'Prix HT', 'Total HT'];
        const colWidths = [270, 60, 90, 90];
        const colX = [50, 320, 380, 470];

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

        let items = [];
        try {
          items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : (invoice.items || []);
        } catch (e) {
          items = [];
        }

        let yPosition = tableTop + 25;
        doc.font('Helvetica')
           .fontSize(9)
           .fillColor('#000000');

        items.forEach((item, index) => {
          const rowHeight = 20;

          if (index % 2 === 0) {
            doc.rect(50, yPosition, 510, rowHeight)
               .fill('#F9FAFB');
            doc.fillColor('#000000');
          }

          doc.text(item.description || '', colX[0] + 5, yPosition + 5, { width: colWidths[0] - 10 });
          doc.text((item.quantity || 0).toString(), colX[1] + 5, yPosition + 5, { width: colWidths[1] - 10, align: 'right' });
          doc.text(this.formatAmount(item.unit_price), colX[2] + 5, yPosition + 5, { width: colWidths[2] - 10, align: 'right' });

          const lineTotal = (item.quantity || 0) * (item.unit_price || 0);
          doc.text(this.formatAmount(lineTotal), colX[3] + 5, yPosition + 5, { width: colWidths[3] - 10, align: 'right' });

          yPosition += rowHeight;
        });

        doc.rect(50, tableTop, 510, yPosition - tableTop).stroke('#CCCCCC');
        yPosition += 20;

        // === TOTAUX ===
        const totalsX = 380;
        doc.fontSize(10).fillColor('#000000');

        doc.text('Total HT :', totalsX, yPosition, { continued: true, width: 90 });
        doc.text(this.formatAmount(invoice.total_ht || 0), { align: 'right' });
        yPosition += 20;

        // Remise (si présente)
        if (invoice.discount_amount && invoice.discount_amount > 0) {
          let discountLabel = 'Remise';
          if (invoice.discount_type === 'percent') {
            discountLabel += ` (${invoice.discount_value}%)`;
          }
          doc.text(`${discountLabel} :`, totalsX, yPosition, { continued: true, width: 90 });
          doc.fillColor('#16A34A')
             .text(`-${this.formatAmount(invoice.discount_amount)}`, { align: 'right' });
          doc.fillColor('#000000');
          yPosition += 20;

          const totalHtAfterDiscount = (invoice.total_ht || 0) - (invoice.discount_amount || 0);
          doc.font('Helvetica')
             .text('Total HT net :', totalsX, yPosition, { continued: true, width: 90 });
          doc.text(this.formatAmount(totalHtAfterDiscount), { align: 'right' });
          yPosition += 20;
        }

        // TVA avec mention du régime si disponible
        let tvaLabel = '';
        if (tvaRegime && tvaRegime.mention_legale) {
          tvaLabel = tvaRegime.mention_legale;
        } else if (invoice.tva_applicable === false) {
          tvaLabel = 'TVA (non applicable)';
        } else {
          const regimeLabel = invoice.tva_regime ? ` - ${invoice.tva_regime}` : '';
          tvaLabel = `TVA (${invoice.tva_rate || 20}%${regimeLabel})`;
        }
        doc.text(tvaLabel, totalsX, yPosition, { continued: true, width: 90 });
        doc.text(this.formatAmount(invoice.tva_amount || 0), { align: 'right' });
        yPosition += 20;

        doc.font('Helvetica-Bold').fontSize(12).fillColor('#6366F1');
        doc.text('Total TTC :', totalsX, yPosition, { continued: true, width: 90 });
        doc.text(this.formatAmount(invoice.total_ttc || 0), { align: 'right' });
        yPosition += 30;

        // === MOYENS DE PAIEMENT ACCEPTÉS ===
        if (invoice.payment_methods) {
          let paymentMethods = [];
          try {
            paymentMethods = typeof invoice.payment_methods === 'string'
              ? JSON.parse(invoice.payment_methods)
              : (invoice.payment_methods || []);
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
        if (invoice.payment_details) {
          let paymentDetails = null;
          try {
            paymentDetails = typeof invoice.payment_details === 'string'
              ? JSON.parse(invoice.payment_details)
              : invoice.payment_details;
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

        // === CGV et NOTES ===
        if (invoice.cgv) {
          doc.fontSize(8).fillColor('#666666').font('Helvetica-Bold').text('Conditions Générales de Vente', 50, yPosition);
          yPosition += 15;
          doc.font('Helvetica').text(invoice.cgv, 50, yPosition, { width: 510, align: 'justify' });
        }

        if (invoice.notes) {
          yPosition = doc.y + 15;
          doc.fontSize(8).fillColor('#666666').font('Helvetica-Bold').text('Notes', 50, yPosition);
          yPosition += 15;
          doc.font('Helvetica').text(invoice.notes, 50, yPosition, { width: 510 });
        }

        // === INFORMATIONS COMPLÉMENTAIRES ===
        if (invoice.additional_info) {
          yPosition = doc.y + 15;
          doc.fontSize(8)
             .fillColor('#666666')
             .font('Helvetica-Bold')
             .text('Informations complémentaires', 50, yPosition);
          yPosition += 15;

          doc.font('Helvetica')
             .fontSize(8)
             .fillColor('#333333')
             .text(invoice.additional_info, 50, yPosition, { width: 510 });
        }

        // === FICHIERS JOINTS ===
        if (invoice.additional_files) {
          let files = [];
          try {
            files = typeof invoice.additional_files === 'string'
              ? JSON.parse(invoice.additional_files)
              : (invoice.additional_files || []);
          } catch (e) {
            files = [];
          }

          if (files.length > 0) {
            yPosition = doc.y + 15;
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

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
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

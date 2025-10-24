// backend/utils/quotePdfGenerator.js
const PDFDocument = require('pdfkit');

/**
 * Générer un PDF professionnel pour un devis
 */
async function generateQuotePDF(quote) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ===== EN-TÊTE =====
      doc.fontSize(28)
         .fillColor('#4F46E5')
         .text('DEVIS', { align: 'right' });

      doc.fontSize(12)
         .fillColor('#6B7280')
         .text(quote.quote_number, { align: 'right' });

      doc.moveDown(2);

      // ===== INFORMATIONS ENTREPRISE (à gauche) =====
      doc.fontSize(10)
         .fillColor('#1F2937')
         .text('CRM Audacieux', 50, 120);
      doc.fontSize(9)
         .fillColor('#6B7280')
         .text('Votre Entreprise', 50, 135)
         .text('Adresse de votre entreprise', 50, 148)
         .text('Code Postal Ville', 50, 161)
         .text('contact@votreentreprise.fr', 50, 174);

      // ===== INFORMATIONS CLIENT (à droite) =====
      doc.fontSize(10)
         .fillColor('#1F2937')
         .text('CLIENT', 350, 120, { width: 200 });

      const clientName = quote.lead_name || 'Client';
      const clientCompany = quote.lead_company || '';
      const clientEmail = quote.lead_email || '';
      const clientPhone = quote.lead_phone || '';

      doc.fontSize(10)
         .fillColor('#1F2937')
         .text(clientName, 350, 135, { width: 200 });

      if (clientCompany) {
        doc.fillColor('#6B7280')
           .text(clientCompany, 350, 148, { width: 200 });
      }

      let yPos = clientCompany ? 161 : 148;
      if (clientEmail) {
        doc.text(clientEmail, 350, yPos, { width: 200 });
        yPos += 13;
      }
      if (clientPhone) {
        doc.text(clientPhone, 350, yPos, { width: 200 });
      }

      // ===== TITRE ET DATES =====
      doc.moveDown(4);
      doc.fontSize(14)
         .fillColor('#1F2937')
         .text(quote.title || 'Devis', 50, 220);

      doc.fontSize(9)
         .fillColor('#6B7280')
         .text(`Date d'émission : ${new Date(quote.created_at).toLocaleDateString('fr-FR')}`, 50, 240);

      if (quote.valid_until) {
        doc.text(`Valable jusqu'au : ${new Date(quote.valid_until).toLocaleDateString('fr-FR')}`, 50, 253);
      }

      // ===== TABLEAU DES LIGNES =====
      const tableTop = 290;
      const tableLeft = 50;

      // En-têtes du tableau
      doc.fontSize(9)
         .fillColor('#FFFFFF');

      doc.rect(tableLeft, tableTop, 495, 25)
         .fill('#4F46E5');

      doc.fillColor('#FFFFFF')
         .text('Description', tableLeft + 5, tableTop + 8, { width: 250 })
         .text('Qté', tableLeft + 260, tableTop + 8, { width: 50, align: 'center' })
         .text('Prix U. HT', tableLeft + 315, tableTop + 8, { width: 80, align: 'right' })
         .text('Total HT', tableLeft + 400, tableTop + 8, { width: 90, align: 'right' });

      // Lignes du tableau
      let currentY = tableTop + 25;
      doc.fillColor('#1F2937');

      quote.items.forEach((item, index) => {
        const rowBg = index % 2 === 0 ? '#F9FAFB' : '#FFFFFF';

        doc.rect(tableLeft, currentY, 495, 30)
           .fill(rowBg);

        doc.fillColor('#1F2937')
           .fontSize(9)
           .text(item.description, tableLeft + 5, currentY + 10, { width: 250 })
           .text(item.quantity.toString(), tableLeft + 260, currentY + 10, { width: 50, align: 'center' })
           .text(`${parseFloat(item.unit_price).toFixed(2)} €`, tableLeft + 315, currentY + 10, { width: 80, align: 'right' })
           .text(`${parseFloat(item.total_price).toFixed(2)} €`, tableLeft + 400, currentY + 10, { width: 90, align: 'right' });

        currentY += 30;
      });

      // Bordure du tableau
      doc.strokeColor('#E5E7EB')
         .rect(tableLeft, tableTop, 495, currentY - tableTop)
         .stroke();

      // ===== TOTAUX =====
      currentY += 10;

      // Sous-total
      doc.fontSize(10)
         .fillColor('#6B7280')
         .text('Sous-total HT :', 350, currentY, { width: 150, align: 'right' })
         .fillColor('#1F2937')
         .text(`${parseFloat(quote.subtotal).toFixed(2)} €`, 500, currentY, { width: 90, align: 'right' });

      currentY += 20;

      // TVA
      doc.fillColor('#6B7280')
         .text(`TVA (${quote.tax_rate}%) :`, 350, currentY, { width: 150, align: 'right' })
         .fillColor('#1F2937')
         .text(`${parseFloat(quote.tax_amount).toFixed(2)} €`, 500, currentY, { width: 90, align: 'right' });

      currentY += 25;

      // Total TTC
      doc.rect(350, currentY - 5, 195, 30)
         .fill('#4F46E5');

      doc.fontSize(12)
         .fillColor('#FFFFFF')
         .text('Total TTC :', 350, currentY + 5, { width: 150, align: 'right' })
         .text(`${parseFloat(quote.total_amount).toFixed(2)} €`, 500, currentY + 5, { width: 90, align: 'right' });

      currentY += 45;

      // ===== NOTES =====
      if (quote.notes) {
        doc.fontSize(10)
           .fillColor('#1F2937')
           .text('Notes :', 50, currentY);

        currentY += 20;

        doc.fontSize(9)
           .fillColor('#6B7280')
           .text(quote.notes, 50, currentY, { width: 495 });

        currentY += doc.heightOfString(quote.notes, { width: 495 }) + 20;
      }

      // ===== CONDITIONS =====
      if (quote.terms) {
        doc.fontSize(10)
           .fillColor('#1F2937')
           .text('Conditions :', 50, currentY);

        currentY += 20;

        doc.fontSize(9)
           .fillColor('#6B7280')
           .text(quote.terms, 50, currentY, { width: 495 });
      } else {
        // Conditions par défaut
        doc.fontSize(10)
           .fillColor('#1F2937')
           .text('Conditions de paiement :', 50, currentY);

        currentY += 20;

        doc.fontSize(9)
           .fillColor('#6B7280')
           .text('Paiement à 30 jours. Devis valable 30 jours.', 50, currentY, { width: 495 });
      }

      // ===== PIED DE PAGE =====
      doc.fontSize(8)
         .fillColor('#9CA3AF')
         .text(
           'Ce devis est généré automatiquement par CRM Audacieux',
           50,
           doc.page.height - 50,
           { align: 'center', width: 495 }
         );

      // Finaliser le PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateQuotePDF
};

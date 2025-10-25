// src/services/exportPDF.js
import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Export d'un devis en PDF
 */
export const exportQuoteToPDF = (quote) => {
  const doc = new jsPDF();

  // Titre
  doc.setFontSize(22);
  doc.setTextColor(99, 102, 241); // Indigo
  doc.text('DEVIS', 105, 20, { align: 'center' });

  // Numéro de devis
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`N° ${quote.quote_number || ''}`, 105, 28, { align: 'center' });

  // Informations entreprise (à gauche)
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'bold');
  doc.text('VOTRE ENTREPRISE', 20, 45);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text('Nom de votre entreprise', 20, 51);
  doc.text('Adresse', 20, 56);
  doc.text('Code postal Ville', 20, 61);
  doc.text('SIRET: 123 456 789 00012', 20, 66);

  // Informations client (à droite)
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('CLIENT', 120, 45);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text(quote.client_name || 'Nom du client', 120, 51);
  if (quote.client_address) {
    const addressLines = quote.client_address.split('\n');
    addressLines.forEach((line, i) => {
      doc.text(line, 120, 56 + (i * 5));
    });
  }
  if (quote.client_siret) {
    doc.text(`SIRET: ${quote.client_siret}`, 120, 66);
  }

  // Dates
  const issueDate = quote.issue_date ? new Date(quote.issue_date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  const expiryDate = quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString('fr-FR') : '-';

  doc.setFontSize(9);
  doc.text(`Date d'émission: ${issueDate}`, 20, 80);
  doc.text(`Valide jusqu'au: ${expiryDate}`, 20, 85);

  // Tableau des articles
  const items = Array.isArray(quote.items) ? quote.items : (typeof quote.items === 'string' ? JSON.parse(quote.items) : []);

  const tableData = items.map(item => [
    item.description || '',
    parseFloat(item.quantity || 0).toFixed(2),
    parseFloat(item.unit_price || 0).toFixed(2) + ' €',
    (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0)).toFixed(2) + ' €'
  ]);

  doc.autoTable({
    startY: 95,
    head: [['Description', 'Quantité', 'Prix unitaire', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [99, 102, 241], // Indigo
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 9,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: 'center', cellWidth: 30 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', cellWidth: 35 }
    }
  });

  // Totaux
  const finalY = doc.lastAutoTable.finalY + 10;
  const total_ht = parseFloat(quote.total_ht || 0);
  const tva_amount = parseFloat(quote.tva_amount || 0);
  const total_ttc = parseFloat(quote.total_ttc || 0);
  const tva_rate = parseFloat(quote.tva_rate || 20);
  const tva_applicable = quote.tva_applicable !== false;

  doc.setFontSize(10);
  const xRight = 160;

  doc.text('Total HT:', xRight, finalY);
  doc.text(`${total_ht.toFixed(2)} €`, 190, finalY, { align: 'right' });

  if (tva_applicable) {
    doc.text(`TVA (${tva_rate}%):`, xRight, finalY + 6);
    doc.text(`${tva_amount.toFixed(2)} €`, 190, finalY + 6, { align: 'right' });
  } else {
    doc.setFontSize(8);
    doc.text('TVA non applicable, art. 293 B du CGI', xRight, finalY + 6);
    doc.setFontSize(10);
  }

  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text('Total TTC:', xRight, finalY + 12);
  doc.text(`${total_ttc.toFixed(2)} €`, 190, finalY + 12, { align: 'right' });
  doc.setFont(undefined, 'normal');

  // Acompte si applicable
  if (quote.acompte_type && quote.acompte_type !== 'none' && quote.acompte_amount > 0) {
    doc.setFontSize(10);
    doc.text('Acompte:', xRight, finalY + 20);
    doc.text(`${parseFloat(quote.acompte_amount).toFixed(2)} €`, 190, finalY + 20, { align: 'right' });

    const reste = total_ttc - parseFloat(quote.acompte_amount);
    doc.text('Reste à payer:', xRight, finalY + 26);
    doc.text(`${reste.toFixed(2)} €`, 190, finalY + 26, { align: 'right' });
  }

  // Escompte si applicable
  if (quote.escompte_percent > 0 && quote.escompte_days > 0) {
    const yEscompte = finalY + (quote.acompte_amount > 0 ? 34 : 20);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Escompte de ${quote.escompte_percent}% si paiement sous ${quote.escompte_days} jours`, 20, yEscompte);
    const montantEscompte = total_ttc * (1 - quote.escompte_percent / 100);
    doc.text(`Montant avec escompte: ${montantEscompte.toFixed(2)} €`, 20, yEscompte + 4);
    doc.setTextColor(0, 0, 0);
  }

  // CGV si présentes
  if (quote.cgv) {
    const cgvY = finalY + 45;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('CONDITIONS GÉNÉRALES DE VENTE', 20, cgvY);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    const cgvLines = doc.splitTextToSize(quote.cgv, 170);
    doc.text(cgvLines, 20, cgvY + 6);
  }

  // Notes si présentes
  if (quote.notes) {
    const notesY = quote.cgv ? finalY + 80 : finalY + 50;
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Notes:', 20, notesY);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    const notesLines = doc.splitTextToSize(quote.notes, 170);
    doc.text(notesLines, 20, notesY + 5);
  }

  // Télécharger
  doc.save(`Devis_${quote.quote_number || 'nouveau'}.pdf`);
};

/**
 * Export d'une facture en PDF
 */
export const exportInvoiceToPDF = (invoice) => {
  const doc = new jsPDF();

  // Titre
  doc.setFontSize(22);
  doc.setTextColor(99, 102, 241); // Indigo
  doc.text('FACTURE', 105, 20, { align: 'center' });

  // Numéro de facture
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`N° ${invoice.invoice_number || ''}`, 105, 28, { align: 'center' });

  // Informations entreprise (à gauche)
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'bold');
  doc.text('VOTRE ENTREPRISE', 20, 45);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text('Nom de votre entreprise', 20, 51);
  doc.text('Adresse', 20, 56);
  doc.text('Code postal Ville', 20, 61);
  doc.text('SIRET: 123 456 789 00012', 20, 66);

  // Informations client (à droite)
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('CLIENT', 120, 45);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text(invoice.client_name || 'Nom du client', 120, 51);
  if (invoice.client_address) {
    const addressLines = invoice.client_address.split('\n');
    addressLines.forEach((line, i) => {
      doc.text(line, 120, 56 + (i * 5));
    });
  }
  if (invoice.client_siret) {
    doc.text(`SIRET: ${invoice.client_siret}`, 120, 66);
  }

  // Dates
  const issueDate = invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('fr-FR') : '-';

  doc.setFontSize(9);
  doc.text(`Date d'émission: ${issueDate}`, 20, 80);
  doc.text(`Date d'échéance: ${dueDate}`, 20, 85);

  // Tableau des articles
  const items = Array.isArray(invoice.items) ? invoice.items : (typeof invoice.items === 'string' ? JSON.parse(invoice.items) : []);

  const tableData = items.map(item => [
    item.description || '',
    parseFloat(item.quantity || 0).toFixed(2),
    parseFloat(item.unit_price || 0).toFixed(2) + ' €',
    (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0)).toFixed(2) + ' €'
  ]);

  doc.autoTable({
    startY: 95,
    head: [['Description', 'Quantité', 'Prix unitaire', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [99, 102, 241], // Indigo
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 9,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: 'center', cellWidth: 30 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', cellWidth: 35 }
    }
  });

  // Totaux
  const finalY = doc.lastAutoTable.finalY + 10;
  const total_ht = parseFloat(invoice.total_ht || 0);
  const tva_amount = parseFloat(invoice.tva_amount || 0);
  const total_ttc = parseFloat(invoice.total_ttc || 0);
  const tva_rate = parseFloat(invoice.tva_rate || 20);
  const tva_applicable = invoice.tva_applicable !== false;

  doc.setFontSize(10);
  const xRight = 160;

  doc.text('Total HT:', xRight, finalY);
  doc.text(`${total_ht.toFixed(2)} €`, 190, finalY, { align: 'right' });

  if (tva_applicable) {
    doc.text(`TVA (${tva_rate}%):`, xRight, finalY + 6);
    doc.text(`${tva_amount.toFixed(2)} €`, 190, finalY + 6, { align: 'right' });
  } else {
    doc.setFontSize(8);
    doc.text('TVA non applicable, art. 293 B du CGI', xRight, finalY + 6);
    doc.setFontSize(10);
  }

  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text('Total TTC:', xRight, finalY + 12);
  doc.text(`${total_ttc.toFixed(2)} €`, 190, finalY + 12, { align: 'right' });
  doc.setFont(undefined, 'normal');

  // Acompte si applicable
  if (invoice.acompte_type && invoice.acompte_type !== 'none' && invoice.acompte_amount > 0) {
    doc.setFontSize(10);
    doc.text('Acompte:', xRight, finalY + 20);
    doc.text(`${parseFloat(invoice.acompte_amount).toFixed(2)} €`, 190, finalY + 20, { align: 'right' });

    const reste = total_ttc - parseFloat(invoice.acompte_amount);
    doc.text('Reste à payer:', xRight, finalY + 26);
    doc.text(`${reste.toFixed(2)} €`, 190, finalY + 26, { align: 'right' });
  }

  // Modalités de paiement
  const paymentY = finalY + 35;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('MODALITÉS DE PAIEMENT', 20, paymentY);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  const paymentTerms = invoice.payment_terms_days || 30;
  doc.text(`Règlement à ${paymentTerms} jours`, 20, paymentY + 5);
  doc.text('Paiement par virement bancaire', 20, paymentY + 10);

  // Escompte si applicable
  if (invoice.escompte_percent > 0 && invoice.escompte_days > 0) {
    doc.setTextColor(100, 100, 100);
    doc.text(`Escompte de ${invoice.escompte_percent}% si paiement sous ${invoice.escompte_days} jours`, 20, paymentY + 15);
    const montantEscompte = total_ttc * (1 - invoice.escompte_percent / 100);
    doc.text(`Montant avec escompte: ${montantEscompte.toFixed(2)} €`, 20, paymentY + 20);
    doc.setTextColor(0, 0, 0);
  }

  // CGV si présentes
  if (invoice.cgv) {
    const cgvY = paymentY + 30;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('CONDITIONS GÉNÉRALES DE VENTE', 20, cgvY);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    const cgvLines = doc.splitTextToSize(invoice.cgv, 170);
    doc.text(cgvLines, 20, cgvY + 6);
  }

  // Notes si présentes
  if (invoice.notes) {
    const notesY = invoice.cgv ? paymentY + 65 : paymentY + 35;
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Notes:', 20, notesY);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    const notesLines = doc.splitTextToSize(invoice.notes, 170);
    doc.text(notesLines, 20, notesY + 5);
  }

  // Télécharger
  doc.save(`Facture_${invoice.invoice_number || 'nouvelle'}.pdf`);
};

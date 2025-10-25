# 📋 Améliorations Module Devis

## 🎯 Fonctionnalités à ajouter

### 1. TVA Flexible
**Actuellement** : TVA fixée à 20%

**Amélioration** :
- ✅ Permettre de changer le taux de TVA par devis
- ✅ Sélecteur avec taux prédéfinis : 0%, 5.5%, 10%, 20%
- ✅ Option "TVA personnalisée" pour saisir un taux manuel
- ✅ Sauvegarde du taux TVA dans la base de données

**Champs à ajouter** :
```sql
ALTER TABLE quotes ADD COLUMN tva_rate DECIMAL(5,2) DEFAULT 20.00;
```

**Interface** :
```jsx
<select name="tva_rate" value={formData.tva_rate} onChange={handleChange}>
  <option value="0">TVA 0% (export, formation)</option>
  <option value="5.5">TVA 5.5% (livres, spectacles)</option>
  <option value="10">TVA 10% (restauration, transport)</option>
  <option value="20">TVA 20% (taux normal)</option>
  <option value="custom">Personnalisé...</option>
</select>
```

---

### 2. Conditions Générales de Vente (CGV)
**Amélioration** :
- ✅ Ajouter un champ texte multiligne "Conditions Générales"
- ✅ Option "Utiliser les CGV par défaut" (pré-remplies)
- ✅ CGV affichées au bas du devis PDF
- ✅ Sauvegarde dans les paramètres utilisateur

**Champs à ajouter** :
```sql
ALTER TABLE quotes ADD COLUMN cgv TEXT;
ALTER TABLE users ADD COLUMN default_cgv TEXT;
```

**Exemple CGV par défaut** :
```
CONDITIONS GÉNÉRALES DE VENTE

1. Validité du devis : 30 jours à compter de la date d'émission
2. Paiement : à réception de facture, par virement bancaire
3. Délai de paiement : 30 jours net
4. Retard de paiement : pénalités de 3 fois le taux d'intérêt légal
5. Clause de réserve de propriété jusqu'au paiement intégral
6. Annulation : possible sous 7 jours avec retenue de 10%
```

---

### 3. Acompte
**Amélioration** :
- ✅ Ajouter un champ "Acompte demandé" (en % ou montant fixe)
- ✅ Calcul automatique du montant de l'acompte
- ✅ Affichage sur le devis : "Acompte à la commande : X€ TTC"
- ✅ Reste à payer = Total TTC - Acompte

**Champs à ajouter** :
```sql
ALTER TABLE quotes ADD COLUMN acompte_type VARCHAR(10) DEFAULT 'none'; -- 'none', 'percent', 'fixed'
ALTER TABLE quotes ADD COLUMN acompte_value DECIMAL(10,2) DEFAULT 0;
```

**Interface** :
```jsx
<div className="acompte-section">
  <label>
    <input type="checkbox" checked={hasAcompte} onChange={toggleAcompte} />
    Demander un acompte
  </label>

  {hasAcompte && (
    <>
      <select value={acompteType}>
        <option value="percent">Pourcentage</option>
        <option value="fixed">Montant fixe</option>
      </select>

      <input
        type="number"
        value={acompteValue}
        placeholder={acompteType === 'percent' ? '30' : '500'}
      />

      <p>Acompte : {calculatedAcompte}€ TTC</p>
      <p>Reste à payer : {totalTTC - calculatedAcompte}€ TTC</p>
    </>
  )}
</div>
```

---

### 4. Escompte (Remise pour paiement anticipé)
**Amélioration** :
- ✅ Ajouter un champ "Escompte si paiement sous X jours"
- ✅ Exemple : "Escompte de 2% si paiement sous 8 jours"
- ✅ Affichage sur le devis
- ✅ Calcul automatique du montant avec escompte

**Champs à ajouter** :
```sql
ALTER TABLE quotes ADD COLUMN escompte_percent DECIMAL(5,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN escompte_days INT DEFAULT 0;
```

**Interface** :
```jsx
<div className="escompte-section">
  <label>
    <input type="checkbox" checked={hasEscompte} onChange={toggleEscompte} />
    Proposer un escompte
  </label>

  {hasEscompte && (
    <>
      <input
        type="number"
        value={escomptePercent}
        placeholder="2"
        step="0.1"
      /> %

      <span>si paiement sous</span>

      <input
        type="number"
        value={escompteDays}
        placeholder="8"
      /> jours

      <p>
        Prix normal : {totalTTC}€ TTC<br/>
        Avec escompte : {totalTTC * (1 - escomptePercent/100)}€ TTC
      </p>
    </>
  )}
</div>
```

---

### 5. Relances Automatiques en Cas d'Impayé

**Amélioration** :
- ✅ Système de relances automatiques par email
- ✅ 3 niveaux de relance :
  - **Relance 1** : J+3 après échéance (relance aimable)
  - **Relance 2** : J+10 après échéance (relance ferme)
  - **Relance 3** : J+20 après échéance (mise en demeure)

**Champs à ajouter** :
```sql
ALTER TABLE invoices ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending';
-- Valeurs: 'pending', 'paid', 'overdue', 'relance1', 'relance2', 'relance3'

ALTER TABLE invoices ADD COLUMN due_date DATE;
ALTER TABLE invoices ADD COLUMN last_reminder_date DATE;
ALTER TABLE invoices ADD COLUMN reminder_count INT DEFAULT 0;
```

**Cron job backend** (à exécuter chaque jour) :
```javascript
// backend/jobs/checkUnpaidInvoices.js
const checkUnpaidInvoices = async () => {
  const today = new Date();

  // Récupérer toutes les factures impayées
  const unpaidInvoices = await db.query(`
    SELECT * FROM invoices
    WHERE payment_status IN ('pending', 'overdue', 'relance1', 'relance2')
    AND due_date < $1
  `, [today]);

  for (const invoice of unpaidInvoices) {
    const daysOverdue = Math.floor((today - invoice.due_date) / (1000 * 60 * 60 * 24));

    // Relance 1 : J+3
    if (daysOverdue >= 3 && invoice.reminder_count === 0) {
      await sendReminder(invoice, 'relance1');
      await updateInvoiceStatus(invoice.id, 'relance1', 1);
    }

    // Relance 2 : J+10
    if (daysOverdue >= 10 && invoice.reminder_count === 1) {
      await sendReminder(invoice, 'relance2');
      await updateInvoiceStatus(invoice.id, 'relance2', 2);
    }

    // Relance 3 : J+20 (mise en demeure)
    if (daysOverdue >= 20 && invoice.reminder_count === 2) {
      await sendReminder(invoice, 'relance3');
      await updateInvoiceStatus(invoice.id, 'relance3', 3);
    }
  }
};
```

**Templates d'emails de relance** :

**Relance 1 (aimable)** :
```
Objet : Rappel - Facture N°{invoice_number} échue

Bonjour {client_name},

Nous vous informons que la facture N°{invoice_number} d'un montant de {amount}€ TTC,
échue le {due_date}, n'a pas encore été réglée.

Il s'agit probablement d'un simple oubli de votre part.

Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.

Cordialement,
{company_name}
```

**Relance 2 (ferme)** :
```
Objet : RELANCE - Facture N°{invoice_number} - Retard de paiement

Bonjour {client_name},

Malgré notre précédent rappel, nous constatons que la facture N°{invoice_number}
d'un montant de {amount}€ TTC, échue depuis {days_overdue} jours, demeure impayée.

Nous vous demandons de régulariser votre situation sous 5 jours ouvrés.

À défaut, nous serons contraints d'appliquer les pénalités de retard prévues
dans nos CGV (3 fois le taux d'intérêt légal).

Cordialement,
{company_name}
```

**Relance 3 (mise en demeure)** :
```
Objet : MISE EN DEMEURE - Facture N°{invoice_number}

Bonjour {client_name},

MISE EN DEMEURE

Malgré nos précédentes relances, la facture N°{invoice_number} d'un montant de {amount}€ TTC,
échue depuis {days_overdue} jours, demeure impayée.

Nous vous mettons en demeure de procéder au règlement intégral de cette facture
dans un délai de 8 jours à compter de la réception de ce courrier.

À défaut de règlement dans ce délai, nous serons contraints d'engager une procédure
de recouvrement judiciaire, sans autre avis de notre part.

Des pénalités de retard de {penalty_amount}€ seront appliquées.

Cordialement,
{company_name}
```

**Dashboard - Indicateur d'impayés** :
```jsx
<div className="unpaid-invoices-alert">
  <FiAlertTriangle className="text-red-500" />
  <span>{unpaidCount} facture(s) impayée(s)</span>
  <span className="amount">{unpaidAmount}€ TTC</span>
  <button onClick={goToUnpaidInvoices}>Gérer les impayés</button>
</div>
```

---

### 6. Envoi d'Emails (Simple)

**Amélioration** :
- ✅ Bouton "Envoyer par email" sur chaque devis/facture
- ✅ Email avec PDF en pièce jointe
- ✅ Template email personnalisable
- ✅ Utilisation des identifiants SMTP fournis (mail.pixfeed.net)

**Configuration SMTP** (déjà dans `.env`) :
```env
SMTP_HOST=mail.pixfeed.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=contact@pixfeed.net
SMTP_PASS=TON_MOT_DE_PASSE_ICI
```

**Backend - Service email** :
```javascript
// backend/services/emailService.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const sendQuoteEmail = async (quote, clientEmail, pdfBuffer) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: clientEmail,
    subject: `Devis N°${quote.number}`,
    html: `
      <p>Bonjour,</p>
      <p>Veuillez trouver ci-joint le devis N°${quote.number}.</p>
      <p>Cordialement,<br/>${quote.company_name}</p>
    `,
    attachments: [
      {
        filename: `Devis_${quote.number}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  };

  await transporter.sendMail(mailOptions);
};
```

**Frontend - Bouton d'envoi** :
```jsx
<button
  onClick={handleSendEmail}
  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
>
  <FiMail className="mr-2" />
  Envoyer par email
</button>
```

---

## 📊 Récapitulatif des Modifications DB

```sql
-- Devis/Quotes
ALTER TABLE quotes ADD COLUMN tva_rate DECIMAL(5,2) DEFAULT 20.00;
ALTER TABLE quotes ADD COLUMN cgv TEXT;
ALTER TABLE quotes ADD COLUMN acompte_type VARCHAR(10) DEFAULT 'none';
ALTER TABLE quotes ADD COLUMN acompte_value DECIMAL(10,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN escompte_percent DECIMAL(5,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN escompte_days INT DEFAULT 0;

-- Factures/Invoices
ALTER TABLE invoices ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE invoices ADD COLUMN due_date DATE;
ALTER TABLE invoices ADD COLUMN last_reminder_date DATE;
ALTER TABLE invoices ADD COLUMN reminder_count INT DEFAULT 0;

-- Utilisateurs (CGV par défaut)
ALTER TABLE users ADD COLUMN default_cgv TEXT;
```

---

## 🎯 Ordre d'Implémentation Recommandé

1. **TVA Flexible** (1-2h) - Simple, impact immédiat
2. **Conditions Générales** (1-2h) - Ajout texte + affichage PDF
3. **Acompte** (2-3h) - Calculs + interface
4. **Escompte** (2-3h) - Similaire à l'acompte
5. **Envoi Email Simple** (3-4h) - Configuration SMTP + route backend
6. **Relances Automatiques** (1-2 jours) - Cron job + templates emails + logique métier

**Temps total estimé** : 3-4 jours

---

## 📝 Notes

- Toutes ces améliorations sont **indépendantes** les unes des autres
- Peuvent être implémentées **progressivement**
- Chaque amélioration apporte une **valeur ajoutée immédiate**
- Compatible avec le **Plan Option C** (peut être fait en parallèle)

---

**Dis-moi si tu veux que j'implémente ces fonctionnalités maintenant ou après avoir testé l'API Sirene !** 🚀

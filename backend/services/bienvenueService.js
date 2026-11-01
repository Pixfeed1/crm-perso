// Mail de bienvenue : envoyé au client quand sa souscription est confirmée (paiement Stripe terminé),
// et renvoyable depuis la fiche (abonnement ou contrat de maintenance).
// Contenu : récapitulatif (formule, montant, prélèvement), la suite, conditions en pièce jointe.
const emailService = require('./emailService');
const conditionsService = require('./conditionsService');

const TABLES = ['subscriptions', 'maintenance_contracts'];
// Souscription faite (prélèvement en place) : le mail dit « le prélèvement est en place », il ne part qu'à ce moment-là.
const SOUSCRIT = ['active', 'past_due', 'canceling'];
const PAS_ENCORE = "Le client n'a pas encore souscrit : le mail partira tout seul quand il aura terminé sa souscription.";

const eur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const dateFr = (iso) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};
function periode(interval, count) {
  const n = Math.max(parseInt(count, 10) || 1, 1);
  if (n === 1) return interval === 'year' ? 'par an' : 'par mois';
  return interval === 'year' ? `tous les ${n} ans` : `tous les ${n} mois`;
}

async function charger(db, table, id) {
  if (!TABLES.includes(table)) throw Object.assign(new Error('Type inconnu.'), { status: 400 });
  const sql = table === 'subscriptions'
    ? `SELECT s.*, to_char(s.first_billing_date, 'YYYY-MM-DD') AS first_billing, c.name AS client_name, c.email AS client_email
       FROM subscriptions s LEFT JOIN crm_clients c ON s.client_id = c.id WHERE s.id = $1`
    : `SELECT mc.*, c.name AS client_name, c.email AS client_email
       FROM maintenance_contracts mc LEFT JOIN crm_clients c ON mc.client_id = c.id WHERE mc.id = $1`;
  const row = (await db.pool.query(sql, [id])).rows[0];
  if (!row) throw Object.assign(new Error(table === 'subscriptions' ? 'Abonnement introuvable.' : 'Contrat de maintenance introuvable.'), { status: 404 });
  return row;
}

/** Contenu du mail pour une souscription (sans les pièces jointes, calculées seulement à l'envoi). */
function contenu(table, row) {
  if (table === 'subscriptions') {
    const futur = row.first_billing && new Date(`${row.first_billing}T23:59:59`) > new Date();
    return {
      label: row.label,
      montant: `${eur(row.amount_eur)} ${periode(row.billing_interval, row.interval_count)}`,
      prelevement: futur ? `le premier prélèvement aura lieu le ${dateFr(row.first_billing)}, puis à chaque échéance` : 'automatique, à chaque échéance',
      suite: [
        'Votre abonnement démarre dès maintenant.',
        'Les prélèvements sont gérés par Stripe, notre prestataire de paiement : il vous envoie la confirmation de votre mandat.'
      ],
      documents: ['les conditions de votre abonnement']
    };
  }
  const { label } = conditionsService.maintenanceConditions(row.plan);
  const rapport = { mensuel: 'mensuel', trimestriel: 'trimestriel' }[row.report_frequency || 'mensuel'];
  return {
    label: `Maintenance ${label.replace('_', ' ')}`,
    site: row.site_url || row.site_name || '',
    montant: `${eur(row.monthly_amount)} par mois`,
    prelevement: row.billing_day ? `chaque mois, le ${row.billing_day}` : 'automatique, chaque mois',
    suite: [
      'Je fais un premier tour complet de votre site dans les prochains jours : sauvegarde, mises à jour et contrôles.',
      ...(rapport ? [`Vous recevrez ensuite un rapport ${rapport} qui détaille tout ce qui a été fait.`] : []),
      'Les prélèvements sont gérés par Stripe, notre prestataire de paiement : il vous envoie la confirmation de votre mandat.'
    ],
    documents: ['les conditions de votre formule']
  };
}

function nomFichier(table, row) {
  return table === 'subscriptions' ? 'Conditions_Abonnement.pdf' : `Conditions_Maintenance_${conditionsService.maintenanceConditions(row.plan).label}.pdf`;
}

async function pdfConditions(table, row) {
  if (table === 'subscriptions') {
    return conditionsService.renderConditionsPdf('abonnement', {
      label: row.label, price: eur(row.amount_eur), period: `/ ${periode(row.billing_interval, row.interval_count).replace(/^par /, '')}`,
      first_billing: dateFr(row.first_billing), date: new Date().toLocaleDateString('fr-FR'), client_name: row.client_name || '',
      intro: row.cond_intro || '', included: row.cond_included || '', excluded: row.cond_excluded || '', modalites: row.cond_modalites || ''
    });
  }
  return conditionsService.renderConditionsPdf(conditionsService.maintenanceConditions(row.plan).type, {
    client_name: row.client_name || '', site_url: row.site_url || '', price: eur(row.monthly_amount), date: new Date().toLocaleDateString('fr-FR')
  });
}

async function piecesJointes(table, row) {
  try {
    return [{ filename: nomFichier(table, row), content: Buffer.from(await pdfConditions(table, row)), contentType: 'application/pdf' }];
  } catch (e) {
    console.error('[Bienvenue] conditions non jointes :', e.message);
    return [];
  }
}

/** Aperçu affiché avant l'envoi depuis la fiche : destinataire, objet, corps, dernier envoi. */
async function apercu(db, table, id) {
  const row = await charger(db, table, id);
  const c = contenu(table, row);
  const signature = await emailService.getSelectedSignature(db);
  const mail = emailService.buildWelcomeEmail({ clientName: row.client_name, signature, ...c });
  return {
    recipient: row.client_email || null, hasEmail: !!row.client_email, subject: mail.subject, html: mail.html,
    documents: c.documents, fichier: nomFichier(table, row), sentAt: row.welcome_sent_at || null, sentTo: row.welcome_sent_to || null,
    souscrit: SOUSCRIT.includes(row.billing_status), note: SOUSCRIT.includes(row.billing_status) ? null : PAS_ENCORE
  };
}

/**
 * Envoie le mail de bienvenue. auto = appelé par la confirmation Stripe : jamais deux fois
 * (rien si déjà envoyé, ou si la fiche n'a pas d'email). Depuis la fiche, il est toujours renvoyé.
 */
async function envoyer(db, table, id, { auto = false } = {}) {
  const row = await charger(db, table, id);
  if (auto && row.welcome_sent_at) return { skipped: 'deja_envoye' };
  if (!auto && !SOUSCRIT.includes(row.billing_status)) throw Object.assign(new Error(PAS_ENCORE), { status: 400 });
  if (!row.client_email) {
    if (auto) return { skipped: 'sans_email' };
    throw Object.assign(new Error("La fiche client n'a pas d'adresse email."), { status: 400 });
  }
  // Automatique : on réserve l'envoi en base AVANT d'envoyer. Deux confirmations Stripe simultanées
  // (fin du paiement et passage à « actif ») ne peuvent donc jamais produire deux mails.
  if (auto) {
    const pris = await db.pool.query(`UPDATE ${table} SET welcome_sent_at = NOW(), welcome_sent_to = $1 WHERE id = $2 AND welcome_sent_at IS NULL RETURNING id`, [row.client_email, id]);
    if (!pris.rowCount) return { skipped: 'deja_envoye' };
  }
  try {
    const c = contenu(table, row);
    const signature = await emailService.getSelectedSignature(db);
    const mail = emailService.buildWelcomeEmail({ clientName: row.client_name, signature, ...c });
    await emailService.sendEmail({ to: row.client_email, subject: mail.subject, html: mail.html, text: mail.text, attachments: await piecesJointes(table, row) });
  } catch (e) {
    // envoi raté : la réservation est levée, le bouton de la fiche permet de réessayer
    if (auto) await db.pool.query(`UPDATE ${table} SET welcome_sent_at = NULL, welcome_sent_to = NULL WHERE id = $1`, [id]).catch(() => {});
    throw e;
  }
  await db.pool.query(`UPDATE ${table} SET welcome_sent_at = NOW(), welcome_sent_to = $1, updated_at = NOW() WHERE id = $2`, [row.client_email, id]);
  return { sentTo: row.client_email };
}

/** Routes : GET aperçu et POST envoi, pour une table donnée. */
function routes(table) {
  return {
    apercu: async (req, res) => {
      try { res.json(await apercu(req.app.locals.db, table, req.params.id)); } catch (e) {
        if (!e.status) console.error('[Bienvenue] aperçu :', e.message);
        res.status(e.status || 500).json({ message: e.status ? e.message : 'Aperçu impossible' });
      }
    },
    envoyer: async (req, res) => {
      try { res.json({ success: true, ...(await envoyer(req.app.locals.db, table, req.params.id)) }); } catch (e) {
        if (!e.status) console.error('[Bienvenue] envoi :', e.message);
        res.status(e.status || 500).json({ message: e.status ? e.message : "Envoi du mail de bienvenue impossible" });
      }
    },
    // la pièce jointe telle qu'elle partira (conditions en PDF), pour la relire avant l'envoi
    pdf: async (req, res) => {
      try {
        const row = await charger(req.app.locals.db, table, req.params.id);
        const pdf = Buffer.from(await pdfConditions(table, row));
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nomFichier(table, row)}"` }).send(pdf);
      } catch (e) {
        if (!e.status) console.error('[Bienvenue] pièce jointe :', e.message);
        res.status(e.status || 500).json({ message: e.status ? e.message : 'Pièce jointe impossible à générer' });
      }
    }
  };
}

module.exports = { apercu, envoyer, routes, contenu };

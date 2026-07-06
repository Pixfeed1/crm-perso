// backend/controllers/interactionController.js
//
// Suivi des prises de contact (interactions) — leads ET clients.
// Table polymorphe `interactions` (contact_type + contact_id).

const VALID_TYPES = ['email', 'appel', 'sms', 'note', 'rdv'];
const VALID_CONTACT_TYPES = ['lead', 'client'];
const VALID_REACHED = ['joint', 'pas_reponse', 'message'];
const VALID_STATUS = ['nouveau', 'a_contacter', 'en_discussion', 'devis_envoye', 'gagne', 'perdu', 'pas_business'];
const VALID_CHANNELS = ['appel', 'email', 'sms', 'autre'];

const interactionController = {
  /**
   * GET /api/interactions/contact/:contactType/:contactId
   * Renvoie { relation_status, items } : statut de relation du contact + ses interactions.
   */
  getByContact: async (req, res) => {
    const db = req.app.locals.db;
    const { contactType, contactId } = req.params;
    if (!VALID_CONTACT_TYPES.includes(contactType)) {
      return res.status(400).json({ message: 'Type de contact invalide' });
    }
    try {
      const { rows } = await db.pool.query(
        `SELECT * FROM interactions
         WHERE contact_type = $1 AND contact_id = $2
         ORDER BY date DESC, created_at DESC`,
        [contactType, contactId]
      );
      const table = contactType === 'lead' ? 'leads' : 'crm_clients';
      const sr = await db.pool.query(`SELECT relation_status FROM ${table} WHERE id = $1`, [contactId]);
      const relation_status = (sr.rows[0] && sr.rows[0].relation_status) || 'nouveau';
      res.json({ relation_status, items: rows });
    } catch (error) {
      console.error('[Interaction] Erreur liste:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * POST /api/interactions
   * Crée une interaction (moyen, joint?, date éditable, notes, statut de relation, relance).
   * Si relation_status est fourni, met à jour le statut du contact (leads / crm_clients).
   */
  create: async (req, res) => {
    const db = req.app.locals.db;
    const {
      contact_type, contact_id, type,
      reached = null, date, notes = null, result = null,
      relation_status = null, next_followup_date = null, next_followup_channel = null
    } = req.body || {};

    if (!VALID_CONTACT_TYPES.includes(contact_type) || !contact_id) {
      return res.status(400).json({ message: 'contact_type et contact_id requis' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `Type invalide (${VALID_TYPES.join(', ')})` });
    }
    const reachedVal = reached && VALID_REACHED.includes(reached) ? reached : null;
    const statusVal = relation_status && VALID_STATUS.includes(relation_status) ? relation_status : null;
    const channelVal = next_followup_date && next_followup_channel && VALID_CHANNELS.includes(next_followup_channel) ? next_followup_channel : null;

    try {
      const { rows } = await db.pool.query(
        `INSERT INTO interactions (contact_type, contact_id, type, reached, date, notes, result, relation_status, next_followup_date, next_followup_channel, followup_done)
         VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6, $7, $8, $9, $10, FALSE)
         RETURNING *`,
        [contact_type, contact_id, type, reachedVal, date || null, notes, result, statusVal, next_followup_date || null, channelVal]
      );

      // Mise à jour du statut de relation du contact (best-effort).
      if (statusVal) {
        const table = contact_type === 'lead' ? 'leads' : 'crm_clients';
        try {
          await db.pool.query(`UPDATE ${table} SET relation_status = $1 WHERE id = $2`, [statusVal, contact_id]);
        } catch (e) {
          console.error('[Interaction] Echec maj relation_status:', e.message);
        }
      }

      res.status(201).json(rows[0]);
    } catch (error) {
      console.error('[Interaction] Erreur création:', error);
      res.status(500).json({ message: "Erreur lors de la création de l'interaction" });
    }
  },

  /**
   * PATCH /api/interactions/contact-status
   * Change directement le statut de relation d'un contact (ex. "Pas de business" /
   * réactivation), sans logguer d'échange. Body { contact_type, contact_id, relation_status }.
   */
  setContactStatus: async (req, res) => {
    const db = req.app.locals.db;
    const { contact_type, contact_id, relation_status } = req.body || {};
    if (!VALID_CONTACT_TYPES.includes(contact_type) || !contact_id) {
      return res.status(400).json({ message: 'contact_type et contact_id requis' });
    }
    if (!VALID_STATUS.includes(relation_status)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }
    try {
      const table = contact_type === 'lead' ? 'leads' : 'crm_clients';
      const r = await db.pool.query(`UPDATE ${table} SET relation_status = $1 WHERE id = $2 RETURNING id`, [relation_status, contact_id]);
      if (r.rowCount === 0) return res.status(404).json({ message: 'Contact introuvable' });
      res.json({ success: true, relation_status });
    } catch (error) {
      console.error('[Interaction] Erreur maj statut:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * PATCH /api/interactions/:id/followup-done
   * Marque la relance comme faite (ou rouvre via body { done:false }).
   */
  markFollowupDone: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const done = req.body && req.body.done === false ? false : true;
    try {
      const { rows } = await db.pool.query(
        'UPDATE interactions SET followup_done = $1 WHERE id = $2 RETURNING *',
        [done, id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Interaction introuvable' });
      }
      res.json(rows[0]);
    } catch (error) {
      console.error('[Interaction] Erreur maj relance:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * DELETE /api/interactions/:id
   */
  remove: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    try {
      const result = await db.pool.query('DELETE FROM interactions WHERE id = $1 RETURNING id', [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Interaction introuvable' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('[Interaction] Erreur suppression:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * GET /api/interactions/followups
   * Relances dues (aujourd'hui ou en retard) et non faites, avec nom du contact.
   */
  getFollowups: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query(
        `SELECT i.*,
                COALESCE(cl.name, l.name) AS contact_name,
                COALESCE(cl.email, l.email) AS contact_email,
                COALESCE(cl.phone, l.phone) AS contact_phone
         FROM interactions i
         LEFT JOIN crm_clients cl ON i.contact_type = 'client' AND cl.id = i.contact_id
         LEFT JOIN leads l ON i.contact_type = 'lead' AND l.id = i.contact_id
         WHERE i.followup_done = FALSE
           AND i.next_followup_date IS NOT NULL
           AND i.next_followup_date <= CURRENT_DATE
         ORDER BY i.next_followup_date ASC`
      );
      res.json(rows);
    } catch (error) {
      console.error('[Interaction] Erreur relances:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * GET /api/interactions/outreach-summary
   * Résumé outreach multi-canal des LEADS : dernier statut par (lead, canal) + prochaine
   * relance en attente. Les interactions d'outreach sont taggées via la colonne `result`
   * ('outreach:<canal>:<statut>', canal: email|facebook|instagram, statut: sent|responded|
   * not_interested) — le panneau Outreach écrit des interactions STANDARD (visibles dans
   * le Suivi/historique) et ce résumé les relit. Renvoie { [lead_id]: { email: {...},
   * facebook: {...}, instagram: {...}, next_followup } }.
   */
  getOutreachSummary: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const [statuses, followups] = await Promise.all([
        db.pool.query(
          `SELECT DISTINCT ON (contact_id, split_part(result, ':', 2))
                  contact_id, split_part(result, ':', 2) AS channel,
                  split_part(result, ':', 3) AS status, date
           FROM interactions
           WHERE contact_type = 'lead' AND result LIKE 'outreach:%'
           ORDER BY contact_id, split_part(result, ':', 2), date DESC`
        ),
        db.pool.query(
          `SELECT contact_id, MIN(next_followup_date) AS next_followup
           FROM interactions
           WHERE contact_type = 'lead' AND result LIKE 'outreach:%'
             AND next_followup_date IS NOT NULL AND followup_done = FALSE
           GROUP BY contact_id`
        )
      ]);
      const out = {};
      for (const r of statuses.rows) {
        if (!out[r.contact_id]) out[r.contact_id] = {};
        out[r.contact_id][r.channel] = { status: r.status, date: r.date };
      }
      for (const r of followups.rows) {
        if (!out[r.contact_id]) out[r.contact_id] = {};
        out[r.contact_id].next_followup = r.next_followup;
      }
      res.json(out);
    } catch (e) {
      console.error('[Interactions] getOutreachSummary:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * GET /api/interactions/cockpit
   * Cockpit "Suivi" : TOUS les prospects + clients (même sans échange), avec leur dernière
   * interaction (dernier contact + joint?) et leur prochaine relance (date + canal).
   * Renvoie toutes les lignes + les compteurs du bandeau. Le filtrage fin (recherche,
   * plateforme, onglets) est fait côté client sur ce jeu unique. UNE seule requête.
   */
  getCockpit: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query(
        `WITH contacts AS (
           SELECT 'client'::text AS contact_type, id AS contact_id, name AS contact_name, email AS contact_email, phone AS contact_phone, COALESCE(relation_status, 'nouveau') AS relation_status, platform, NULL::text AS site FROM crm_clients
           UNION ALL
           SELECT 'lead'::text, id, name, email, phone, COALESCE(relation_status, 'nouveau'), platform, company FROM leads
         ),
         last_ex AS (
           SELECT DISTINCT ON (contact_type, contact_id)
                  contact_type, contact_id, type AS last_type, reached AS last_reached, date AS last_date, result AS last_result
           FROM interactions
           ORDER BY contact_type, contact_id, date DESC, created_at DESC
         ),
         next_ex AS (
           SELECT DISTINCT ON (contact_type, contact_id)
                  contact_type, contact_id, id AS followup_id, next_followup_date AS next_followup, next_followup_channel
           FROM interactions
           WHERE followup_done = FALSE AND next_followup_date IS NOT NULL
           ORDER BY contact_type, contact_id, next_followup_date ASC
         )
         SELECT c.contact_type, c.contact_id, c.contact_name, c.contact_email, c.contact_phone, c.relation_status, c.platform, c.site,
                n.next_followup, n.next_followup_channel, n.followup_id,
                l.last_type, l.last_reached, l.last_date, l.last_result
         FROM contacts c
         LEFT JOIN last_ex l ON l.contact_type = c.contact_type AND l.contact_id = c.contact_id
         LEFT JOIN next_ex n ON n.contact_type = c.contact_type AND n.contact_id = c.contact_id
         ORDER BY (n.next_followup IS NULL), n.next_followup ASC, l.last_date DESC NULLS LAST, c.contact_name ASC`
      );

      // Compteurs du bandeau (calculés sur le jeu déjà chargé). Les vues actives
      // excluent "Pas de business" (sauf son propre compteur).
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
      const active = (r) => r.relation_status !== 'pas_business';
      const stats = {
        relance_today: rows.filter((r) => active(r) && r.next_followup && dayOf(r.next_followup).getTime() === today.getTime()).length,
        overdue: rows.filter((r) => active(r) && r.next_followup && dayOf(r.next_followup) < today).length,
        nouveaux: rows.filter((r) => r.relation_status === 'nouveau').length,
        en_discussion: rows.filter((r) => r.relation_status === 'en_discussion').length,
        sans_reponse: rows.filter((r) => active(r) && r.relation_status !== 'gagne' && r.relation_status !== 'perdu' && r.last_reached === 'pas_reponse').length,
        pas_business: rows.filter((r) => r.relation_status === 'pas_business').length
      };

      res.json({ stats, contacts: rows });
    } catch (error) {
      console.error('[Interaction] Erreur cockpit suivi:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = interactionController;

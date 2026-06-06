// backend/controllers/interactionController.js
//
// Suivi des prises de contact (interactions) — leads ET clients.
// Table polymorphe `interactions` (contact_type + contact_id).

const VALID_TYPES = ['email', 'appel', 'sms', 'note', 'rdv'];
const VALID_CONTACT_TYPES = ['lead', 'client'];

const interactionController = {
  /**
   * GET /api/interactions/contact/:contactType/:contactId
   * Liste des interactions d'un contact (plus récent en haut).
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
      res.json(rows);
    } catch (error) {
      console.error('[Interaction] Erreur liste:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * POST /api/interactions
   * Crée une interaction (appel / sms / note / rdv / email).
   */
  create: async (req, res) => {
    const db = req.app.locals.db;
    const {
      contact_type, contact_id, type,
      date, notes = null, result = null, next_followup_date = null
    } = req.body || {};

    if (!VALID_CONTACT_TYPES.includes(contact_type) || !contact_id) {
      return res.status(400).json({ message: 'contact_type et contact_id requis' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `Type invalide (${VALID_TYPES.join(', ')})` });
    }

    try {
      const { rows } = await db.pool.query(
        `INSERT INTO interactions (contact_type, contact_id, type, date, notes, result, next_followup_date, followup_done)
         VALUES ($1, $2, $3, COALESCE($4, NOW()), $5, $6, $7, FALSE)
         RETURNING *`,
        [contact_type, contact_id, type, date || null, notes, result, next_followup_date || null]
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      console.error('[Interaction] Erreur création:', error);
      res.status(500).json({ message: "Erreur lors de la création de l'interaction" });
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
   * GET /api/interactions/cockpit?filter=all|relance_today|overdue|prospects|clients
   * Cockpit "Suivi" : un contact par ligne (prospects + clients ayant au moins un
   * échange), avec dernier échange + prochaine relance. UNE seule requête (pas de N+1).
   */
  getCockpit: async (req, res) => {
    const db = req.app.locals.db;
    const filter = (req.query.filter || 'all').toString();
    try {
      const { rows } = await db.pool.query(
        `WITH agg AS (
           SELECT contact_type, contact_id,
                  COUNT(*) FILTER (WHERE date >= NOW() - INTERVAL '7 days') AS exchanges_7d
           FROM interactions
           GROUP BY contact_type, contact_id
         ),
         last_ex AS (
           SELECT DISTINCT ON (contact_type, contact_id)
                  contact_type, contact_id, type AS last_type, date AS last_date, result AS last_result
           FROM interactions
           ORDER BY contact_type, contact_id, date DESC, created_at DESC
         ),
         next_ex AS (
           SELECT DISTINCT ON (contact_type, contact_id)
                  contact_type, contact_id, id AS followup_id, next_followup_date AS next_followup
           FROM interactions
           WHERE followup_done = FALSE AND next_followup_date IS NOT NULL
           ORDER BY contact_type, contact_id, next_followup_date ASC
         )
         SELECT a.contact_type, a.contact_id, a.exchanges_7d,
                n.next_followup, n.followup_id,
                l.last_type, l.last_date, l.last_result,
                COALESCE(cl.name, le.name) AS contact_name,
                COALESCE(cl.email, le.email) AS contact_email,
                COALESCE(cl.phone, le.phone) AS contact_phone
         FROM agg a
         JOIN last_ex l ON l.contact_type = a.contact_type AND l.contact_id = a.contact_id
         LEFT JOIN next_ex n ON n.contact_type = a.contact_type AND n.contact_id = a.contact_id
         LEFT JOIN crm_clients cl ON a.contact_type = 'client' AND cl.id = a.contact_id
         LEFT JOIN leads le ON a.contact_type = 'lead' AND le.id = a.contact_id
         ORDER BY (n.next_followup IS NULL), n.next_followup ASC, l.last_date DESC`
      );

      // Stats focus (calculées sur le jeu déjà chargé, sans requête supplémentaire)
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
      const stats = {
        relance_today: rows.filter((r) => r.next_followup && dayOf(r.next_followup).getTime() === today.getTime()).length,
        overdue: rows.filter((r) => r.next_followup && dayOf(r.next_followup) < today).length,
        exchanges_7d: rows.reduce((s, r) => s + Number(r.exchanges_7d || 0), 0)
      };

      let contacts = rows;
      if (filter === 'relance_today') {
        contacts = rows.filter((r) => r.next_followup && dayOf(r.next_followup).getTime() === today.getTime());
      } else if (filter === 'overdue') {
        contacts = rows.filter((r) => r.next_followup && dayOf(r.next_followup) < today);
      } else if (filter === 'prospects') {
        contacts = rows.filter((r) => r.contact_type === 'lead');
      } else if (filter === 'clients') {
        contacts = rows.filter((r) => r.contact_type === 'client');
      }

      res.json({ stats, contacts });
    } catch (error) {
      console.error('[Interaction] Erreur cockpit suivi:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = interactionController;

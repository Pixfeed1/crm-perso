// backend/controllers/emailTemplateController.js
const VALID_CAT = ['contact', 'relance', 'cloture', 'interesse', 'presta', 'woo', 'autre'];

module.exports = {
  list: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query('SELECT * FROM email_templates ORDER BY category, name');
      res.json(rows);
    } catch (e) { console.error('[EmailTemplate] list:', e); res.status(500).json({ message: 'Erreur serveur' }); }
  },
  create: async (req, res) => {
    const db = req.app.locals.db;
    const { name, category = 'autre', subject = '', body = '' } = req.body || {};
    if (!name) return res.status(400).json({ message: 'Nom requis' });
    const cat = VALID_CAT.includes(category) ? category : 'autre';
    try {
      const { rows } = await db.pool.query(
        'INSERT INTO email_templates (name, category, subject, body) VALUES ($1,$2,$3,$4) RETURNING *',
        [name, cat, subject, body]
      );
      res.status(201).json(rows[0]);
    } catch (e) { console.error('[EmailTemplate] create:', e); res.status(500).json({ message: 'Erreur serveur' }); }
  },
  update: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { name, category, subject, body } = req.body || {};
    const cat = category && VALID_CAT.includes(category) ? category : null;
    try {
      const { rows } = await db.pool.query(
        `UPDATE email_templates SET
           name = COALESCE($1, name), category = COALESCE($2, category),
           subject = COALESCE($3, subject), body = COALESCE($4, body), updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [name || null, cat, subject != null ? subject : null, body != null ? body : null, id]
      );
      if (rows.length === 0) return res.status(404).json({ message: 'Modèle introuvable' });
      res.json(rows[0]);
    } catch (e) { console.error('[EmailTemplate] update:', e); res.status(500).json({ message: 'Erreur serveur' }); }
  },
  remove: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const r = await db.pool.query('DELETE FROM email_templates WHERE id = $1 RETURNING id', [req.params.id]);
      if (r.rowCount === 0) return res.status(404).json({ message: 'Modèle introuvable' });
      res.json({ success: true });
    } catch (e) { console.error('[EmailTemplate] remove:', e); res.status(500).json({ message: 'Erreur serveur' }); }
  }
};

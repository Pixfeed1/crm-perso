// backend/controllers/emailSignatureController.js
module.exports = {
  list: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query('SELECT * FROM email_signatures ORDER BY is_default DESC, name');
      res.json(rows);
    } catch (e) { console.error('[EmailSignature] list:', e); res.status(500).json({ message: 'Erreur serveur' }); }
  },
  create: async (req, res) => {
    const db = req.app.locals.db;
    const { name, content = '', is_default = false } = req.body || {};
    if (!name) return res.status(400).json({ message: 'Nom requis' });
    try {
      if (is_default) await db.pool.query('UPDATE email_signatures SET is_default = FALSE');
      const { rows } = await db.pool.query(
        'INSERT INTO email_signatures (name, content, is_default) VALUES ($1,$2,$3) RETURNING *',
        [name, content, !!is_default]
      );
      res.status(201).json(rows[0]);
    } catch (e) { console.error('[EmailSignature] create:', e); res.status(500).json({ message: 'Erreur serveur' }); }
  },
  update: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { name, content, is_default } = req.body || {};
    try {
      if (is_default === true) await db.pool.query('UPDATE email_signatures SET is_default = FALSE');
      const { rows } = await db.pool.query(
        `UPDATE email_signatures SET
           name = COALESCE($1, name), content = COALESCE($2, content),
           is_default = COALESCE($3, is_default), updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [name || null, content != null ? content : null, typeof is_default === 'boolean' ? is_default : null, id]
      );
      if (rows.length === 0) return res.status(404).json({ message: 'Signature introuvable' });
      res.json(rows[0]);
    } catch (e) { console.error('[EmailSignature] update:', e); res.status(500).json({ message: 'Erreur serveur' }); }
  },
  remove: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const r = await db.pool.query('DELETE FROM email_signatures WHERE id = $1 RETURNING id', [req.params.id]);
      if (r.rowCount === 0) return res.status(404).json({ message: 'Signature introuvable' });
      res.json({ success: true });
    } catch (e) { console.error('[EmailSignature] remove:', e); res.status(500).json({ message: 'Erreur serveur' }); }
  }
};

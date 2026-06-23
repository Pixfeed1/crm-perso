// backend/controllers/veilleController.js
const { runVeille, getRunStatus } = require('../services/veilleMissions');
const veilleWorker = require('../services/veilleMissionsWorker');

const veilleController = {
  // GET /api/veille/annonces?statut=&score_min=&q=
  getAnnonces: async (req, res) => {
    const db = req.app.locals.db;
    const { statut, score_min, q } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (statut) { conditions.push(`statut = $${i++}`); params.push(statut); }
    if (score_min) { conditions.push(`score >= $${i++}`); params.push(parseInt(score_min, 10) || 0); }
    if (q) { conditions.push(`(LOWER(titre) LIKE $${i} OR LOWER(description) LIKE $${i})`); params.push(`%${q.toLowerCase()}%`); i++; }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    try {
      const result = await db.pool.query(
        `SELECT * FROM veille_annonces ${where} ORDER BY (statut = 'ecarte'), score DESC, created_at DESC`,
        params
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[Veille] getAnnonces:', error.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/veille/annonces/:id/ecarter
  ecarter: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const r = await db.pool.query(
        "UPDATE veille_annonces SET statut = 'ecarte' WHERE id = $1 RETURNING id",
        [req.params.id]
      );
      if (r.rows.length === 0) return res.status(404).json({ message: 'Annonce introuvable' });
      res.json({ success: true });
    } catch (error) {
      console.error('[Veille] ecarter:', error.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/veille/criteres
  getCriteres: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const r = await db.pool.query('SELECT * FROM veille_criteres ORDER BY id ASC LIMIT 1');
      res.json(r.rows[0] || null);
    } catch (error) {
      console.error('[Veille] getCriteres:', error.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // PUT /api/veille/criteres
  updateCriteres: async (req, res) => {
    const db = req.app.locals.db;
    const b = req.body || {};
    const toArr = (v) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : undefined;
    try {
      const cur = (await db.pool.query('SELECT * FROM veille_criteres ORDER BY id ASC LIMIT 1')).rows[0];
      if (!cur) return res.status(404).json({ message: 'Critères introuvables' });
      const motsRequis = toArr(b.mots_requis) ?? cur.mots_requis;
      const motsExclus = toArr(b.mots_exclus) ?? cur.mots_exclus;
      const fullRemoteOnly = b.full_remote_only === undefined ? cur.full_remote_only : !!b.full_remote_only;
      const tjmMin = b.tjm_min === undefined || isNaN(Number(b.tjm_min)) ? cur.tjm_min : parseInt(b.tjm_min, 10);
      const garderSansMontant = b.garder_sans_montant === undefined ? cur.garder_sans_montant : !!b.garder_sans_montant;
      const profil = b.profil_reference === undefined ? cur.profil_reference : String(b.profil_reference);
      const heureRun = b.heure_run === undefined ? cur.heure_run : String(b.heure_run);
      const actif = b.actif === undefined ? cur.actif : !!b.actif;

      const upd = await db.pool.query(
        `UPDATE veille_criteres SET
           mots_requis=$2, mots_exclus=$3, full_remote_only=$4, tjm_min=$5,
           garder_sans_montant=$6, profil_reference=$7, heure_run=$8, actif=$9, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [cur.id, motsRequis, motsExclus, fullRemoteOnly, tjmMin, garderSansMontant, profil, heureRun, actif]
      );
      // Reprogrammer le cron si l'heure a changé.
      veilleWorker.reschedule().catch((e) => console.error('[Veille] reschedule:', e.message));
      res.json(upd.rows[0]);
    } catch (error) {
      console.error('[Veille] updateCriteres:', error.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/veille/run  (déclenchement manuel : lance en arrière-plan + suivi via /run/status)
  run: async (req, res) => {
    const db = req.app.locals.db;
    if (getRunStatus().running) {
      return res.status(409).json({ message: 'Un run est déjà en cours', status: getRunStatus() });
    }
    // Lancement en arrière-plan : la réponse part tout de suite, le front poll /run/status.
    runVeille(db).catch((e) => console.error('[Veille] run arrière-plan:', e.message));
    res.status(202).json({ started: true, status: getRunStatus() });
  },

  // GET /api/veille/run/status  (suivi temps réel de l'étape courante)
  runStatus: (req, res) => {
    res.json(getRunStatus());
  }
};

module.exports = veilleController;

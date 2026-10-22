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
    if (statut) {
      // Filtre explicite (ex. statut=ecarte pour l'onglet "Écartées").
      conditions.push(`statut = $${i++}`); params.push(statut);
    } else {
      // Par défaut : on masque les annonces écartées (elles ne reviennent pas).
      conditions.push(`statut <> 'ecarte'`);
    }
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

  // POST /api/veille/annonces/:id/reactiver  (remet une annonce écartée en 'nouveau')
  reactiver: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const r = await db.pool.query(
        "UPDATE veille_annonces SET statut = 'nouveau' WHERE id = $1 RETURNING id",
        [req.params.id]
      );
      if (r.rows.length === 0) return res.status(404).json({ message: 'Annonce introuvable' });
      res.json({ success: true });
    } catch (error) {
      console.error('[Veille] reactiver:', error.message);
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
      // Flux RSS/Atom : [{ label, url }], 20 max, URL http(s) obligatoire.
      let flux = cur.flux;
      if (Array.isArray(b.flux)) {
        flux = b.flux
          .map((f) => ({ label: String((f && f.label) || '').trim().slice(0, 60), url: String((f && f.url) || '').trim() }))
          .filter((f) => /^https?:\/\/\S+$/i.test(f.url))
          .slice(0, 20)
          .map((f) => ({ label: f.label || f.url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0], url: f.url }));
      }

      const upd = await db.pool.query(
        `UPDATE veille_criteres SET
           mots_requis=$2, mots_exclus=$3, full_remote_only=$4, tjm_min=$5,
           garder_sans_montant=$6, profil_reference=$7, heure_run=$8, actif=$9, flux=$10, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [cur.id, motsRequis, motsExclus, fullRemoteOnly, tjmMin, garderSansMontant, profil, heureRun, actif, JSON.stringify(flux || [])]
      );
      // Reprogrammer le cron si l'heure a changé.
      veilleWorker.reschedule().catch((e) => console.error('[Veille] reschedule:', e.message));
      res.json(upd.rows[0]);
    } catch (error) {
      console.error('[Veille] updateCriteres:', error.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/veille/annonces/:id/prospect -> fiche prospect créée depuis l'annonce (une seule fois)
  creerProspect: async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Annonce invalide' });
    try {
      const a = (await db.pool.query('SELECT * FROM veille_annonces WHERE id = $1', [id])).rows[0];
      if (!a) return res.status(404).json({ message: 'Annonce introuvable' });
      if (a.lead_id) return res.json({ lead_id: a.lead_id, deja: true });
      let host = '';
      try { host = new URL(a.lien).hostname.replace(/^www\./, ''); } catch { /* lien absent ou invalide */ }
      // Sans raison sociale (flux, forum) : la fiche porte le titre de l'annonce et est marquée
      // « entreprise à identifier » ; un pseudo n'est jamais pris pour un nom d'entreprise.
      const sansEntreprise = !a.entreprise;
      const nom = (a.entreprise || a.titre || host || 'Annonce veille').trim().slice(0, 120);
      const notes = [
        sansEntreprise ? 'ENTREPRISE À IDENTIFIER : annonce sans raison sociale (forum ou flux). Vérifier qui est derrière le message avant tout contact, et contacter par le canal de la plateforme ou l\'adresse professionnelle publiée sur son site.' : null,
        `Annonce : ${a.titre || ''}`,
        a.lien ? `Lien : ${a.lien}` : null,
        a.source_label ? `Source : ${a.source_label.replace(/^via\s+/i, '')}` : null,
        a.date_annonce ? `Publiée le ${new Date(a.date_annonce).toLocaleDateString('fr-FR')}` : null,
        a.montant ? `Montant : ${a.montant}` : null,
        a.raison ? `Qualification : ${a.raison}` : null,
        a.description ? `\n${String(a.description).slice(0, 1500)}` : null
      ].filter(Boolean).join('\n');
      const ins = await db.pool.query(
        `INSERT INTO leads (name, company, type, status, source, notes, relation_status, website, score, created_at, updated_at)
         VALUES ($1, $2, 'company', 'nouveau', 'Veille missions', $3, 'nouveau', $4, $5, NOW(), NOW()) RETURNING id`,
        [nom, a.entreprise || null, notes, a.lien || null, Math.max(0, Math.min(100, a.score || 0))]
      );
      const leadId = ins.rows[0].id;
      await db.pool.query("UPDATE veille_annonces SET lead_id = $2, statut = CASE WHEN statut = 'nouveau' THEN 'traite' ELSE statut END WHERE id = $1", [id, leadId]);
      res.status(201).json({ lead_id: leadId, deja: false });
    } catch (error) {
      console.error('[Veille] creerProspect:', error.message);
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
    // force:true -> un run MANUEL passe outre la pause (flag actif). Seul le cron la respecte.
    runVeille(db, { force: true }).catch((e) => console.error('[Veille] run arrière-plan:', e.message));
    res.status(202).json({ started: true, status: getRunStatus() });
  },

  // GET /api/veille/run/status  (suivi temps réel de l'étape courante)
  runStatus: (req, res) => {
    res.json(getRunStatus());
  }
};

module.exports = veilleController;

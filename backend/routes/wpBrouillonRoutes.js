// Brouillons WordPress préparés par Claude (outils MCP demander_depot / prepare_draft).
// - POST /api/wp-depot/:jeton : ENVOI public par le lien à usage unique (zip « lot » ou « fichiers »).
// - POST /api/wp-brouillon/depot et /preparer : réservés au serveur MCP (secret partagé OUTILS_MCP_SECRET).
const express = require('express');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const depots = require('../services/wpBrouillon/depot');
const { preparer } = require('../services/wpBrouillon/preparer');

const envoi = multer({
  dest: path.join(os.tmpdir(), 'wp-depot-envois'),
  limits: { fileSize: 600 * 1024 * 1024, files: 300, fields: 10 },
});

function secretOk(req) {
  const attendu = process.env.OUTILS_MCP_SECRET || '';
  const recu = String(req.headers['x-outils-secret'] || '');
  if (attendu.length < 32 || recu.length !== attendu.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recu), Buffer.from(attendu));
}
const reserveMcp = (req, res, next) => (secretOk(req) ? next() : res.status(401).json({ message: 'non autorisé' }));
const repondre = (res, e) => {
  if (!e.status || e.status >= 500) console.error('[wp-brouillon]', e.message);
  res.status(e.status || 500).json({ message: e.status ? e.message : 'erreur interne' });
};

const depot = express.Router();
depot.post('/:jeton', envoi.any(), async (req, res) => {
  try { res.json(await depots.recevoir(req.app.locals.db, req.params.jeton, req.files || [])); }
  catch (e) { repondre(res, e); }
});
depot.use((err, req, res, next) => repondre(res, Object.assign(err, { status: err.code === 'LIMIT_FILE_SIZE' ? 413 : 400 })));

const mcp = express.Router();
mcp.use(express.json({ limit: '100kb' }), reserveMcp);
mcp.post('/depot', async (req, res) => {
  try {
    const d = await depots.creer(req.app.locals.db, Number(req.body.site_id));
    const publique = (process.env.CRM_PUBLIC_URL || 'https://crm.pixfeed.net').replace(/\/+$/, '');
    res.json({ depot: d.depot, url_envoi: `${publique}/api/wp-depot/${d.jeton}`, expire_le: d.expire_le, duree_minutes: depots.DUREE_MIN });
  } catch (e) { repondre(res, e); }
});
mcp.post('/preparer', async (req, res) => {
  try {
    res.json(await preparer(req.app.locals.db, {
      depot: Number(req.body.depot), simulation: req.body.simulation !== false, creer_etiquettes: req.body.creer_etiquettes === true,
    }));
  } catch (e) { repondre(res, e); }
});

module.exports = { depot, mcp };

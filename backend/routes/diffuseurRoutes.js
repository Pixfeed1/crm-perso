// backend/routes/diffuseurRoutes.js
// Diffuseur — monté sous /api/diffuseur.
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const ctrl = require('../controllers/diffuseurController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Envoi des rendus : limite propre à ce module (50 Mo par fichier, 12 fichiers par envoi),
// images seulement. Le fichier reçu est traité puis déplacé dans le dossier des originaux.
const tmpDir = path.join(__dirname, '..', 'uploads', 'diffuseur', 'tmp');
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdir(tmpDir, { recursive: true }, (e) => cb(e, tmpDir)); },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '')}`)
  }),
  fileFilter: (req, file, cb) => {
    if (['image/png', 'image/jpeg', 'image/webp', 'image/tiff'].includes(file.mimetype)) return cb(null, true);
    return cb(Object.assign(new Error(`Type de fichier non accepté : ${file.mimetype} (PNG, JPEG, WebP ou TIFF)`), { status: 415 }));
  },
  limits: { fileSize: 50 * 1024 * 1024, files: 12 }
});
const recevoir = (req, res, next) => upload.array('images', 12)(req, res, (err) => {
  if (!err) return next();
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd : 50 Mo au maximum par image'
    : err.code === 'LIMIT_FILE_COUNT' ? '12 images au maximum par envoi' : err.message;
  return res.status(err.status || 413).json({ message: msg });
});

router.get('/reglages', ctrl.getReglages);
router.put('/reglages', ctrl.updateReglages);
router.get('/scenes', ctrl.listScenes);
router.post('/scenes', ctrl.createScene);
router.get('/scenes/:id', ctrl.getScene);
router.patch('/scenes/:id', ctrl.updateScene);
router.delete('/scenes/:id', ctrl.deleteScene);
router.post('/scenes/:id/images', recevoir, ctrl.addImages);
router.patch('/images/:imageId', ctrl.updateImage);
router.delete('/images/:imageId', ctrl.deleteImage);
router.post('/images/:imageId/textes', ctrl.genererTextes);
router.post('/planning', ctrl.planifier);
router.get('/posts', ctrl.listPosts);
router.post('/posts/validate', ctrl.validerPlusieurs);
router.patch('/posts/:postId', ctrl.updatePost);
router.get('/export/:cible', ctrl.exporter);

module.exports = router;

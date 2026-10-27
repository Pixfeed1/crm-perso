// backend/services/diffuseurTextes.js
// Diffuseur : textes des publications rédigés par Claude, à partir de l'image elle-même.
// Un appel par image : Claude voit le rendu et renvoie, en français et en anglais, la légende
// Instagram, le titre et la description Pinterest, les textes courts X et Bluesky, le texte
// alternatif et quelques hashtags. La réponse est contrainte par un schéma JSON (sorties
// structurées), puis contrôlée par le code : aucune émoticône, aucune liste, aucun tiret cadratin,
// identité MVaertan seulement. Une seule nouvelle tentative si une règle est enfreinte.
// La mention « lien affilié », le lien et les hashtags finaux sont ajoutés par le code (composer),
// jamais laissés au modèle.
const Anthropic = require('@anthropic-ai/sdk');
const { controlerTexte, nettoyer } = require('../utils/diffuseurRules');

const MODELE = process.env.DIFFUSEUR_MODEL || 'claude-sonnet-5-5';

const TEXTES = { type: 'object', properties: { fr: { type: 'string' }, en: { type: 'string' } }, required: ['fr', 'en'], additionalProperties: false };
const SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    alt: TEXTES,
    instagram: TEXTES,
    pinterest: {
      type: 'object',
      properties: { titre_fr: { type: 'string' }, titre_en: { type: 'string' }, description_fr: { type: 'string' }, description_en: { type: 'string' } },
      required: ['titre_fr', 'titre_en', 'description_fr', 'description_en'],
      additionalProperties: false
    },
    court: TEXTES,
    hashtags_fr: { type: 'array', items: { type: 'string' } },
    hashtags_en: { type: 'array', items: { type: 'string' } },
    mots_cles: { type: 'array', items: { type: 'string' } }
  },
  required: ['description', 'alt', 'instagram', 'pinterest', 'court', 'hashtags_fr', 'hashtags_en', 'mots_cles'],
  additionalProperties: false
};

const SYSTEM = `Tu rédiges les textes de diffusion des créations 3D de Michael Vaertan, qui signe MVaertan. Ce sont des rendus réalisés avec Daz Studio. Tu écris en son nom, à la première personne quand c'est naturel, comme un artiste qui présente son travail.

Règles absolues, pour chaque texte, en français comme en anglais :
- Aucune émoticône, aucun pictogramme, aucune coche, aucune flèche.
- Aucune liste : pas de puces, pas de tirets en début de ligne, pas de numérotation.
- Aucun tiret cadratin ni demi-cadratin. Utilise des virgules ou des phrases séparées.
- Aucun hashtag dans les textes : les hashtags vont uniquement dans les champs prévus, sans le signe #.
- Aucun lien, aucune adresse web, aucune mention de lien affilié : le code les ajoute lui-même.
- L'identité est uniquement MVaertan ou Michael Vaertan. Ne cite jamais d'autre marque ou société comme auteur.
- Décris ce qui est réellement visible dans l'image. N'invente ni histoire ni détail absent.
- Ton calme et posé, phrases courtes et construites. Pas de superlatifs publicitaires, pas d'appel à cliquer.
- La version anglaise est une vraie rédaction en anglais naturel, pas une traduction mot à mot.

Champs attendus :
- description : description factuelle de l'image en français, 2 phrases, pour l'archive.
- alt : texte alternatif pour l'accessibilité, une phrase descriptive par langue.
- instagram : légende de 2 à 4 phrases courtes par langue.
- pinterest : titre orienté recherche (moins de 90 caractères) et description de 1 à 3 phrases (moins de 220 caractères) par langue, avec les mots que les gens cherchent pour ce genre d'image.
- court : texte pour X et Bluesky, une ou deux phrases, moins de 150 caractères par langue.
- hashtags_fr, hashtags_en : 3 à 5 mots-clés chacun, sans #, pertinents pour l'image (art 3D, rendu, sujet, ambiance).
- mots_cles : 3 à 6 mots-clés de recherche Pinterest, en français.`;

function promptUtilisateur({ scene, assets, image }) {
  const lignes = [`Scène : ${scene.nom}`];
  if (assets && assets.length) lignes.push(`Assets Daz utilisés dans la scène : ${assets.map((a) => a.nom).filter(Boolean).join(', ')}`);
  if (image && image.asset_nom) lignes.push(`Asset principal visible sur cette image : ${image.asset_nom}`);
  if (scene.notes) lignes.push(`Notes de l'auteur : ${scene.notes}`);
  lignes.push('Rédige les textes de diffusion de cette image selon les règles.');
  return lignes.join('\n');
}

// Erreurs de règles, champ par champ (les listes ne sont tolérées nulle part).
function verifier(r) {
  const erreurs = [];
  const champs = {
    'instagram.fr': r.instagram && r.instagram.fr, 'instagram.en': r.instagram && r.instagram.en,
    'court.fr': r.court && r.court.fr, 'court.en': r.court && r.court.en,
    'pinterest.titre_fr': r.pinterest && r.pinterest.titre_fr, 'pinterest.titre_en': r.pinterest && r.pinterest.titre_en,
    'pinterest.description_fr': r.pinterest && r.pinterest.description_fr, 'pinterest.description_en': r.pinterest && r.pinterest.description_en,
    'alt.fr': r.alt && r.alt.fr, 'alt.en': r.alt && r.alt.en
  };
  for (const [k, v] of Object.entries(champs)) {
    if (!String(v || '').trim()) { erreurs.push(`${k} : vide`); continue; }
    // Le tiret cadratin est corrigé par nettoyer() ; les autres règles imposent une nouvelle rédaction.
    for (const e of controlerTexte(v).filter((x) => x !== 'tiret cadratin')) erreurs.push(`${k} : ${e}`);
    if (/https?:\/\/|www\./i.test(v)) erreurs.push(`${k} : lien dans le texte`);
  }
  return erreurs;
}

function nettoyerReponse(r) {
  const n = (s) => nettoyer(s);
  const tags = (a) => (Array.isArray(a) ? a : []).map((t) => String(t).replace(/^#+/, '').trim()).filter(Boolean).slice(0, 6);
  return {
    description: n(r.description),
    alt: { fr: n(r.alt.fr), en: n(r.alt.en) },
    instagram: { fr: n(r.instagram.fr), en: n(r.instagram.en) },
    pinterest: { titre_fr: n(r.pinterest.titre_fr), titre_en: n(r.pinterest.titre_en), description_fr: n(r.pinterest.description_fr), description_en: n(r.pinterest.description_en) },
    court: { fr: n(r.court.fr), en: n(r.court.en) },
    hashtags_fr: tags(r.hashtags_fr), hashtags_en: tags(r.hashtags_en), mots_cles: tags(r.mots_cles)
  };
}

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ maxRetries: 3, timeout: 120000 });
  return client;
}

// Appel réel : SDK officiel, image en base64, sortie JSON contrainte par le schéma.
// Repli serveur activé par défaut (« fallbacks: default ») : si le modèle décline une image pour
// une raison de sécurité, l'API rejoue la demande sur un autre modèle dans le même appel.
async function appelerClaude({ system, texte, imageBase64 }) {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('ANTHROPIC_API_KEY manquante dans le fichier .env du backend'), { status: 503 });
  let res;
  try {
    res = await getClient().beta.messages.create({
      model: MODELE,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: texte }
        ]
      }]
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('Clé API Anthropic refusée'), { status: 503 });
    if (e instanceof Anthropic.RateLimitError) throw Object.assign(new Error('Limite de l\'API Anthropic atteinte, réessayez dans une minute'), { status: 429 });
    if (e instanceof Anthropic.BadRequestError) throw Object.assign(new Error(`Requête refusée par l'API : ${e.message}`), { status: 502 });
    if (e instanceof Anthropic.APIError) throw Object.assign(new Error(`API Anthropic indisponible (${e.status || 'réseau'})`), { status: 502 });
    throw e;
  }
  if (res.stop_reason === 'refusal') {
    const cat = res.stop_details && res.stop_details.category ? ` (${res.stop_details.category})` : '';
    throw Object.assign(new Error(`Claude a décliné cette image${cat} : rédigez les textes à la main.`), { status: 422 });
  }
  if (res.stop_reason === 'max_tokens') throw Object.assign(new Error('Réponse coupée (longueur maximale atteinte)'), { status: 502 });
  const texteRep = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return JSON.parse(texteRep); } catch { throw Object.assign(new Error('Réponse illisible du modèle'), { status: 502 }); }
}

/**
 * Rédige les textes d'une image.
 * @param {{ scene: object, assets: object[], image: object, imageBase64: string }} input
 * @param {{ callModel?: Function }} options  callModel injectable (tests, sans réseau)
 */
async function rediger(input, { callModel } = {}) {
  const appel = callModel || appelerClaude;
  let texte = promptUtilisateur(input);
  for (let essai = 0; essai < 2; essai++) {
    const brut = await appel({ system: SYSTEM, texte, imageBase64: input.imageBase64 });
    const erreurs = verifier(brut || {});
    if (!erreurs.length) return { ...nettoyerReponse(brut), modele: MODELE, essais: essai + 1 };
    texte = `${promptUtilisateur(input)}\n\nTa réponse précédente enfreignait ces règles, corrige-les : ${erreurs.join(' ; ')}.`;
    if (essai === 1) throw Object.assign(new Error(`Textes refusés après deux essais : ${erreurs.slice(0, 4).join(' ; ')}`), { status: 422, erreurs });
  }
  return null;
}

module.exports = { rediger, verifier, SYSTEM, SCHEMA, MODELE };

// Relecture complète d'un article avant brouillon (appelée par prepare_draft) : un Claude INDÉPENDANT de celui qui
// a écrit vérifie les faits sur le web, la langue et la cohérence. Les corrections sûres sont appliquées au texte
// (faits contredits par une source, affirmations introuvables retirées, fautes de langue) ; le style, la structure et
// les choix éditoriaux sont seulement signalés. Rien n'est publié : le résultat va dans un brouillon que Marc relit.
// Clé : ANTHROPIC_API_KEY (backend/.env). Modèle : RELECTURE_MODELE. Recherches web : RELECTURE_RECHERCHES (50).
// Charte de rédaction : la relecture reçoit à chaque dépôt la charte et l'identité du site lues en base (version en
// cours), exemples compris, et rend deux sections de plus : « style » (tics cités mot pour mot, avec une proposition
// avant → après jamais appliquée) et « voix » (par partie : regard, vécu, exemple, indépendance, registre, sel ; la
// phrase en cause est citée, jamais réécrite). Ni l'une ni l'autre ne bloque : elles s'affichent en tête du rapport.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODELE = () => process.env.RELECTURE_MODELE || 'claude-opus-5-5';
const RECHERCHES = () => Number(process.env.RELECTURE_RECHERCHES) || 50;
const CHAMPS = ['contenu', 'titre', 'titre_seo', 'meta'];
const TYPES_CORRECTION = ['fait', 'retrait', 'langue', 'coherence'];

let client = null;
function api() {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('ANTHROPIC_API_KEY absente de backend/.env'), { code: 'config' });
  if (!client) { const Anthropic = require('@anthropic-ai/sdk'); client = new (Anthropic.default || Anthropic)({ maxRetries: 2, timeout: 15 * 60 * 1000 }); }
  return client;
}

// Texte de la charte pour la consigne : identité, registre, règles par section, exemples (tels qu'en base).
function texteCharte(charte) {
  if (!charte) return '';
  const { commun: C, site: S } = charte.contenu;
  const l = [`\n\n=== CHARTE DE RÉDACTION ET IDENTITÉ DU SITE (version ${charte.version}, en base du CRM : elle seule fait foi) ===`,
    `Site : ${S.nom || charte.domain}. Registre : ${S.registre}.`, '', 'IDENTITÉ DU SITE :', S.identite, '', 'CHARTE COMMUNE AUX DEUX SITES :'];
  let section = null;
  for (const r of C.regles || []) {
    if (r.section !== section) { section = r.section; l.push('', `[${r.section}. ${r.section_titre}]`); }
    l.push(`(${r.cle}) ${r.texte}`);
  }
  if ((C.exemples || []).length) {
    l.push('', 'EXEMPLES (ce qu\'on vise ; jugés humains) :');
    for (const e of C.exemples) l.push(`--- exemple ${e.id}${e.site_id ? ` (site ${e.site_id})` : ''} ---`, e.texte);
  }
  return l.join('\n');
}

const SYSTEME = (domaine, charte = null) => `Tu es le relecteur et vérificateur indépendant d'un média français (${domaine}). Tu n'as pas écrit ce texte et tu ne lui fais pas confiance par défaut.
Tu reçois le titre, le titre SEO, la méta description et le contenu HTML (blocs Gutenberg) d'un article, avant sa mise en ligne.

1. FAITS. Relève chaque affirmation vérifiable : chiffre, caractéristique technique, compatibilité, version, prix, date, nom de produit, d'entreprise ou de personne, citation. Vérifie-la par la recherche web, sur des sources fiables (fabricant, documentation officielle, éditeur, presse spécialisée).
   - Confirmée : rien à faire.
   - Contredite par une source : correction de type "fait", avec l'URL de la source dans "source".
   - Introuvable ou douteuse : correction de type "retrait" : reformule le passage SANS le détail douteux, sans rien ajouter. Explique dans "raison" ce que tu n'as pas pu confirmer.
   N'introduis JAMAIS une information qui ne vient pas d'une source que tu cites.
   Procédures et réglages (noms exacts des menus et des options, étapes, autorisations demandées par une appli, comportement d'un mode) : vérifie-les dans l'aide officielle de l'éditeur (Apple, Google, Microsoft, éditeur de l'appli…), c'est là que se cachent les erreurs.
   Ordre : commence par les affirmations à risque (procédures, réglages, autorisations, chiffres, compatibilités, prix, dates), puis le reste.
   Si tes recherches ne suffisent pas pour tout vérifier, NE déclare PAS confirmé ce que tu n'as pas vérifié : liste-le dans "non_verifiees".
2. LANGUE. Fautes d'orthographe, de grammaire, d'accord, de conjugaison, de typographie française : correction de type "langue". Ne touche ni au style ni au ton.
3. COHÉRENCE. Le titre, le titre SEO, la méta et l'introduction annoncent ce que l'article contient ; pas de contradiction d'une section à l'autre ; pas d'expérience revendiquée (« nous avons testé ») que rien ne montre. Correction de type "coherence" seulement si elle est évidente et sûre ; sinon signalement.
4. STYLE, STRUCTURE, CHOIX ÉDITORIAUX : signalement seulement, jamais de correction.
${charte ? `5. STYLE SELON LA CHARTE (section « style », jamais de correction) : relève chaque tic que la charte proscrit, cité MOT POUR MOT tel qu'il figure dans le texte, avec le repère de la règle (ex. 5.1, 12.14) et une proposition « avant → après » que le rédacteur décidera d'appliquer ou non ; les intertitres imagés ou personnifiés, avec une version descriptive ; les chiffres posés sans interprétation (« Depuis… », « En cause… »), avec ce qui manque. Statut "STYLE À REVOIR" si l'article dépasse ${Number((((charte.contenu.commun.controles || {}).seuils) || {}).voix_tics_style_a_revoir) || 5} tics, sinon "OK".
6. VOIX (section « voix », jamais de correction ni de réécriture) : pour chaque partie (l'introduction, puis chaque intertitre), dis si on y trouve : un regard (une thèse, un avis tranché), une situation vécue, un exemple concret, l'indépendance (dire quand l'option chère ne sert à rien), le registre du site (${charte.contenu.site.registre}), et le sel quand le sujet s'y prête. Pour chaque critère absent ou raté, cite la phrase en cause MOT POUR MOT, sans la réécrire : une voix ne se répare pas par un modèle qui remet ses propres tics. Statut "OK" si la voix du site se reconnaît dans l'ensemble, sinon "À REPRENDRE", avec deux phrases au plus d'explication.
Juge d'après la charte et l'identité ci-dessous, et d'après les exemples ; ne propose jamais d'analogie, d'image ni de jeu de mots en remplacement.
` : ''}
Règles de chaque correction :
- "champ" : "contenu", "titre", "titre_seo" ou "meta".
- "avant" : extrait copié EXACTEMENT du champ fourni (caractères, entités HTML et espaces compris), aussi court que possible mais présent UNE SEULE FOIS dans ce champ, SANS aucune balise HTML ni commentaire de bloc.
- "apres" : le texte de remplacement, sans balise HTML.
- Ne modifie jamais une adresse, un shortcode [..], un marqueur {{media:…}} ni un commentaire <!-- wp:… -->.
- Une correction par erreur.

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour :
{${charte ? `"style":{"tics":[{"extrait":"…","regle":"5.1","proposition":"avant → après"}],"intertitres":[{"intertitre":"…","proposition":"…"}],"chiffres_sans_analyse":[{"extrait":"…","manque":"…"}],"statut":"OK|STYLE À REVOIR"},
 "voix":{"parties":[{"partie":"introduction|<intertitre>","regard":{"present":true,"citation":"…"},"vecu":{"present":false,"citation":"…"},"exemple":{"present":true},"independance":{"present":false,"sans_objet":true},"registre":{"present":true},"sel":{"present":false,"sans_objet":true}}],"statut":"OK|À REPRENDRE","explication":"…"},
 ` : ''}"corrections":[{"type":"fait|retrait|langue|coherence","champ":"contenu|titre|titre_seo|meta","avant":"…","apres":"…","raison":"…","source":"https://… ou vide"}],
 "signalements":[{"type":"style|structure|coherence|fait|autre","extrait":"…","remarque":"…"}],
 "non_verifiees":[{"extrait":"…","raison":"quota de recherches atteint, ou aucune source trouvée"}],
 "affirmations":{"relevees":0,"confirmees":0,"corrigees":0,"retirees":0,"non_verifiees":0},
 "resume":"deux phrases au plus"}${texteCharte(charte)}`;

/** Appel réel : recherche web, reprise des tours suspendus (pause_turn). Remplaçable dans les tests. */
async function appelReel({ domaine, champs, charte = null }) {
  const messages = [{ role: 'user', content:
    `TITRE :\n${champs.titre || ''}\n\nTITRE SEO :\n${champs.titre_seo || '(aucun)'}\n\nMÉTA DESCRIPTION :\n${champs.meta || '(aucune)'}\n\nCONTENU HTML :\n${champs.contenu || ''}` }];
  const diagnostic = { recherches: 0, sans_resultat: 0, erreurs_recherche: [], reprises: 0 };
  let r;
  for (let tour = 0; tour < 8; tour++) {
    r = await api().beta.messages.create({
      model: MODELE(), max_tokens: charte ? 24000 : 16000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      system: SYSTEME(domaine, charte),
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: RECHERCHES() }],
      messages,
    });
    for (const b of r.content || []) {
      if (b.type === 'server_tool_use' && b.name === 'web_search') diagnostic.recherches++;
      if (b.type === 'web_search_tool_result' && b.content && b.content.type === 'web_search_tool_result_error') diagnostic.erreurs_recherche.push(b.content.error_code);
      else if (b.type === 'web_search_tool_result' && Array.isArray(b.content) && !b.content.length) diagnostic.sans_resultat++;
    }
    if (r.stop_reason !== 'pause_turn') break;
    diagnostic.reprises++;
    messages.push({ role: 'assistant', content: r.content });
  }
  if (r.stop_reason === 'refusal') throw new Error('le relecteur a décliné la demande');
  if (r.stop_reason === 'max_tokens') throw new Error('réponse du relecteur coupée (longueur maximale)');
  if (r.stop_reason === 'pause_turn') throw new Error('recherche du relecteur toujours suspendue après 8 reprises');
  const brut = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const debut = brut.indexOf('{'), fin = brut.lastIndexOf('}');
  if (debut < 0 || fin < debut) throw new Error('réponse du relecteur sans JSON');
  const json = JSON.parse(brut.slice(debut, fin + 1));
  return { ...json, diagnostic: { ...diagnostic, erreurs_recherche: [...new Set(diagnostic.erreurs_recherche)] }, modele: r.model || MODELE() };
}

let appeler = appelReel;
/** Tests : remplace l'appel au modèle (fn reçoit { domaine, champs, charte } et renvoie le JSON de relecture). */
function definirAppel(fn) { appeler = fn || appelReel; }

/** Plages [début, fin[ des balises et commentaires HTML : une correction n'y touche jamais. */
function plagesBalises(html) {
  const out = [];
  for (const m of html.matchAll(/<!--[\s\S]*?-->|<[^>]*>/g)) out.push([m.index, m.index + m[0].length]);
  return out;
}
const occurrences = (s, sous) => { const pos = []; let i = s.indexOf(sous); while (i >= 0) { pos.push(i); i = s.indexOf(sous, i + 1); } return pos; };
const INTERDIT = /[<>]|\{\{|<!--|\[\/?[a-z_][\w-]*[\s\]]/i;

/** Applique les corrections sûres ; renvoie { champs corrigés, appliquees, non_appliquees }. */
function appliquer(champs, corrections) {
  const sortie = { ...champs };
  const appliquees = [], nonAppliquees = [];
  for (const c of Array.isArray(corrections) ? corrections : []) {
    const x = { type: c.type, champ: c.champ, avant: String(c.avant || ''), apres: String(c.apres ?? ''), raison: c.raison || undefined, source: /^https?:\/\//.test(c.source || '') ? c.source : undefined };
    const refus = (pourquoi) => nonAppliquees.push({ ...x, pourquoi });
    if (!TYPES_CORRECTION.includes(x.type)) { refus('type inconnu'); continue; }
    if (!CHAMPS.includes(x.champ)) { refus('champ inconnu'); continue; }
    if (typeof sortie[x.champ] !== 'string' || !sortie[x.champ]) { refus('champ absent de l\'article'); continue; }
    if (!x.avant.trim()) { refus('extrait vide'); continue; }
    if (x.avant === x.apres) { refus('aucun changement'); continue; }
    if (x.type === 'fait' && !x.source) { refus('fait corrigé sans source : non appliqué'); continue; }
    if (INTERDIT.test(x.avant) || INTERDIT.test(x.apres)) { refus('touche à une balise, un shortcode ou un marqueur'); continue; }
    const texte = sortie[x.champ];
    const pos = occurrences(texte, x.avant);
    if (pos.length !== 1) { refus(pos.length ? `extrait présent ${pos.length} fois` : 'extrait introuvable tel quel'); continue; }
    if (x.champ === 'contenu' && plagesBalises(texte).some(([a, b]) => pos[0] < b && pos[0] + x.avant.length > a)) { refus('extrait dans une balise ou un commentaire de bloc'); continue; }
    sortie[x.champ] = texte.slice(0, pos[0]) + x.apres + texte.slice(pos[0] + x.avant.length);
    appliquees.push(x);
  }
  return { champs: sortie, appliquees, non_appliquees: nonAppliquees };
}

/**
 * Relit l'article. dossier : dossier du dépôt (le résultat y est gardé : la simulation puis l'écriture du même
 * manifeste ne relisent qu'une fois, avec les mêmes corrections). Renvoie { champs, rapport } ou lève une erreur.
 */
// Une citation est-elle bien dans le texte (balises et entités retirées, blancs fusionnés, apostrophes unifiées) ?
const texteBrut = (s) => String(s || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&#0?39;|&rsquo;/g, '’').replace(/[\s\u00a0\u202f]+/g, ' ').replace(/'/g, '’').trim().toLowerCase();
const trouvee = (texte, citation) => texte.includes(texteBrut(citation).replace(/…$/, '').trim());
function verifierCitations(liste, cle, texte) {
  return (Array.isArray(liste) ? liste : []).map((x) => (x && typeof x === 'object' && x[cle] ? { ...x, citation_trouvee: trouvee(texte, x[cle]) } : x));
}
function lireStyle(brut, texte) {
  const s = brut && typeof brut === 'object' ? brut : null;
  if (!s) return undefined;
  return { statut: /revoir/i.test(String(s.statut || '')) ? 'STYLE À REVOIR' : 'OK', tics: verifierCitations(s.tics, 'extrait', texte), intertitres: Array.isArray(s.intertitres) ? s.intertitres : [], chiffres_sans_analyse: verifierCitations(s.chiffres_sans_analyse, 'extrait', texte) };
}
const CRITERES = ['regard', 'vecu', 'exemple', 'independance', 'registre', 'sel'];
function lireVoix(brut, texte) {
  const v = brut && typeof brut === 'object' ? brut : null;
  if (!v) return undefined;
  const parties = (Array.isArray(v.parties) ? v.parties : []).map((p) => {
    const out = { partie: String((p && p.partie) || '?') };
    for (const c of CRITERES) {
      const x = p && p[c];
      if (!x || typeof x !== 'object') continue;
      out[c] = { present: !!x.present, ...(x.sans_objet ? { sans_objet: true } : {}), ...(x.citation ? { citation: String(x.citation), citation_trouvee: trouvee(texte, x.citation) } : {}) };
    }
    return out;
  });
  return { statut: String(v.statut || '').trim().toUpperCase() === 'OK' ? 'OK' : 'À REPRENDRE', ...(v.explication ? { explication: String(v.explication) } : {}), parties };
}

async function relire({ domaine, champs, dossier, charte = null }) {
  // le résultat gardé ne vaut que pour la même charte : une nouvelle version relance la relecture
  const cle = crypto.createHash('sha256').update(JSON.stringify([MODELE(), champs.titre, champs.titre_seo, champs.meta, champs.contenu, charte ? [charte.site_id, charte.version] : null])).digest('hex').slice(0, 24);
  const fichier = dossier ? path.join(dossier, `.relecture-${cle}.json`) : null;
  let brut = null, reprise = false;
  if (fichier && fs.existsSync(fichier)) { try { brut = JSON.parse(fs.readFileSync(fichier, 'utf8')); reprise = true; } catch { brut = null; } }
  if (!brut) {
    brut = await appeler({ domaine, champs, charte });
    if (fichier) fs.writeFileSync(fichier, JSON.stringify(brut));
  }
  const { champs: corriges, appliquees, non_appliquees: nonAppliquees } = appliquer(champs, brut.corrections);
  const erreurs = (brut.diagnostic && brut.diagnostic.erreurs_recherche) || [];
  const nonVerifiees = Array.isArray(brut.non_verifiees) ? brut.non_verifiees : [];
  const quota = erreurs.includes('max_uses_exceeded');
  const texte = texteBrut(corriges.contenu);
  const rapport = {
    complete: !quota && !nonVerifiees.length,
    ...(charte ? { charte_version: charte.version, style: lireStyle(brut.style, texte) || { statut: 'NON RENDU', tics: [] }, voix: lireVoix(brut.voix, texte) || { statut: 'À REPRENDRE', explication: 'passe « voix » non rendue par le relecteur', parties: [] } } : {}),
    quota_atteint: quota ? `les ${RECHERCHES()} recherches web autorisées ont toutes servi (RELECTURE_RECHERCHES dans backend/.env)` : undefined,
    non_verifiees: nonVerifiees.length ? nonVerifiees : undefined,
    modele: brut.modele || MODELE(),
    reprise_du_resultat_precedent: reprise || undefined,
    resume: brut.resume,
    affirmations: brut.affirmations,
    recherches_web: brut.diagnostic ? brut.diagnostic.recherches : undefined,
    erreurs_recherche: brut.diagnostic && brut.diagnostic.erreurs_recherche && brut.diagnostic.erreurs_recherche.length ? brut.diagnostic.erreurs_recherche : undefined,
    corrections_appliquees: appliquees,
    corrections_non_appliquees: nonAppliquees.length ? nonAppliquees : undefined,
    signalements: Array.isArray(brut.signalements) && brut.signalements.length ? brut.signalements : undefined,
  };
  return { champs: corriges, rapport };
}

module.exports = { relire, appliquer, definirAppel, SYSTEME, texteCharte };

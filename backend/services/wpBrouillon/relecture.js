// Relecture complète d'un article avant brouillon (appelée par prepare_draft) : un Claude INDÉPENDANT de celui qui
// a écrit vérifie les faits sur le web, la langue et la cohérence. Les corrections sûres sont appliquées au texte
// (faits contredits par une source, affirmations introuvables retirées, fautes de langue) ; le style, la structure et
// les choix éditoriaux sont seulement signalés. Rien n'est publié : le résultat va dans un brouillon que Marc relit.
// Clé : ANTHROPIC_API_KEY (backend/.env). Modèle : RELECTURE_MODELE (claude-opus-5-5).
// Économie (relectures enregistrées en base, table seo_relectures) :
// - jamais deux fois la même relecture : empreinte du contenu déposé (manifeste + HTML, avec la version de la charte
//   et le modèle) ; déjà relu → rapport enregistré, sans appel ; deux appels simultanés n'en font qu'un ;
// - relecture incrémentale d'un article déjà relu (même url_origine, ou même slug / titre en mode nouveau) : seuls
//   les paragraphes modifiés sont relus, avec la liste des affirmations déjà vérifiées et leurs sources ; les
//   paragraphes inchangés gardent leur verdict ;
// - recherche web à filtrage dynamique (web_search_20260209), plafonnée : 10 par relecture complète, 5 en
//   incrémentale (RELECTURE_RECHERCHES_MAX, RELECTURE_RECHERCHES_PARTIELLE) ; plafond atteint → INCOMPLET ;
// - partie fixe (consignes, charte, identité) en premier, en cache une heure ; l'article ensuite ;
// - compteur : jetons d'entrée, de sortie, lus et écrits en cache, recherches, coût en tête du rapport ; mail
//   quand une journée dépasse le seuil (20 $ par défaut, réglable : node scripts/relectures.js --alerte 30).
// Charte de rédaction : la relecture reçoit à chaque dépôt la charte et l'identité du site lues en base (version en
// cours), exemples compris, et rend deux sections de plus : « style » (tics cités mot pour mot, avec une proposition
// avant → après jamais appliquée) et « voix » (par partie : regard, vécu, exemple, indépendance, registre, sel ; la
// phrase en cause est citée, jamais réécrite). Ni l'une ni l'autre ne bloque : elles s'affichent en tête du rapport.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODELE = () => process.env.RELECTURE_MODELE || 'claude-opus-5-5';
const RECHERCHES = { complete: () => Number(process.env.RELECTURE_RECHERCHES_MAX) || 10, incrementale: () => Number(process.env.RELECTURE_RECHERCHES_PARTIELLE) || 5 };
const PART_MAX_INCREMENTALE = 0.5;   // plus de la moitié des paragraphes modifiés : relecture complète
// Prix publics par million de jetons (entrée, sortie, lecture de cache, écriture de cache 5 min et 1 h) et par recherche.
const PRIX = {
  'claude-opus-5-5': { entree: 4, sortie: 20, cache_lu: 0.2, cache_5m: 5, cache_1h: 8 },
  'claude-sonnet-5-5': { entree: 2, sortie: 10, cache_lu: 0.2, cache_5m: 2.5, cache_1h: 4 },
};
const PRIX_RECHERCHE = 0.01;
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
   RECHERCHE WEB : elle sert UNIQUEMENT à ces faits (prix, dates, versions, chiffres, caractéristiques, compatibilités, citations, procédures). Jamais pour la langue, la cohérence, le style, la charte ou la voix : ces contrôles se font sur le texte seul. Ton budget de recherches est donné dans le message : une recherche peut vérifier plusieurs affirmations voisines. Une affirmation de la liste « DÉJÀ VÉRIFIÉES » ne se recherche pas de nouveau.
   Chaque affirmation confirmée par une source va dans "verifiees", avec l'URL de la source.
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
 "verifiees":[{"affirmation":"…","source":"https://…"}],
 "affirmations":{"relevees":0,"confirmees":0,"corrigees":0,"retirees":0,"non_verifiees":0},
 "resume":"deux phrases au plus"}${texteCharte(charte)}`;

// Consommation d'une réponse de l'API, additionnée sur les reprises (pause_turn).
function ajouterUsage(t, u = {}) {
  t.entree += u.input_tokens || 0;
  t.sortie += u.output_tokens || 0;
  t.cache_lu += u.cache_read_input_tokens || 0;
  const cc = u.cache_creation || null;
  if (cc && (cc.ephemeral_1h_input_tokens || cc.ephemeral_5m_input_tokens)) { t.cache_ecrit_1h += cc.ephemeral_1h_input_tokens || 0; t.cache_ecrit_5m += cc.ephemeral_5m_input_tokens || 0; }
  else t.cache_ecrit_5m += u.cache_creation_input_tokens || 0;
  t.recherches_api += (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  return t;
}
const consoVide = () => ({ entree: 0, sortie: 0, cache_lu: 0, cache_ecrit_5m: 0, cache_ecrit_1h: 0, recherches_api: 0 });
function cout(c, modele) {
  const p = PRIX[String(modele || '').replace(/-\d{8}$/, '')] || PRIX['claude-opus-5-5'];
  const usd = (c.entree * p.entree + c.sortie * p.sortie + c.cache_lu * p.cache_lu + c.cache_ecrit_5m * p.cache_5m + c.cache_ecrit_1h * p.cache_1h) / 1e6 + (c.recherches || 0) * PRIX_RECHERCHE;
  return Math.round(usd * 10000) / 10000;
}

/**
 * Appel réel. Partie fixe d'abord (consignes, charte, identité : bloc système en cache une heure), l'article
 * ensuite (message). Reprise des tours suspendus (pause_turn) : le début de la conversation est relu en cache.
 * Remplaçable dans les tests.
 */
async function appelReel({ domaine, charte = null, message, recherches_max: maxR }) {
  const messages = [{ role: 'user', content: message }];
  const conso = consoVide();
  const diagnostic = { recherches: 0, sans_resultat: 0, erreurs_recherche: [], reprises: 0 };
  let r;
  for (let tour = 0; tour < 6; tour++) {
    r = await api().beta.messages.create({
      model: MODELE(), max_tokens: charte ? 24000 : 16000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEME(domaine, charte), cache_control: { type: 'ephemeral', ttl: '1h' } }],
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxR }],
      cache_control: { type: 'ephemeral' },          // fin de conversation : relue en cache lors d'une reprise
      messages,
    });
    ajouterUsage(conso, r.usage);
    for (const b of r.content || []) {
      if (b.type === 'server_tool_use' && b.name === 'web_search') diagnostic.recherches++;
      if (b.type === 'web_search_tool_result' && b.content && b.content.type === 'web_search_tool_result_error') diagnostic.erreurs_recherche.push(b.content.error_code);
      else if (b.type === 'web_search_tool_result' && Array.isArray(b.content) && !b.content.length) diagnostic.sans_resultat++;
    }
    if (r.stop_reason !== 'pause_turn') break;
    diagnostic.reprises++;
    messages.push({ role: 'assistant', content: r.content });
  }
  const modele = r.model || MODELE();
  const sortie = { diagnostic: { ...diagnostic, erreurs_recherche: [...new Set(diagnostic.erreurs_recherche)] }, modele, conso: { ...conso, recherches: conso.recherches_api || diagnostic.recherches } };
  const echec = (m) => Object.assign(new Error(m), { conso: sortie.conso, modele });
  if (r.stop_reason === 'refusal') throw echec('le relecteur a décliné la demande');
  if (r.stop_reason === 'max_tokens') throw echec('réponse du relecteur coupée (longueur maximale)');
  if (r.stop_reason === 'pause_turn') throw echec('recherche du relecteur toujours suspendue après 6 reprises');
  const brut = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const debut = brut.indexOf('{'), fin = brut.lastIndexOf('}');
  if (debut < 0 || fin < debut) throw echec('réponse du relecteur sans JSON');
  return { ...JSON.parse(brut.slice(debut, fin + 1)), ...sortie };
}

let appeler = appelReel;
/** Tests : remplace le client de l'API (objet avec beta.messages.create), pour vérifier la requête envoyée. */
function definirClient(c) { client = c; }
/** Tests : remplace l'appel au modèle (fn reçoit { domaine, champs, charte, mode, message, a_relire, deja_verifiees,
 *  recherches_max } et renvoie le JSON de relecture, avec conso et modele s'il veut simuler une consommation). */
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

// ---------- mémoire des relectures (table seo_relectures) ----------
const prets = new WeakSet();
async function assurerTables(q) {
  if (prets.has(q)) return;
  await q.query(`
    CREATE TABLE IF NOT EXISTS seo_relectures (
      id             SERIAL PRIMARY KEY,
      empreinte      TEXT NOT NULL,
      site_id        INTEGER,
      depot_id       INTEGER,
      repere         TEXT,
      charte_version INTEGER,
      modele         TEXT,
      mode           TEXT,            -- complete | incrementale | sans_changement | reprise
      resultat       JSONB,
      segments       TEXT[],
      verifiees      JSONB,
      entree         INTEGER DEFAULT 0,
      sortie         INTEGER DEFAULT 0,
      cache_lu       INTEGER DEFAULT 0,
      cache_ecrit    INTEGER DEFAULT 0,
      recherches     INTEGER DEFAULT 0,
      cout           NUMERIC(10,4) DEFAULT 0,
      erreur         TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_relectures_empreinte ON seo_relectures (empreinte);
    CREATE INDEX IF NOT EXISTS idx_relectures_repere ON seo_relectures (site_id, repere, id DESC);
    CREATE TABLE IF NOT EXISTS seo_relectures_reglages (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), alerte_jour_usd NUMERIC(10,2) DEFAULT 20, alerte_envoyee_le DATE
    );
    INSERT INTO seo_relectures_reglages (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);
  prets.add(q);
}

// JSON aux clés triées : la même donnée donne toujours la même empreinte.
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v === undefined ? null : v));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Paragraphes de l'article (un bloc Gutenberg, ou un élément de bloc sans Gutenberg) ; titre, titre SEO et méta à part.
function segments(champs) {
  const out = [];
  for (const k of ['titre', 'titre_seo', 'meta']) if (champs[k]) out.push({ champ: k, html: String(champs[k]), texte: texteBrut(champs[k]) });
  const html = String(champs.contenu || '');
  const morceaux = /<!-- wp:/.test(html) ? html.split(/(?=<!-- wp:)/) : html.split(/(?=<(?:p|h[1-6]|li|blockquote|figcaption|td|th|pre)\b)/i);
  for (const m of morceaux) { const t = texteBrut(m); if (t.length >= 2) out.push({ champ: 'contenu', html: m.trim(), texte: t }); }
  return out.map((x) => ({ ...x, h: sha(`${x.champ}|${x.texte}`).slice(0, 20) }));
}
const intertitres = (contenu) => [...String(contenu || '').matchAll(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);

const libelle = { complete: 'Relecture complète', incrementale: 'Relecture incrémentale', sans_changement: 'Relecture reprise (aucun paragraphe modifié)', reprise: 'Relecture déjà faite' };
const nombre = (n) => Number(n || 0).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
const dollars = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} $`;
function ligneCout(mode, c, usd, extra = '') {
  if (mode === 'reprise' || mode === 'sans_changement') return `${libelle[mode]} : 0,00 $ (aucun appel à l'API${extra})`;
  return `${libelle[mode]} : ${dollars(usd)} (${nombre(c.entree)} jetons d'entrée, ${nombre(c.sortie)} en sortie, ${nombre(c.cache_lu)} lus en cache, ${nombre(c.cache_ecrit_5m + c.cache_ecrit_1h)} écrits en cache, ${c.recherches || 0} recherche(s) web${extra})`;
}

// Message de l'article : budget de recherches, affirmations déjà vérifiées, puis l'article ou les seuls passages modifiés.
function messageArticle({ champs, mode, aRelire, deja, maxR, precedente }) {
  const l = [`BUDGET : au plus ${maxR} recherche(s) web pour cette relecture.`];
  if (deja.length) {
    l.push('', 'DÉJÀ VÉRIFIÉES lors d\'une relecture précédente (ne pas les rechercher de nouveau ; les reprendre telles quelles dans "verifiees" si elles figurent encore dans le texte) :');
    for (const v of deja) l.push(`- ${v.affirmation}${v.source ? ` (source : ${v.source})` : ''}`);
  }
  if (mode === 'incrementale') {
    l.push('', `RELECTURE PARTIELLE : l'article a déjà été relu le ${new Date(precedente.created_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. Seuls les passages ci-dessous ont changé depuis. Relis UNIQUEMENT ces passages (faits, langue, cohérence avec le plan de l'article, style selon la charte) ; les autres paragraphes gardent leur verdict. Les extraits « avant » se copient dans ces passages. Ne rends pas la section « voix » ("voix": null).`,
      '', `PLAN DE L'ARTICLE : ${champs.titre || ''}${intertitres(champs.contenu).map((t) => `\n- ${t}`).join('')}`, '', 'PASSAGES MODIFIÉS :');
    for (const x of aRelire) l.push('', `[${x.champ === 'contenu' ? 'contenu' : x.champ.toUpperCase().replace('_', ' ')}]`, x.html);
    return l.join('\n');
  }
  l.push('', `TITRE :\n${champs.titre || ''}`, '', `TITRE SEO :\n${champs.titre_seo || '(aucun)'}`, '', `MÉTA DESCRIPTION :\n${champs.meta || '(aucune)'}`, '', `CONTENU HTML :\n${champs.contenu || ''}`);
  return l.join('\n');
}

// Incrémentale : verdicts de la relecture précédente gardés pour les paragraphes inchangés, nouveaux pour les autres.
function fusionner(prec, neuf, champs, inchange, charte) {
  const dans = (x, cle) => x && typeof x === 'object' && x[cle] && trouvee(inchange, x[cle]);
  const p = prec || {};
  const corrections = [...(p.corrections || []).filter((c) => c && c.avant && typeof champs[c.champ] === 'string' && champs[c.champ].includes(c.avant) && trouvee(inchange, c.avant)), ...(neuf.corrections || [])];
  const ps = p.style || {}, ns = neuf.style || {};
  const tics = [...(ps.tics || []).filter((x) => dans(x, 'extrait')), ...(ns.tics || [])];
  const seuil = charte ? Number((((charte.contenu.commun.controles || {}).seuils) || {}).voix_tics_style_a_revoir) || 5 : 5;
  const vues = new Set();
  const verifiees = [...(neuf.verifiees || []), ...(p.verifiees || [])].filter((v) => v && v.affirmation && !vues.has(v.affirmation) && vues.add(v.affirmation));
  return {
    corrections,
    signalements: [...(p.signalements || []).filter((x) => dans(x, 'extrait')), ...(neuf.signalements || [])],
    non_verifiees: [...(p.non_verifiees || []).filter((x) => dans(x, 'extrait')), ...(neuf.non_verifiees || [])],
    verifiees,
    style: charte ? { statut: tics.length > seuil ? 'STYLE À REVOIR' : 'OK', tics, intertitres: [...(ps.intertitres || []).filter((x) => dans(x, 'intertitre')), ...(ns.intertitres || [])], chiffres_sans_analyse: [...(ps.chiffres_sans_analyse || []).filter((x) => dans(x, 'extrait')), ...(ns.chiffres_sans_analyse || [])] } : undefined,
    voix: p.voix ? { ...p.voix, explication: [p.voix.explication, 'voix reprise de la relecture précédente (relecture incrémentale)'].filter(Boolean).join(' ; ') } : neuf.voix,
    affirmations: { ...(neuf.affirmations || {}), verdicts_repris: corrections.length - (neuf.corrections || []).length },
    resume: neuf.resume,
    diagnostic: neuf.diagnostic, modele: neuf.modele,
  };
}

let envoyerMail = async (sujet, texte) => {
  const mail = require('../emailService');
  const to = process.env.ALERT_EMAIL || process.env.REPORT_REPLY_TO || process.env.EMAIL_USER;
  if (!to) return;
  await mail.sendEmail({ to, subject: sujet, text: texte, html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;white-space:pre-line">${texte.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</div>` });
};
/** Tests : remplace l'envoi du mail d'alerte. */
function definirMail(fn) { envoyerMail = fn; }

// Mail une fois par jour quand le coût des relectures de la journée (heure de Paris) dépasse le seuil.
async function alerteJour(db) {
  const q = db.pool;
  const { rows: [r] } = await q.query(`SELECT g.alerte_jour_usd AS seuil, g.alerte_envoyee_le = (NOW() AT TIME ZONE 'Europe/Paris')::date AS deja,
      (SELECT COALESCE(SUM(cout), 0) FROM seo_relectures WHERE (created_at AT TIME ZONE 'Europe/Paris')::date = (NOW() AT TIME ZONE 'Europe/Paris')::date) AS total,
      (SELECT COUNT(*) FROM seo_relectures WHERE cout > 0 AND (created_at AT TIME ZONE 'Europe/Paris')::date = (NOW() AT TIME ZONE 'Europe/Paris')::date)::int AS n
    FROM seo_relectures_reglages g WHERE g.id = 1`);
  if (!r || r.deja || Number(r.total) <= Number(r.seuil)) return null;
  await q.query(`UPDATE seo_relectures_reglages SET alerte_envoyee_le = (NOW() AT TIME ZONE 'Europe/Paris')::date WHERE id = 1`);
  const texte = `Les relectures de prepare_draft ont coûté ${dollars(r.total)} aujourd'hui (${r.n} relecture(s) facturée(s)), au-delà du seuil de ${dollars(r.seuil)}.\n\nDétail : node scripts/relectures.js sur le serveur. Seuil réglable : node scripts/relectures.js --alerte 30`;
  await envoyerMail(`Relectures : ${dollars(r.total)} aujourd'hui, seuil de ${dollars(r.seuil)} dépassé`, texte).catch((e) => console.error('[Relecture] mail d\'alerte :', e.message));
  return { total: Number(r.total), seuil: Number(r.seuil) };
}

async function enregistrer(db, x) {
  const c = x.conso || consoVide();
  const { rows: [r] } = await db.pool.query(
    `INSERT INTO seo_relectures (empreinte, site_id, depot_id, repere, charte_version, modele, mode, resultat, segments, verifiees, entree, sortie, cache_lu, cache_ecrit, recherches, cout, erreur)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id, created_at`,
    [x.empreinte, x.site_id || null, x.depot_id || null, x.repere || null, x.charte_version || null, x.modele || null, x.mode, x.resultat ? JSON.stringify(x.resultat) : null, x.segments || null,
      x.verifiees ? JSON.stringify(x.verifiees) : null, c.entree, c.sortie, c.cache_lu, c.cache_ecrit_5m + c.cache_ecrit_1h, c.recherches || 0, x.cout || 0, x.erreur || null]);
  if (x.cout > 0) await alerteJour(db).catch((e) => console.error('[Relecture] alerte :', e.message));
  return r;
}

const enCours = new Map();   // empreinte → relecture en cours (un second appel attend la première, sans rappeler l'API)

/**
 * Relit l'article. Renvoie { champs corrigés, rapport }, ou lève une erreur.
 * db, site_id, depot_id : pour la mémoire des relectures. repere : l'article (url_origine, slug ou titre).
 * manifeste : le manifeste tel que déposé (dans l'empreinte, avec le HTML).
 */
async function relire({ db = null, domaine, champs, charte = null, site_id = null, depot_id = null, repere = null, manifeste = null }) {
  const empreinte = sha(stable([MODELE(), charte ? [charte.site_id, charte.version] : null, manifeste, champs.titre, champs.titre_seo, champs.meta, champs.contenu]));
  if (enCours.has(empreinte)) { await enCours.get(empreinte).catch(() => {}); }
  const tache = relireUneFois({ db, domaine, champs, charte, site_id, depot_id, repere, empreinte });
  enCours.set(empreinte, tache);
  try { return await tache; } finally { if (enCours.get(empreinte) === tache) enCours.delete(empreinte); }
}

async function relireUneFois({ db, domaine, champs, charte, site_id, depot_id, repere, empreinte }) {
  if (db) await assurerTables(db.pool);
  const segs = segments(champs);
  // 1. Même contenu déjà relu : rapport enregistré, aucun appel.
  const deja = db ? (await db.pool.query("SELECT * FROM seo_relectures WHERE empreinte = $1 AND resultat IS NOT NULL AND mode <> 'reprise' ORDER BY id DESC LIMIT 1", [empreinte])).rows[0] : null;
  let brut, mode, conso = consoVide(), usd = 0, precedente = null, aRelire = segs, extra = '';
  if (deja) {
    brut = deja.resultat; mode = 'reprise';
    extra = ` : même contenu relu le ${new Date(deja.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}${deja.depot_id ? ` (dépôt ${deja.depot_id})` : ''}, rapport enregistré renvoyé`;
  } else {
    // 2. Article déjà relu (même repère, même charte, même modèle) : seuls les paragraphes modifiés.
    precedente = db && repere ? (await db.pool.query("SELECT * FROM seo_relectures WHERE site_id IS NOT DISTINCT FROM $1 AND repere = $2 AND resultat IS NOT NULL AND mode <> 'reprise' ORDER BY id DESC LIMIT 1", [site_id, repere])).rows[0] : null;
    const memeCadre = precedente && precedente.modele === MODELE() && (precedente.charte_version || null) === (charte ? charte.version : null);
    const connus = new Set(precedente ? precedente.segments || [] : []);
    if (memeCadre) aRelire = segs.filter((x) => !connus.has(x.h));
    const depuisVerifiees = (precedente && Array.isArray(precedente.verifiees) ? precedente.verifiees : []).slice(0, 80);
    if (memeCadre && !aRelire.length) {
      brut = precedente.resultat; mode = 'sans_changement';
      extra = ` : aucun paragraphe modifié depuis la relecture du ${new Date(precedente.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}, verdicts repris`;
    } else {
      mode = memeCadre && aRelire.length <= segs.length * PART_MAX_INCREMENTALE ? 'incrementale' : 'complete';
      if (mode === 'complete') aRelire = segs;
      const maxR = RECHERCHES[mode]();
      const message = messageArticle({ champs, mode, aRelire, deja: depuisVerifiees, maxR, precedente });
      let neuf;
      try { neuf = await appeler({ domaine, champs, charte, mode, message, a_relire: aRelire.map((x) => x.html), deja_verifiees: depuisVerifiees, recherches_max: maxR }); }
      catch (e) {
        // Échec après consommation : la dépense est quand même comptée.
        if (db && e.conso) await enregistrer(db, { empreinte, site_id, depot_id, repere, charte_version: charte ? charte.version : null, modele: e.modele, mode, conso: e.conso, cout: cout(e.conso, e.modele), erreur: e.message });
        throw e;
      }
      conso = { ...consoVide(), recherches: 0, ...(neuf.conso || {}) };
      usd = cout(conso, neuf.modele || MODELE());
      brut = mode === 'incrementale' ? fusionner(precedente.resultat, neuf, champs, segs.filter((x) => connus.has(x.h)).map((x) => x.texte).join(' '), charte) : { ...neuf, conso: undefined };
      delete brut.conso;
      brut.recherches_max = maxR;
      if (mode === 'incrementale') extra = `, ${aRelire.length} paragraphe(s) sur ${segs.length} relu(s)`;
    }
  }
  const { champs: corriges, appliquees, non_appliquees: nonAppliquees } = appliquer(champs, brut.corrections);
  // Paragraphes connus pour la prochaine fois : tels que déposés et tels que corrigés.
  const connusApres = [...new Set([...segs.map((x) => x.h), ...segments(corriges).map((x) => x.h)])];
  const ligne = db ? await enregistrer(db, {
    empreinte, site_id, depot_id, repere, charte_version: charte ? charte.version : null, modele: brut.modele || MODELE(), mode,
    resultat: mode === 'reprise' ? null : brut, segments: mode === 'reprise' ? null : connusApres, verifiees: mode === 'reprise' ? null : brut.verifiees || [], conso, cout: usd,
  }) : null;
  const erreurs = (brut.diagnostic && brut.diagnostic.erreurs_recherche) || [];
  const nonVerifiees = Array.isArray(brut.non_verifiees) ? brut.non_verifiees : [];
  const maxR = brut.recherches_max || RECHERCHES.complete();
  const quota = erreurs.includes('max_uses_exceeded');
  const texte = texteBrut(corriges.contenu);
  const rapport = {
    cout: ligneCout(mode, conso, usd, extra),
    consommation: { mode, depot: depot_id || undefined, relecture_id: ligne ? ligne.id : undefined, jetons_entree: conso.entree, jetons_sortie: conso.sortie, jetons_lus_en_cache: conso.cache_lu, jetons_ecrits_en_cache: conso.cache_ecrit_5m + conso.cache_ecrit_1h, recherches: conso.recherches || 0, recherches_max: mode === 'complete' || mode === 'incrementale' ? maxR : undefined, cout_usd: usd },
    complete: !quota && !nonVerifiees.length,
    ...(charte ? { charte_version: charte.version, style: lireStyle(brut.style, texte) || { statut: 'NON RENDU', tics: [] }, voix: lireVoix(brut.voix, texte) || { statut: 'À REPRENDRE', explication: 'passe « voix » non rendue par le relecteur', parties: [] } } : {}),
    quota_atteint: quota ? `les ${maxR} recherches web prévues pour cette relecture ont toutes servi : les affirmations restantes sont listées dans non_verifiees` : undefined,
    non_verifiees: nonVerifiees.length ? nonVerifiees : undefined,
    modele: brut.modele || MODELE(),
    reprise_du_resultat_precedent: mode === 'reprise' || mode === 'sans_changement' || undefined,
    resume: brut.resume,
    affirmations: brut.affirmations,
    verifiees: Array.isArray(brut.verifiees) && brut.verifiees.length ? brut.verifiees.length : undefined,
    recherches_web: brut.diagnostic ? brut.diagnostic.recherches : undefined,
    erreurs_recherche: erreurs.length ? erreurs : undefined,
    corrections_appliquees: appliquees,
    corrections_non_appliquees: nonAppliquees.length ? nonAppliquees : undefined,
    signalements: Array.isArray(brut.signalements) && brut.signalements.length ? brut.signalements : undefined,
  };
  return { champs: corriges, rapport };
}

// Résumé pour le script de suivi : dernières relectures, total du jour, seuil d'alerte.
async function bilan(db, { limite = 30 } = {}) {
  await assurerTables(db.pool);
  const lignes = (await db.pool.query('SELECT id, created_at, depot_id, repere, mode, entree, sortie, cache_lu, cache_ecrit, recherches, cout, erreur FROM seo_relectures ORDER BY id DESC LIMIT $1', [limite])).rows;
  const jours = (await db.pool.query(`SELECT (created_at AT TIME ZONE 'Europe/Paris')::date AS jour, COUNT(*) FILTER (WHERE cout > 0)::int AS facturees, COUNT(*) FILTER (WHERE mode IN ('reprise', 'sans_changement'))::int AS sans_appel, SUM(cout) AS cout
    FROM seo_relectures GROUP BY 1 ORDER BY 1 DESC LIMIT 14`)).rows;
  const reglages = (await db.pool.query('SELECT alerte_jour_usd FROM seo_relectures_reglages WHERE id = 1')).rows[0];
  return { lignes, jours, alerte_jour_usd: Number(reglages.alerte_jour_usd) };
}
async function reglerAlerte(db, usd) {
  const n = Number(String(usd).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) throw new Error('seuil : un montant en dollars, par exemple 20');
  await assurerTables(db.pool);
  await db.pool.query('UPDATE seo_relectures_reglages SET alerte_jour_usd = $1, alerte_envoyee_le = NULL WHERE id = 1', [n]);
  return n;
}

module.exports = { relire, appliquer, definirAppel, definirClient, appelReel, definirMail, SYSTEME, texteCharte, segments, cout, bilan, reglerAlerte, assurerTables, PRIX };

// Contrôles de style sans IA de prepare_draft (charte de rédaction du 15/11/2026).
//
// analyserScript : portage fidèle de controle_style.py (mêmes calculs, mêmes messages, mêmes mesures), mais les
// listes (liste noire, intertitres imagés, connecteurs, ligne datée, mots vides) et les seuils viennent de la charte
// en base (commun.controles), jamais du code. Les motifs sont écrits en syntaxe Python (re) : convertir() les rend
// équivalents en JavaScript (\w, \b et \d au sens Unicode, comme en Python).
// analyserCharte : contrôles ajoutés par la charte hors du script : section 12 (comparaison en fin de paragraphe,
// constructions symétriques, première phrase courte) et interdits de la section 11.5 (tiret cadratin, demi-cadratin
// d'incise, Claude ou Anthropic, autre site, noms signalés, markdown brut), avec l'effet réglé pour chaque site.
// controler : les deux, avec les effets du site ; chaque point porte un code (pour le périmètre des mises à jour).

// ---------- outils Python ----------
const W = '\\p{L}\\p{N}_';
function convertir(p) {
  let out = '';
  let classe = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\' && i + 1 < p.length) {
      const n = p[i + 1];
      if (n === 'w') out += classe ? W : `[${W}]`;
      else if (n === 'W') out += classe ? '\\P{L}' : `[^${W}]`;
      else if (n === 'b') out += classe ? '\\x08' : `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))`;
      else if (n === 'd') out += '\\p{Nd}';
      else out += c + n;
      i++;
      continue;
    }
    if (c === '[' && !classe) classe = true;
    else if (c === ']' && classe) classe = false;
    out += c;
  }
  return out;
}
const cacheRx = new Map();
function rx(motif, drapeaux = '') {
  const k = `${drapeaux}\u0000${motif}`;
  if (!cacheRx.has(k)) cacheRx.set(k, new RegExp(convertir(motif), `u${drapeaux}`));
  return cacheRx.get(k);
}
const tous = (motif, texte, drapeaux = '') => [...texte.matchAll(rx(motif, `g${drapeaux}`))];
// round() de Python : arrondi au pair pour les cas exactement à mi-chemin.
function pyRound(x, n = 0) {
  const f = 10 ** n;
  const m = x * f;
  const bas = Math.floor(m);
  const reste = m - bas;
  const r = reste === 0.5 ? (bas % 2 === 0 ? bas : bas + 1) : Math.round(m);
  return n ? r / f : r;
}
const fmt1 = (x) => pyRound(x, 1).toFixed(1);
const virgule = (x) => String(x).replace('.', ',');
const NON_IMPRIMABLE = /[\x00-\x1f\x7f-\xa0\u00ad\u2000-\u200f\u2028-\u202f\u205f-\u206f\ufeff]/gu;
function pyStr(s) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let r = s.replace(/\\/g, '\\\\');
  if (q === "'") r = r.replace(/'/g, "\\'");
  r = r.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    .replace(NON_IMPRIMABLE, (c) => { const h = c.codePointAt(0); return h <= 0xff ? `\\x${h.toString(16).padStart(2, '0')}` : `\\u${h.toString(16).padStart(4, '0')}`; });
  return q + r + q;
}
const pyListe = (l) => `[${l.map(pyStr).join(', ')}]`;
const tranche = (s, n) => Array.from(s).slice(0, n).join('');
const moyenne = (l) => l.reduce((a, b) => a + b, 0) / l.length;
const ecartType = (l) => { const m = moyenne(l); return Math.sqrt(l.reduce((a, b) => a + (b - m) ** 2, 0) / l.length); };
const sansAccents = (s) => s.normalize('NFD').replace(/\p{Mn}/gu, '');
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', icirc: 'î', euro: '€', shy: '\u00ad' };
function deentiter(s) {
  return s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => (ENTITES[e] !== undefined ? ENTITES[e] : m));
}

// ---------- portage de controle_style.py ----------
function nettoyer(fragment) {
  let f = fragment.replace(/\[\/?(?:terme|spec|specs|jn_table|pick|tldr)[^\]]*\]/gu, '');
  f = f.replace(/<[^>]+>/g, '');
  f = deentiter(f).replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ');
  return f.replace(/\s+/gu, ' ').trim();
}
const RE_COUPE = /(?<=[.!?…])\s+(?=[«"A-ZÀ-ÖØ-Þ0-9])/u;
function phrases(texte) {
  return texte.split(RE_COUPE).map((m) => m.trim()).filter((m) => (m.match(rx('\\w+', 'g')) || []).length >= 2);
}
const mots = (s) => s.match(rx("[\\wÀ-ÿ'’%€$-]+", 'g')) || [];

// Paragraphes et intertitres du contenu (mêmes règles que le script : hors tableaux [jn_table] et figures).
function decouper(contenu) {
  let sansTables = contenu.replace(/\[jn_table[^\]]*\][\s\S]*?\[\/jn_table\]/gu, ' ');
  sansTables = sansTables.replace(/<figure[\s\S]*?<\/figure>/gu, ' ');
  const paras = [...sansTables.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gu)].map((m) => nettoyer(m[1])).filter(Boolean);
  const intertitres = [...contenu.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gu)].map((m) => nettoyer(m[1]));
  return { paras, intertitres };
}

// Rend { bloquant, avertissement, mesures } : chaque point { code, texte } (texte identique au script).
function analyserScript(contenu, { titre = '', cle = '', controles = {} } = {}) {
  const S = controles.seuils || {};
  const seuil = (k, d) => (S[k] === undefined || S[k] === null ? d : Number(S[k]));
  const rapport = { bloquant: [], avertissement: [], mesures: {} };
  const B = (code, texte) => rapport.bloquant.push({ code, texte });
  const A = (code, texte) => rapport.avertissement.push({ code, texte });
  const { paras, intertitres } = decouper(contenu);
  const corps = paras.join(' ');

  // 1. liste noire
  const trouves = [];
  const cible = `${corps} ${intertitres.join(' ')}`;
  for (const motif of controles.liste_noire || []) for (const m of tous(motif, cible, 'i')) trouves.push(m[0]);
  if (trouves.length >= seuil('liste_noire_bloquant', 2)) B('liste_noire', `expressions toutes faites : ${pyListe([...new Set(trouves)].sort())}`);
  else if (trouves.length) A('liste_noire', `expression toute faite : ${pyListe(trouves)}`);

  // 2. paragraphes
  const nPhr = paras.map((p) => phrases(p).length);
  const une = paras.filter((p, i) => nPhr[i] <= 1);
  const partUne = une.length / Math.max(1, paras.length);
  rapport.mesures.paragraphes = paras.length;
  rapport.mesures.part_paragraphes_1_phrase = pyRound(100 * partUne);
  rapport.mesures.phrases_par_paragraphe = nPhr.length ? pyRound(moyenne(nPhr), 2) : 0;
  const maxUne = seuil('part_paragraphes_1_phrase_max', 0.20);
  if (partUne > maxUne) B('paragraphes_1_phrase', `${pyRound(100 * partUne)} % de paragraphes d'une seule phrase (max ${pyRound(100 * maxUne)} %) : ${une.slice(0, 6).map((u) => tranche(u, 70)).join(' | ')}`);
  const minPhr = seuil('phrases_par_paragraphe_min', 3);
  if (nPhr.length && moyenne(nPhr) < minPhr) A('paragraphes_courts', `paragraphes trop courts en moyenne (moins de ${virgule(minPhr)} phrases)`);

  // 3. phrases
  const toutes = paras.flatMap((p) => phrases(p));
  const longueurs = toutes.map((s) => mots(s).length);
  if (longueurs.length) {
    const ecart = ecartType(longueurs);
    const limite = seuil('phrase_longue_mots', 20);
    const longues = longueurs.filter((n) => n > limite).length / longueurs.length;
    Object.assign(rapport.mesures, {
      phrases: longueurs.length, mots_par_phrase: pyRound(moyenne(longueurs), 1), ecart_type: pyRound(ecart, 1),
      part_phrases_plus_20_mots: pyRound(100 * longues), phrase_la_plus_longue: Math.max(...longueurs),
    });
    const eMin = seuil('ecart_type_min', 6);
    if (ecart < eMin) A('rythme', `rythme uniforme : écart type de ${fmt1(ecart)} mots (viser ${virgule(eMin)} ou plus)`);
    const pMax = seuil('part_phrases_longues_max', 0.25), pMin = seuil('part_phrases_longues_min', 0.10);
    if (longues > pMax) A('phrases_longues', `${pyRound(100 * longues)} % de phrases de plus de ${limite} mots (Yoast : ${pyRound(100 * pMax)} % max)`);
    if (longues < pMin) A('phrases_longues', `${pyRound(100 * longues)} % de phrases de plus de ${limite} mots : texte haché`);
    const tresLongue = seuil('phrase_tres_longue_mots', 40);
    toutes.forEach((s, i) => { if (longueurs[i] > tresLongue) A('phrase_tres_longue', `phrase de ${longueurs[i]} mots : ${tranche(s, 90)}…`); });
  }

  // 4. source citée en boucle
  const sources = new Map();
  for (const m of tous("\\b(?:selon|d'après) ([A-ZÀ-Ö][\\w-]+(?: [A-Z][\\w-]+)?)|\\ble (manuel|guide|site|documentation)\\b(?: de [A-Z][\\w-]+)?", corps)) {
    const k = (m[1] || m[2]).toLowerCase();
    sources.set(k, (sources.get(k) || 0) + 1);
  }
  for (const [src, n] of sources) if (n >= seuil('source_boucle_min', 3)) A('source_boucle', `source citée en boucle : « ${src} » ${n} fois`);

  // 5. écho du titre (hors phrase clé)
  if (titre) {
    const vides = new Set(controles.mots_vides || []);
    const t = (sansAccents(titre.toLowerCase()).match(rx('[\\wÀ-ÿ]+', 'g')) || []).filter((w) => !vides.has(w));
    const cleMots = new Set(sansAccents(cle.toLowerCase()).match(rx('[\\wÀ-ÿ]+', 'g')) || []);
    const bas = sansAccents(corps.toLowerCase());
    const chiffre = (w) => /^\p{Nd}+$/u.test(w);
    for (let i = 0; i + 1 < t.length; i++) {
      const [a, b] = [t[i], t[i + 1]];
      if (cleMots.has(a) && cleMots.has(b)) continue;
      const n = tous(`\\b${a}\\b\\W+\\b${b}\\b`, bas).length;
      if (n >= 1 && !(chiffre(a) || chiffre(b))) A('echo_titre', `écho du titre dans le corps : « ${a} ${b} » (${n} fois)`);
    }
  }

  // 6. ligne datée isolée
  if (controles.date_isolee) for (const p of paras) if (rx(controles.date_isolee, 'i').test(p)) B('ligne_datee', `ligne datée isolée en gabarit : « ${p} »`);

  // 7. intertitres imagés
  for (const h of intertitres) {
    for (const motif of controles.intertitres_images || []) {
      if (rx(motif, 'i').test(h)) { B('intertitre_image', `intertitre imagé : « ${h} »`); break; }
    }
  }
  rapport.mesures.intertitres = intertitres;

  // 8. appositions et connecteurs mécaniques
  const appos = tous('\\b\\w+, (?:lui|elle|eux|elles), \\w+', corps).map((m) => m[0]);
  if (appos.length) A('apposition', `apposition mécanique : ${pyListe(appos.slice(0, 4))}`);
  const debuts = paras.filter((p) => (controles.connecteurs || []).some((c) => rx(c, 'i').test(p)));
  if (debuts.length >= seuil('connecteurs_min', 3)) A('connecteurs', `${debuts.length} paragraphes ouverts par un connecteur mécanique`);

  // 8 bis. marqueur narratif répété en tête de phrase
  const nMots = seuil('marqueur_mots', 3);
  const tetes = new Map();
  for (const ph of longueurs.length ? toutes : []) {
    const tete = (ph.toLowerCase().match(rx("[\\wÀ-ÿ'’]+", 'g')) || []).slice(0, nMots).join(' ');
    if (tete.split(' ').length === nMots) tetes.set(tete, (tetes.get(tete) || 0) + 1);
  }
  for (const [tete, n] of tetes) {
    if (n >= seuil('marqueur_bloquant', 4)) B('marqueur', `marqueur répété en tête de phrase : « ${tete} » ${n} fois`);
    else if (n >= seuil('marqueur_avertissement', 3)) A('marqueur', `marqueur répété en tête de phrase : « ${tete} » ${n} fois`);
  }
  // 8 ter. organisme ou document récité
  const recits = new Map();
  for (const m of tous("\\b((?:le |la )?[A-ZÀ-Ö][\\w.-]+(?: [A-Z][\\w.-]+)?|le manuel|la documentation) (?:le |l'|lui-même )?(?:recommande|conseille|précise|explique|décrit|annonce|indique|rappelle|préconise|souligne|affirme|confirme)", corps)) {
    const org = m[1].toLowerCase();
    recits.set(org, (recits.get(org) || 0) + 1);
  }
  for (const [org, n] of recits) if (n >= seuil('recit_bloquant', 3)) B('recit', `source récitée : « ${org} recommande / conseille / précise… » ${n} fois`);
  const totalRecits = [...recits.values()].reduce((a, b) => a + b, 0);
  if (totalRecits >= seuil('recit_total_avertissement', 6)) A('recit', `${totalRecits} attributions du type « X recommande » au total`);
  // 8 quater. phrase-annonce courte et accroche en citation choc
  const annonces = (longueurs.length ? toutes : []).filter((ph) => rx("^(?:\\w+[ '’]){1,4}suit\\.?$").test(ph));
  if (annonces.length) B('annonce', `phrase-annonce : ${pyListe(annonces.slice(0, 3))}`);
  if (paras.length && /^\s*[«"]/u.test(paras[0])) A('citation_choc', "intro ouverte par une citation choc : gabarit d'accroche");

  // 9. blancs avant ponctuation dans la source (codes courts, liens)
  const blancs = [...contenu.matchAll(/(?:\[\/terme\]|<\/a>|<\/strong>|<\/em>)[ \t\n]+[.,)]/gu), ...contenu.matchAll(/['’][ \t\n]+(?:\[terme|<a )/gu)].map((m) => m[0]);
  if (blancs.length) B('blancs_source', `blanc avant la ponctuation ou après une apostrophe : ${pyListe(blancs.slice(0, 5))}`);

  rapport.statut = rapport.bloquant.length ? 'ÉCHEC' : 'OK';
  return rapport;
}

// ---------- contrôles ajoutés par la charte (sections 11.5 et 12) ----------
// Texte hors code : blocs de code, <pre>, <code> et codes courts de code retirés (un script Blender contient # et **).
const RE_CODE = [
  /<!-- wp:(?:code|preformatted|syntaxhighlighter\/code|kevinbatdorf\/code-block-pro)\b[\s\S]*?<!-- \/wp:(?:code|preformatted|syntaxhighlighter\/code|kevinbatdorf\/code-block-pro) -->/gu,
  /<pre[\s>][\s\S]*?<\/pre>/giu, /<code[\s>][\s\S]*?<\/code>/giu,
  /\[(pf_code|code|sourcecode|source|php|js|css|html|bash|python)\b[^\]]*\][\s\S]*?\[\/\1\]/giu,
];
const sansCode = (h) => RE_CODE.reduce((s, r) => s.replace(r, ' '), h);
const texteDe = (h) => deentiter(h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ');
const motEntier = (v) => new RegExp(`(?<![\\p{L}\\p{N}_])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'iu');
const extrait = (s, i, n = 60) => s.slice(Math.max(0, i - 30), i + n).replace(/\s+/g, ' ').trim();

function analyserCharte(contenu, { champs = {}, controles = {}, site = {} } = {}) {
  const S = controles.seuils || {};
  const items = [];
  const P = (code, texte) => items.push({ code, texte });
  const { paras } = decouper(contenu);

  // Section 12 : comparaison en dernière phrase de paragraphe ; constructions symétriques ; première phrase courte.
  for (const p of paras) {
    const ph = phrases(p);
    const derniere = ph.length ? ph[ph.length - 1] : p;
    for (const motif of controles.comparaisons_fin || []) {
      if (rx(motif, 'i').test(derniere)) { P('comparaison_fin', `comparaison en dernière phrase de paragraphe : « ${tranche(derniere, 120)} »`); break; }
    }
  }
  const corps = paras.join(' ');
  for (const motif of controles.symetries || []) for (const m of tous(motif, corps, 'i')) P('symetrie', `construction symétrique : « ${tranche(m[0], 120)} »`);
  const premiere = paras.length ? (phrases(paras[0])[0] || paras[0]) : null;
  const minPremiere = S.premiere_phrase_mots_min === undefined ? 8 : Number(S.premiere_phrase_mots_min);
  if (premiere && mots(premiere).length < minPremiere) P('premiere_phrase', `première phrase de ${mots(premiere).length} mots (moins de ${minPremiere}) : « ${premiere} » ; l'intro part d'un fait ou d'une situation précise`);

  // Section 11.5 : sur le contenu hors code, et sur le titre, le titre SEO et la méta.
  const html = sansCode(contenu);
  const texte = texteDe(html);
  const autres = Object.entries(champs).filter(([, v]) => v).map(([k, v]) => [k, String(v)]);
  const partout = [['contenu', texte], ...autres];
  for (const [ou, t] of partout) {
    const i = t.indexOf('—');
    if (i >= 0) P('cadratin', `tiret cadratin (${ou}) : « ${extrait(t, i)} » ; deux-points, virgules ou reformulation`);
    const m = /[ \u00a0\u202f]–[ \u00a0\u202f]/u.exec(t);
    if (m) P('demi_cadratin_incise', `demi-cadratin employé comme tiret d'incise (${ou}) : « ${extrait(t, m.index)} »`);
  }
  // Claude / Anthropic : crédit (légende de crédit, attribution d'une image) bloquant ; toute autre mention, dans le
  // texte comme dans une légende (article d'actualité sur Anthropic, Claude Chabrol…) : avertissement.
  const ia = (controles.ia_motifs || []).map((v) => [v, motEntier(v)]);
  const legendes = [...html.matchAll(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/giu)].map((x) => texteDe(x[1]));
  const RE_CREDIT = /(?:©|cr[ée]dits?|g[ée]n[ée]r[ée]e?s?|r[ée]alis[ée]e?s?|cr[ée][ée]e?s?|illustrations?|images?|graphiques?|visuels?|photos?|par|with|by|avec)\s*(?::|par\s)?\s*[^.;\n]{0,40}$/iu;
  for (const [v, r] of ia) {
    let credit = false;
    for (const l of legendes) {
      const m = r.exec(l);
      if (m && RE_CREDIT.test(l.slice(Math.max(0, m.index - 45), m.index))) { P('ia_credits', `« ${v} » crédité dans une légende : « ${tranche(l, 120)} » ; le crédit est le site`); credit = true; }
    }
    for (const [ou, t] of partout) {
      const m = r.exec(t);
      if (m && !credit) P('ia_texte', `« ${v} » mentionné (${ou}) : « ${extrait(t, m.index)} » ; aucun crédit à une IA, vérifier qu'il s'agit d'un sujet de l'article`);
    }
  }
  // L'autre site : nom ou domaine, dans le texte ou dans un lien.
  const liens = [...contenu.matchAll(/href=["']([^"']+)["']/giu)].map((x) => x[1]);
  for (const v of (site.autre_site || [])) {
    const r = motEntier(v);
    const dansTexte = partout.find(([, t]) => r.test(t));
    const dansLien = liens.find((u) => r.test(u) || (v.includes('.') && u.toLowerCase().includes(v.toLowerCase())));
    if (dansTexte || dansLien) P('autre_site', `« ${v} » ${dansLien ? `en lien (${dansLien})` : `dans ${dansTexte[0]}`} : aucun lien public entre Jurojin et PixFeed`);
  }
  for (const v of (site.mots_signales || [])) {
    const r = motEntier(v);
    const t = partout.find(([, x]) => r.test(x));
    if (t) P('mots_signales', `« ${v} » dans ${t[0]} : à vérifier`);
  }
  // Markdown brut (hors blocs de code).
  const blocs = [...html.matchAll(/<(p|li|h[1-6]|td|th|figcaption)[^>]*>([\s\S]*?)<\/\1>/giu)].map((x) => deentiter(x[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')));
  const MD = [
    [/(^|\n)[ \t]{0,3}#{1,6}[ \t]+\S/u, 'titre en #'], [/\*\*[^*\n]+\*\*/u, 'gras en **'], [/(^|[^\p{L}\p{N}_])__[^_\n]+__/u, 'gras en __'],
    [/`[^`\n]+`/u, 'code en `'], [/\[[^\]\n]+\]\((?:https?:|\/|#)[^)\s]*\)/u, 'lien [texte](adresse)'], [/```/u, 'bloc ```'], [/(^|\n)[ \t]*[-*+][ \t]+\S/u, 'liste en - ou *'],
  ];
  for (const [r, quoi] of MD) {
    const b = blocs.find((x) => r.test(x));
    if (b) P('markdown', `markdown brut (${quoi}) : « ${tranche(b.replace(/\s+/g, ' ').trim(), 90)} » ; codes courts du thème à la place`);
  }
  return items;
}

// Claude ou Anthropic dans les métadonnées d'un fichier (XMP, C2PA, EXIF) ou dans ses champs (alt, légende…).
function iaDansFichier(octets, motifs = []) {
  const brut = Buffer.isBuffer(octets) ? octets.toString('latin1') : String(octets || '');
  for (const v of motifs) if (motEntier(v).test(brut)) return v;
  return null;
}

// Blancs avant la ponctuation dans le rendu (test de la section 2 de la charte) : texte des <p> et <li> rendus,
// blancs fusionnés comme à l'affichage.
function blancsRendu(htmlRendu) {
  const out = [];
  for (const x of String(htmlRendu || '').matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/\1>/giu)) {
    const t = deentiter(x[2].replace(/<[^>]+>/g, '')).replace(/[ \t\n\r]+/g, ' ').trim();
    const m = /[ \t\n]+[.,)]|['’][ \t\n]+\S/u.exec(t);
    if (m) out.push(`${m.index > 50 ? '…' : ''}${t.slice(Math.max(0, m.index - 50), m.index + 30)}${m.index + 30 < t.length ? '…' : ''}`);
  }
  return out;
}

// Contrôle complet avec les effets du site : chaque point du script garde son niveau, sauf les codes réglés par
// le site (blancs_source et contrôles de la charte), qui prennent l'effet choisi (bloquant / avertissement / inactif).
function controler(contenu, { titre = '', cle = '', champs = {}, charte } = {}) {
  const controles = (charte && charte.commun && charte.commun.controles) || {};
  const site = (charte && charte.site && charte.site.controles) || {};
  const effets = site.effets || {};
  const s = analyserScript(contenu, { titre, cle, controles });
  const out = { bloquant: [], avertissement: [], mesures: s.mesures };
  const ranger = (p, niveau) => {
    const e = effets[p.code] || niveau;
    if (e === 'inactif') return;
    out[e === 'bloquant' ? 'bloquant' : 'avertissement'].push(p);
  };
  for (const p of s.bloquant) ranger(p, 'bloquant');
  for (const p of s.avertissement) ranger(p, 'avertissement');
  const CHARTE_PAR_DEFAUT = { comparaison_fin: 'avertissement', symetrie: 'avertissement', premiere_phrase: 'avertissement' };
  for (const p of analyserCharte(contenu, { champs: { titre, ...champs }, controles, site })) ranger(p, CHARTE_PAR_DEFAUT[p.code] || 'bloquant');
  out.statut = out.bloquant.length ? 'ÉCHEC' : 'OK';
  return out;
}

// Mise à jour par remplacements : les parties que le dépôt écrit (paragraphes, intertitres, éléments de liste,
// légendes, tableaux, codes courts) absentes de l'ancien texte.
const RE_UNITE = /<(p|h[1-6]|li|figcaption|blockquote)[^>]*>[\s\S]*?<\/\1>|\[(jn_table|specs)\b[\s\S]*?\[\/\2\]/giu;
function partiesEcrites(ancien, nouveau) {
  const reste = new Map();
  for (const m of String(ancien || '').matchAll(RE_UNITE)) reste.set(m[0], (reste.get(m[0]) || 0) + 1);
  const ecrites = [];
  for (const m of String(nouveau || '').matchAll(RE_UNITE)) {
    const n = reste.get(m[0]) || 0;
    if (n > 0) reste.set(m[0], n - 1);
    else ecrites.push(m[0]);
  }
  return ecrites;
}

module.exports = { analyserScript, analyserCharte, controler, partiesEcrites, blancsRendu, iaDansFichier, convertir, pyRound, pyStr, nettoyer, phrases, decouper };

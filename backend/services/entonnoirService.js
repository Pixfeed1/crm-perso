// backend/services/entonnoirService.js
//
// Entonnoir d'une campagne (lot 7), de l'envoi au revenu signé. Chaque étape a sa définition, affichée
// à côté du chiffre : un taux n'a de sens que si l'on sait ce qu'il compte. Les taux des étapes
// « prospects » sont rapportés aux emails délivrés ; ceux des affaires, au nombre d'affaires.
// Les campagnes en mode test ne comptent rien.

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

async function entonnoir(db, campagneId) {
  const q = (sql, p = [campagneId]) => db.pool.query(sql, p).then((r) => r.rows[0]).catch(() => ({}));
  const c = await q('SELECT id, test_mode FROM campaigns WHERE id = $1');
  if (!c || !c.id) return null;
  if (c.test_mode) return { test: true, etapes: [] };

  const env = await q(
    `SELECT COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::int AS envoyes,
            COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND statut = 'rebond')::int AS rebonds
       FROM campaign_items WHERE campaign_id = $1`);
  const envoyes = env.envoyes || 0;
  const delivres = envoyes - (env.rebonds || 0);

  // Emails suivis de la campagne : rattachés à l'envoi (campaign_id), ou retrouvés par adresse et objet.
  const cliq = await q(
    `SELECT COUNT(DISTINCT ci.lead_id)::int AS n FROM campaign_items ci
      WHERE ci.campaign_id = $1 AND ci.sent_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM email_tracking t
         WHERE COALESCE(t.click_count, 0) > 0
           AND (t.campaign_id = $1 OR (t.campaign_id IS NULL AND LOWER(t.to_email) = LOWER(ci.to_email) AND t.subject = ci.subject)))`);
  const rep = await q(
    `SELECT COUNT(DISTINCT ci.id)::int AS n FROM campaign_items ci
      WHERE ci.campaign_id = $1 AND ci.sent_at IS NOT NULL
        AND (ci.statut = 'repondu' OR EXISTS (SELECT 1 FROM boite_messages b WHERE b.campaign_item_id = ci.id AND b.type IN ('reponse', 'refus_probable')))`);
  const refus = await q(
    `SELECT COUNT(DISTINCT ci.id)::int AS n FROM campaign_items ci
      WHERE ci.campaign_id = $1 AND ci.sent_at IS NOT NULL
        AND (ci.statut = 'oppose' OR EXISTS (SELECT 1 FROM email_optout o WHERE o.email = LOWER(ci.to_email) AND o.source IN ('lien', 'opposition', 'refus') AND o.created_at >= ci.sent_at))`);
  const disc = await q(
    `SELECT COUNT(DISTINCT l.id)::int AS n FROM campaign_items ci JOIN leads l ON l.id = ci.lead_id
      WHERE ci.campaign_id = $1 AND ci.sent_at IS NOT NULL AND l.relation_status IN ('en_discussion', 'devis_envoye', 'gagne')`);
  const aff = await q(
    `SELECT COUNT(*)::int AS affaires,
            COUNT(*) FILTER (WHERE a.etape IN ('devis_envoye', 'negociation', 'gagnee') OR EXISTS (SELECT 1 FROM quotes qq WHERE qq.affaire_id = a.id))::int AS devis,
            COUNT(*) FILTER (WHERE a.etape = 'gagnee')::int AS gagnees,
            COALESCE(SUM(a.montant_ponctuel) FILTER (WHERE a.etape = 'gagnee'), 0)::float AS ponctuel_signe,
            COALESCE(SUM(a.montant_mensuel) FILTER (WHERE a.etape = 'gagnee'), 0)::float AS mensuel_signe,
            COALESCE(SUM(a.montant_ponctuel) FILTER (WHERE a.etape IN ('decouverte', 'devis_envoye', 'negociation')), 0)::float AS ponctuel_en_jeu,
            COALESCE(SUM(a.montant_mensuel) FILTER (WHERE a.etape IN ('decouverte', 'devis_envoye', 'negociation')), 0)::float AS mensuel_en_jeu
       FROM affaires a WHERE a.campagne_id = $1`);

  const n = (x) => (x && x.n) || 0;
  const etapes = [
    { cle: 'envoyes', libelle: 'Envoyés', valeur: envoyes, taux: null, definition: 'Emails réellement partis (hors mode test).' },
    { cle: 'delivres', libelle: 'Délivrés', valeur: delivres, taux: pct(delivres, envoyes), base: 'des envoyés', definition: "Envoyés moins les rebonds (adresse inexistante, signalée à l'envoi ou par un avis de non-remise lu dans la boîte)." },
    { cle: 'cliqueurs', libelle: 'Ont cliqué', valeur: n(cliq), taux: pct(n(cliq), delivres), base: 'des délivrés', definition: "Prospects qui ont cliqué au moins un lien de l'email. Les clics automatiques des messageries sont exclus depuis le lot 6 ; la désinscription ne compte pas." },
    { cle: 'reponses', libelle: 'Ont répondu', valeur: n(rep), taux: pct(n(rep), delivres), base: 'des délivrés', definition: "Prospects qui ont répondu par écrit (réponse lue dans la boîte d'envoi ou « A répondu » marqué à la main), refus compris. Les réponses automatiques (absence) ne comptent pas." },
    { cle: 'refus', libelle: 'Refus', valeur: n(refus), taux: pct(n(refus), delivres), base: 'des délivrés', definition: 'Oppositions marquées ou confirmées, et désinscriptions par le lien après cet envoi.' },
    { cle: 'discussions', libelle: 'En discussion ou plus', valeur: n(disc), taux: pct(n(disc), delivres), base: 'des délivrés', definition: 'Prospects de la campagne dont la fiche est aujourd\'hui « En discussion », « Devis envoyé » ou « Gagné ».' },
    { cle: 'affaires', libelle: 'Affaires', valeur: aff.affaires || 0, taux: pct(aff.affaires || 0, delivres), base: 'des délivrés', definition: "Affaires dont la campagne d'origine est celle-ci (plusieurs possibles par prospect)." },
    { cle: 'devis', libelle: 'Devis', valeur: aff.devis || 0, taux: pct(aff.devis || 0, aff.affaires || 0), base: 'des affaires', definition: 'Affaires arrivées au devis (Devis envoyé, Négociation, Gagnée, ou un devis rattaché).' },
    { cle: 'gagnees', libelle: 'Gagnées', valeur: aff.gagnees || 0, taux: pct(aff.gagnees || 0, aff.affaires || 0), base: 'des affaires', definition: 'Affaires gagnées (accord ferme).' }
  ];
  return {
    test: false,
    etapes,
    montants: {
      ponctuel_signe: aff.ponctuel_signe || 0, mensuel_signe: aff.mensuel_signe || 0,
      ponctuel_en_jeu: aff.ponctuel_en_jeu || 0, mensuel_en_jeu: aff.mensuel_en_jeu || 0,
      definition: 'Signé : somme des montants des affaires gagnées. En jeu : affaires en cours (Découverte, Devis envoyé, Négociation).'
    }
  };
}

// ─── Test A/B de la question finale ─────────────────────────────────────────
// Par version : délivrés, réponses (mesure qui tranche), clics humains sur vos prestations, refus.
// Verdict honnête : test exact de Fisher sur les réponses ; tant que l'écart peut venir du hasard
// (p ≥ 0,05) ou que les volumes sont trop faibles, « pas encore concluant ». Cumul possible sur toutes
// les campagnes qui testent exactement les mêmes formulations.
const lf = (() => { const t = [0]; return (n) => { for (let i = t.length; i <= n; i++) t[i] = t[i - 1] + Math.log(i); return t[n]; }; })();
function fisher(a, b, c, d) { // tableau [[a, b], [c, d]] -> p bilatéral
  const n = a + b + c + d, r1 = a + b, c1 = a + c;
  const lp = (x) => lf(r1) + lf(n - r1) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(n - r1 - c1 + x);
  const obs = lp(a);
  let p = 0;
  for (let x = Math.max(0, c1 + r1 - n); x <= Math.min(r1, c1); x++) { const v = lp(x); if (v <= obs + 1e-9) p += Math.exp(v); }
  return Math.min(1, p);
}
// Emails par version qu'il faudrait (risque 5 %, puissance 80 %) pour qu'un tel écart soit net.
function besoin(p1, p2) {
  if (p1 === p2) return null;
  const pm = (p1 + p2) / 2, za = 1.96, zb = 0.84;
  return Math.ceil(((za * Math.sqrt(2 * pm * (1 - pm)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2) / ((p1 - p2) ** 2));
}

async function parVersion(db, campagneIds) {
  const { rows } = await db.pool.query(
    `SELECT ci.variante,
            COUNT(*) FILTER (WHERE ci.sent_at IS NOT NULL)::int AS envoyes,
            COUNT(*) FILTER (WHERE ci.sent_at IS NOT NULL AND ci.statut <> 'rebond')::int AS delivres,
            COUNT(*) FILTER (WHERE ci.sent_at IS NOT NULL AND (ci.statut = 'repondu' OR EXISTS (SELECT 1 FROM boite_messages b WHERE b.campaign_item_id = ci.id AND b.type IN ('reponse', 'refus_probable'))))::int AS reponses,
            COUNT(*) FILTER (WHERE ci.sent_at IS NOT NULL AND (ci.statut = 'oppose' OR EXISTS (SELECT 1 FROM email_optout o WHERE o.email = LOWER(ci.to_email) AND o.source IN ('lien', 'opposition', 'refus') AND o.created_at >= ci.sent_at)))::int AS refus,
            COUNT(*) FILTER (WHERE ci.sent_at IS NOT NULL AND EXISTS (
              SELECT 1 FROM email_clics k JOIN email_tracking t ON t.id = k.tracking_id
               WHERE k.automatique = FALSE AND k.categorie = 'prestations'
                 AND (t.campaign_id = ci.campaign_id OR (t.campaign_id IS NULL AND LOWER(t.to_email) = LOWER(ci.to_email) AND t.subject = ci.subject))
                 AND LOWER(t.to_email) = LOWER(ci.to_email)))::int AS clics_prestations
       FROM campaign_items ci
      WHERE ci.campaign_id = ANY($1::int[]) AND ci.variante IN ('A', 'B')
      GROUP BY ci.variante`, [campagneIds]).catch(() => ({ rows: [] }));
  const vide = { envoyes: 0, delivres: 0, reponses: 0, refus: 0, clics_prestations: 0 };
  const v = { A: { ...vide }, B: { ...vide } };
  for (const r of rows) v[r.variante] = { envoyes: r.envoyes, delivres: r.delivres, reponses: r.reponses, refus: r.refus, clics_prestations: r.clics_prestations };
  for (const k of ['A', 'B']) {
    const x = v[k];
    x.taux_reponse = x.delivres ? Math.round((x.reponses / x.delivres) * 1000) / 10 : null;
    x.taux_refus = x.delivres ? Math.round((x.refus / x.delivres) * 1000) / 10 : null;
    x.taux_clics = x.delivres ? Math.round((x.clics_prestations / x.delivres) * 1000) / 10 : null;
  }
  return v;
}

function verdict(v) {
  const { A, B } = v;
  const MIN = 30;
  if (A.delivres < MIN || B.delivres < MIN) return { conclusion: 'trop_tot', texte: `Trop tôt : il faut au moins ${MIN} emails délivrés par version (A : ${A.delivres}, B : ${B.delivres}).` };
  const p = fisher(A.reponses, A.delivres - A.reponses, B.reponses, B.delivres - B.reponses);
  const pa = A.reponses / A.delivres, pb = B.reponses / B.delivres;
  const fr = (x) => `${String(Math.round(x * 1000) / 10).replace('.', ',')} %`;
  let out;
  if (p < 0.05 && pa !== pb) {
    const g = pb > pa ? 'B' : 'A';
    out = { conclusion: g, p, texte: `Écart net : la version ${g} obtient plus de réponses (${fr(g === 'B' ? pb : pa)} contre ${fr(g === 'B' ? pa : pb)}). Il y a moins de 5 % de chances que ce soit le hasard.` };
  } else {
    const n = besoin(pa, pb);
    out = { conclusion: 'non_concluant', p, texte: pa === pb
      ? `Pas d'écart : ${fr(pa)} de réponses dans les deux versions.`
      : `Pas encore concluant : ${fr(pa)} (A) contre ${fr(pb)} (B), un écart qui peut venir du hasard.${n && n < 100000 ? ` Pour qu'un écart de cette taille soit net, il faudrait environ ${n} emails délivrés par version.` : ''}` };
  }
  // Garde-fou : plus de réponses, mais aussi nettement plus de refus.
  const gagnant = out.conclusion === 'A' || out.conclusion === 'B' ? out.conclusion : (pb > pa ? 'B' : pa > pb ? 'A' : null);
  if (gagnant) {
    const autre = gagnant === 'A' ? 'B' : 'A';
    const rg = v[gagnant].refus / v[gagnant].delivres, ra = v[autre].refus / v[autre].delivres;
    if (v[gagnant].refus >= 2 && rg - ra >= 0.02) out.attention = `Attention : la version ${gagnant} provoque aussi plus de refus (${fr(rg)} contre ${fr(ra)}).`;
  }
  return out;
}

async function abResultats(db, campagneId) {
  const c = (await db.pool.query('SELECT id, nom, ab_question FROM campaigns WHERE id = $1', [campagneId]).catch(() => ({ rows: [] }))).rows[0];
  if (!c || !c.ab_question) return null;
  const { catalogue } = require('../utils/abQuestion');
  const cat = catalogue();
  const formulations = Object.fromEntries(Object.entries(c.ab_question).map(([f, k]) => [f, (cat[f].find((x) => x.cle === k) || {}).texte]));
  const campagne = await parVersion(db, [c.id]);
  // Cumul : toutes les campagnes qui testent exactement les mêmes formulations.
  const memes = (await db.pool.query('SELECT id, nom FROM campaigns WHERE ab_question = $1::jsonb AND test_mode IS NOT TRUE ORDER BY id', [JSON.stringify(c.ab_question)]).catch(() => ({ rows: [] }))).rows;
  const cumul = memes.length > 1 ? await parVersion(db, memes.map((x) => x.id)) : null;
  return {
    formulations,
    definition: "A = question d'origine, B = formulation testée ; tout le reste de l'email est identique. Réponses / délivrés, comme dans l'entonnoir ; « clics prestations » = prospects qui ont cliqué une page de vos prestations (clic humain).",
    campagne: { versions: campagne, verdict: verdict(campagne) },
    cumul: cumul ? { campagnes: memes.map((x) => x.nom), versions: cumul, verdict: verdict(cumul) } : null
  };
}

module.exports = { entonnoir, abResultats, fisher, besoin, verdict };

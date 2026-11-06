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

module.exports = { entonnoir };

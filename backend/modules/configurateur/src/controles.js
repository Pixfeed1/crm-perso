/* Contrôles avant publication. Une seule erreur bloque la publication : l'ancien fichier reste en ligne et Marc est prévenu. */
const config = require("./config");
const { verifier } = require("./moteur/compat");
const { P } = require("./moteur/profils");

function controler(data, C, precedent = null) {
  const erreurs = [], alertes = [];
  if (data.format !== "configurateur-pc/1") erreurs.push("format inconnu");

  // 1. compatibilité de chaque machine
  data.configs.forEach((cfg, i) => { const e = verifier(cfg, C); if (e.length) erreurs.push(`config ${i} incompatible : ${e.join(", ")}`); });

  // 2. chaque composant utilisé a un prix et une offre en stock (sauf éléments inclus)
  for (const [id, c] of Object.entries(data.composants)) {
    const inclus = C[id]?.inclus;
    if (inclus) continue;
    if (!(c.prix > 0)) erreurs.push(`${id} : prix manquant`);
    if (!c.offres.some(o => o.en_stock && o.lien && o.prix > 0)) erreurs.push(`${id} : aucune offre en stock avec lien et prix`);
  }

  // 3. cohérence des profils
  const cout = cfg => Object.values(cfg).reduce((t, id) => t + (data.composants[id]?.prix || 0), 0);
  for (const [k, p] of Object.entries(data.profils)) {
    if (!p.paliers.length) { erreurs.push(`profil ${k} : aucun palier`); continue; }
    p.paliers.forEach((x, i) => {
      if (i && x.budget <= p.paliers[i - 1].budget) erreurs.push(`profil ${k} : paliers non triés`);
      if (cout(data.configs[x.config]) > x.budget + 0.01) erreurs.push(`profil ${k} @${x.budget} : machine au-dessus du budget`);
      if (x.alternative) {
        const a = data.configs[x.alternative.config], m = data.configs[x.config], ca = cout(a), cm = cout(m);
        const A = config.alternative;
        if (ca > cm * (1 - A.economieMinPct / 100) + 0.01 || ca > cm - A.economieMinEuros + 0.01) erreurs.push(`profil ${k} @${x.budget} : alternative pas assez moins chère`);
        if (x.alternative.ecart_pct > A.perteMaxPct) erreurs.push(`profil ${k} @${x.budget} : alternative trop lente`);
        if (C[a.ram].caracteristiques.go < C[m.ram].caracteristiques.go) erreurs.push(`profil ${k} @${x.budget} : alternative avec moins de mémoire`);
      }
    });
    if (p.plafond !== null && p.plafond !== p.paliers[p.paliers.length - 1].budget) erreurs.push(`profil ${k} : plafond incohérent`);
  }

  // 3 bis. règles d'usage (garde-fou : le moteur les applique déjà, une seule entorse bloque la publication)
  for (const [k, p] of Object.entries(data.profils)) {
    const [logiciel, projet] = k.split("|"), pr = P[logiciel] || {};
    let go = 0, to = 0;
    for (const x of p.paliers) {
      const m = data.configs[x.config], g = C[m.gpu] || {}, ram = C[m.ram]?.caracteristiques?.go || 0, ssd = C[m.ssd]?.caracteristiques || {};
      const ici = `profil ${k} @${x.budget}`;
      if ((pr.dediee || (pr.dedieeLourd && projet === "lourd")) && g.integree) erreurs.push(`${ici} : graphique intégrée interdite pour cet usage`);
      if (pr.nvidia && !g.integree && g.marque_puce !== "nvidia") erreurs.push(`${ici} : carte non Nvidia pour un usage réservé à Nvidia`);
      if (projet === "lourd" && (ssd.to || 0) < 1) erreurs.push(`${ici} : moins d'1 To en projets lourds`);
      if (logiciel === "jeu" && ssd.gen === 5) erreurs.push(`${ici} : SSD Gen5 dans un profil jeu`);
      if (ram < go) erreurs.push(`${ici} : moins de mémoire qu'au palier précédent`);
      if ((ssd.to || 0) < to) erreurs.push(`${ici} : moins de stockage qu'au palier précédent`);
      go = ram; to = ssd.to || 0;
    }
  }

  // 4. variations de prix anormales depuis la publication précédente (souvent une erreur de flux)
  if (precedent) {
    for (const [id, c] of Object.entries(data.composants)) {
      const avant = precedent.composants?.[id]?.prix;
      if (avant > 0 && c.prix > 0) {
        const v = Math.abs(c.prix / avant - 1) * 100;
        if (v > config.controles.variationPrixMaxPct) erreurs.push(`${id} : prix passé de ${avant} € à ${c.prix} € (${Math.round(v)} %), à confirmer`);
      }
    }
  }

  // 5. taille
  const ko = Buffer.byteLength(JSON.stringify(data)) / 1024;
  if (ko > config.controles.tailleMaxKo) alertes.push(`fichier de ${Math.round(ko)} Ko, au-delà de ${config.controles.tailleMaxKo} Ko`);
  return { ok: erreurs.length === 0, erreurs, alertes, tailleKo: Math.round(ko) };
}

module.exports = { controler };

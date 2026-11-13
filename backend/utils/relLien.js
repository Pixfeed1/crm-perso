// dofollow d'après un rel TRANSMIS (ajout de cibles) : seules les valeurs concluantes comptent —
// dofollow, noopener (et noreferrer, qui l'accompagne) pour true ; nofollow, ugc, sponsored pour false.
// Toute autre chaîne (« a verifier », « ? », « follow », « aucun », texte libre) laisse dofollow à null.
// Seul record_link_rel (lecture dans la page, '' = aucun attribut) pose dofollow autrement.
//   videAbsent : '' veut dire « aucun attribut rel » (lecture dans la page), donc dofollow.
const BLOQUANTS = new Set(['nofollow', 'ugc', 'sponsored']);
const NEUTRES = new Set(['dofollow', 'noopener', 'noreferrer']);
const ABSENCE = /^$/;

function dofollowDuRel(rel, { videAbsent = false } = {}) {
  if (rel === undefined || rel === null) return null;
  const s = String(rel).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    .replace(/^rel\s*=\s*/, '').replace(/^["'«\s]+|["'»\s]+$/g, '').trim();
  if (!s) return videAbsent ? true : null;
  if (ABSENCE.test(s)) return true;
  const mots = s.split(/[\s,;]+/).filter(Boolean);
  if (!mots.every((m) => BLOQUANTS.has(m) || NEUTRES.has(m))) return null;
  return !mots.some((m) => BLOQUANTS.has(m));
}

module.exports = { dofollowDuRel };

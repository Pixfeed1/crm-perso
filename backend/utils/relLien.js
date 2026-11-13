// dofollow d'après un rel transmis (ajout de cibles, lecture manuelle) : true seulement si le rel PROUVE
// l'absence de nofollow, false s'il contient nofollow / ugc / sponsored, null sinon (non fourni, illisible,
// « à vérifier », « ? »…). Le rel doit être fait de valeurs de rel connues ; un seul mot inconnu donne null.
//   videAbsent : '' veut dire « aucun attribut rel » (lecture dans la page), donc dofollow.
const BLOQUANTS = new Set(['nofollow', 'ugc', 'sponsored']);
const NEUTRES = new Set(['dofollow', 'follow', 'noopener', 'noreferrer', 'noreferer', 'opener', 'external', 'me', 'author',
  'bookmark', 'tag', 'next', 'prev', 'alternate', 'help', 'license', 'friend', 'contact', 'acquaintance', 'colleague']);
const ABSENCE = /^(aucun|none|absent|vide|sans|aucun rel|pas de rel|sans rel|rel absent|aucun attribut|sans attribut|pas d'attribut|pas d attribut|aucun attribut rel|pas d'attribut rel)$/;

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

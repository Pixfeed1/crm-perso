// Tri d'un message reçu dans la boîte d'envoi (lot 7), à partir du message décodé (mailparser).
// Types :
//   - rebond            : avis de non-remise définitif (5.x.x, adresse inexistante…) ;
//   - rebond_temporaire : non-remise temporaire (4.x.x, boîte pleine…) : noté, rien de bloqué ;
//   - auto              : réponse automatique (absence, accusé de réception) : ce n'est pas une réponse ;
//   - refus_probable    : réponse qui ressemble à un refus (« ne plus me contacter », « pas intéressé »…) :
//                         soumise à Marc, jamais appliquée seule ;
//   - reponse           : toute autre réponse d'une personne.

const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const RE_REFUS = [
  /ne (plus|pas) (me|nous) (contacter|recontacter|solliciter|écrire|ecrire|relancer|appeler|envoyer)/i,
  /merci de ne (plus|pas)/i,
  /(retirez|supprimez|enlevez|effacez)[- ](moi|nous|mon adresse|notre adresse|mes coordonn|nos coordonn)/i,
  /(retirer|supprimer|enlever|effacer) (mon adresse|notre adresse|mes coordonn|nos coordonn|de (votre|vos) (liste|fichier|base))/i,
  /d[ée]sinscri|unsubscribe|opt[- ]?out|stop pub|\bstop\b/i,
  /pas int[ée]ress[ée]s?/i,
  /aucun besoin|pas besoin de vos services|pas de besoin/i,
  /non merci/i,
  /spam|harc[eè]lement|cnil|rgpd/i
];

const DSN_SUJET = /undeliver|non remis|non-remis|delivery status notification|delivery (has )?failed|failure notice|mail delivery (failed|subsystem)|returned mail|[ée]chec de (la )?(remise|distribution)|message (non distribu|not delivered)|impossible de remettre|rejected|address not found|adresse introuvable/i;
const AUTO_SUJET = /absen|out of (the )?office|automatic reply|auto[- ]?reply|r[ée]ponse automatique|autoreply|accus[ée] de r[ée]ception|vacances|cong[ée]s|en d[ée]placement|i am away|je suis absent/i;

const adresse = (v) => {
  if (!v) return null;
  const m = String(v).match(RE_EMAIL);
  return m ? m[0].toLowerCase() : null;
};

function texteDe(p) {
  return String(p.text || (p.html ? String(p.html).replace(/<[^>]+>/g, ' ') : '') || '').replace(/\s+/g, ' ').trim();
}

// Partie « nouvelle » d'une réponse : avant la citation du message d'origine.
function sansCitation(t) {
  const coupe = t.search(/(\bLe .{5,80} a [ée]crit ?:|\bOn .{5,80} wrote:|-----\s*(Original Message|Message d'origine)|De ?: .{3,80} Envoy[ée] ?:|From: .{3,80} Sent:|^>)/im);
  return (coupe > 0 ? t.slice(0, coupe) : t).trim();
}

function entete(p, nom) {
  const h = p.headers && (p.headers.get ? p.headers.get(nom) : p.headers[nom]);
  if (!h) return '';
  if (typeof h === 'string') return h;
  if (h.value) return String(h.value);
  if (h.text) return String(h.text);
  return String(h);
}

function classer(p) {
  const de = adresse(p.from && (p.from.text || (p.from.value && p.from.value[0] && p.from.value[0].address)));
  const sujet = String(p.subject || '');
  const texte = texteDe(p);
  const typeContenu = entete(p, 'content-type');
  const estDsn = /multipart\/report/i.test(typeContenu) && /delivery-status/i.test(typeContenu)
    || /^(mailer-daemon|postmaster|mail-daemon|bounce|bounces|mailerdaemon)@/i.test(de || '')
    || DSN_SUJET.test(sujet);
  if (estDsn) {
    // Destinataire en échec : champ Final-Recipient / Original-Recipient du rapport, sinon première adresse
    // du texte qui n'est pas celle du serveur d'envoi.
    const brut = `${texte}\n${(p.attachments || []).map((a) => (a.content ? a.content.toString('utf8') : '')).join('\n')}`;
    const fr = /(?:final|original)-recipient:\s*(?:rfc822;)?\s*<?([^\s>;]+@[^\s>;]+)>?/i.exec(brut);
    const code = /status:\s*([245])\.\d{1,3}\.\d{1,3}/i.exec(brut) || /\b([45])\.\d\.\d{1,3}\b/.exec(brut) || /\b([45])\d\d[ -]/.exec(brut);
    const echec = fr ? fr[1].toLowerCase() : (brut.match(RE_EMAIL) || []).map((x) => x.toLowerCase()).find((x) => !/mailer-daemon|postmaster|bounce/.test(x)) || null;
    const temporaire = code ? code[1] === '4' : /boîte (aux lettres )?pleine|mailbox (is )?full|over quota|temporar|réessa|retry/i.test(brut);
    return { type: temporaire ? 'rebond_temporaire' : 'rebond', de, adresse: echec, sujet, extrait: brut.slice(0, 400), raison: code ? `code ${code[0].trim()}` : 'avis de non-remise' };
  }
  const auto = /auto-(replied|generated|notified)/i.test(entete(p, 'auto-submitted')) || entete(p, 'x-autoreply') || entete(p, 'x-autorespond')
    || /auto_reply|bulk|junk/i.test(entete(p, 'precedence')) || AUTO_SUJET.test(sujet);
  const nouveau = sansCitation(texte);
  if (auto) return { type: 'auto', de, adresse: de, sujet, extrait: nouveau.slice(0, 400), raison: 'réponse automatique' };
  const motif = RE_REFUS.find((re) => re.test(nouveau) || re.test(sujet));
  if (motif) return { type: 'refus_probable', de, adresse: de, sujet, extrait: nouveau.slice(0, 400), raison: `formule « ${(nouveau.match(motif) || sujet.match(motif) || [''])[0]} »` };
  return { type: 'reponse', de, adresse: de, sujet, extrait: nouveau.slice(0, 400), raison: null };
}

module.exports = { classer, sansCitation, adresse };

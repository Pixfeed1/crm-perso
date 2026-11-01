// Mail de bienvenue (souscription confirmée) : aperçu du mail tel que le client le reçoit, pièce jointe comprise,
// puis envoi ou renvoi. Avant la souscription : aperçu seul (le mail partira tout seul à la souscription).
// api : { welcomePreview(id), welcomePdf(id), sendWelcome(id) } (abonnements ou contrats de maintenance).
import React, { useEffect, useState } from 'react';
import { FiSend, FiLoader, FiX, FiPaperclip, FiMail, FiExternalLink } from 'react-icons/fi';
import Modal from './Modal';
import { useToast } from '../../hooks/useToast';

export const formatEnvoi = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

const WelcomeEmailModal = ({ isOpen, onClose, api, id, onSent }) => {
  const { toast } = useToast();
  const [ap, setAp] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // la pièce jointe telle qu'elle partira, ouverte dans un nouvel onglet
  const ouvrirPdf = async () => {
    setPdfLoading(true);
    try {
      const url = URL.createObjectURL(await api.welcomePdf(id));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast.error(e.message || 'Pièce jointe impossible à ouvrir'); } finally { setPdfLoading(false); }
  };

  useEffect(() => {
    if (!isOpen || !id) return;
    setAp(null);
    api.welcomePreview(id).then(setAp).catch((e) => { toast.error(e.message || 'Aperçu impossible'); onClose(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, id]);   // api est un objet du module, onClose change à chaque rendu du parent : pas de rechargement en boucle

  const envoyer = async () => {
    setEnvoi(true);
    try {
      const r = await api.sendWelcome(id);
      toast.success(`Mail de bienvenue envoyé à ${r.sentTo || 'au client'}`);
      onSent && onSent(r);
      onClose();
    } catch (e) { toast.error(e.message || 'Envoi impossible'); } finally { setEnvoi(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[760px]">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2"><FiMail /> Mail de bienvenue</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong"><FiX size={18} /></button>
        </div>
        {!ap ? <div className="text-center py-10 text-text-muted"><FiLoader className="inline animate-spin" /> Chargement…</div> : (
          <div className="space-y-3">
            <div className="text-sm space-y-1">
              <div><span className="text-text-muted">À : </span><span className="text-text-primary">{ap.recipient || <span className="text-danger-text">aucune adresse sur la fiche client</span>}</span></div>
              <div><span className="text-text-muted">Objet : </span><span className="text-text-primary font-medium">{ap.subject}</span></div>
              {ap.fichier && (
                <div className="flex items-center gap-1.5 text-text-muted">
                  <FiPaperclip size={13} /> Pièce jointe :
                  <button type="button" onClick={ouvrirPdf} disabled={pdfLoading}
                    className="text-accent hover:underline disabled:opacity-50 inline-flex items-center gap-1">
                    {ap.fichier} {pdfLoading ? <FiLoader size={12} className="animate-spin" /> : <FiExternalLink size={12} />}
                  </button>
                </div>
              )}
              <div className={ap.souscrit ? 'text-text-muted' : 'text-amber-400'}>
                {ap.sentAt
                  ? `Déjà envoyé le ${formatEnvoi(ap.sentAt)}${ap.sentTo ? ` à ${ap.sentTo}` : ''}.`
                  : ap.souscrit ? "Pas encore envoyé." : ap.note}
              </div>
            </div>
            <iframe title="Aperçu du mail de bienvenue" srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:16px;background:#fff">${ap.html}</body>`}
              className="w-full h-[420px] rounded-lg border border-border bg-white" sandbox="" />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-3 py-2 rounded-lg bg-surface-strong text-text-primary text-sm hover:bg-border-strong">Fermer</button>
              {ap.souscrit && (
                <button onClick={envoyer} disabled={envoi || !ap.hasEmail}
                  className="px-3 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5">
                  {envoi ? <FiLoader size={14} className="animate-spin" /> : <FiSend size={14} />} {ap.sentAt ? 'Renvoyer' : 'Envoyer'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default WelcomeEmailModal;

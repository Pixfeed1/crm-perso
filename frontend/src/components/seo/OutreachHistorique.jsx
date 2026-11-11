// Fiche d'une cible (site à expéditeur réglé) : historique complet des échanges de netlinking, bouton de
// relance (pré-remplit le message et renseigne relance_de ; le serveur décide) et réponse reçue.
import React, { useCallback, useEffect, useState } from 'react';
import { FiMail, FiRotateCcw } from 'react-icons/fi';
import { outreachAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const STATUTS = { envoye: 'envoyé', relance: 'relancé', repondu: 'répondu', abandonne: 'abandonné' };
const NATURES = [['positif', 'Positive'], ['payant', 'Lien payant proposé'], ['negatif', 'Négative'], ['refus', 'Refus'], ['abandon', 'Abandon (pas de réponse)']];
const fmt = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export default function OutreachHistorique({ targetId, onRelancer, version }) {
  const { toast } = useToast();
  const [mails, setMails] = useState(null);
  const charger = useCallback(async () => {
    try { setMails((await outreachAPI.mails({ target_id: targetId })).mails || []); } catch { setMails([]); }
  }, [targetId]);
  useEffect(() => { charger(); }, [charger, version]);
  if (mails === null) return null;
  const dernier = mails[0];
  const termine = mails.some((m) => ['repondu', 'abandonne'].includes(m.statut));
  const marquer = async (nature) => {
    if (!nature) return;
    try { await outreachAPI.reponse({ target_id: targetId, nature }); toast.success('Réponse enregistrée : relances arrêtées'); charger(); }
    catch (e) { toast.error(e.message || 'Enregistrement impossible'); }
  };
  return (
    <div className="bg-surface-muted/40 rounded-xl border border-border p-4">
      <h3 className="font-semibold text-text-primary mb-2 flex items-center gap-2"><FiMail size={14} /> Échanges</h3>
      {!mails.length && <p className="text-sm text-text-muted">Aucun mail envoyé à cette cible.</p>}
      <ul className="space-y-2">
        {mails.map((m) => (
          <li key={m.id} className="text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-text-muted tabular-nums">{fmt(m.envoye_le)}</span>
              <span className="text-text-primary">« {m.objet} »</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-strong text-text-secondary">{STATUTS[m.statut] || m.statut}{m.reponse_nature ? ` (${m.reponse_nature})` : ''}</span>
              {m.relance_de && <span className="text-xs text-text-muted">relance de #{m.relance_de}</span>}
            </div>
            <div className="text-xs text-text-muted">à {m.destinataire}{m.relance_prevue_le ? ` · relance prévue le ${new Date(m.relance_prevue_le).toLocaleDateString('fr-FR')}` : ''}</div>
          </li>
        ))}
      </ul>
      {dernier && !termine && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button onClick={() => onRelancer(dernier)} className="px-3 py-1.5 text-xs rounded-lg bg-surface-strong text-text-primary hover:bg-border-strong flex items-center gap-1"><FiRotateCcw size={12} /> Relancer</button>
          <select defaultValue="" onChange={(e) => marquer(e.target.value)} className="px-2 py-1.5 text-xs bg-surface-muted border border-border rounded-lg text-text-primary">
            <option value="">Réponse reçue…</option>
            {NATURES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

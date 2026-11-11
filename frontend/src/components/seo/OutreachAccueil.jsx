// Accueil du module de netlinking d'un site à expéditeur réglé (jurojin.net) : relances dues et cibles
// sans réponse. Lecture seule : les envois et relances passent par l'endpoint unique (règles côté serveur).
import React, { useCallback, useEffect, useState } from 'react';
import { FiMail, FiClock, FiRotateCcw, FiExternalLink } from 'react-icons/fi';
import { outreachAPI } from '../../services/api';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

export default function OutreachAccueil({ siteId, expediteur, onOuvrir, onRelancer, version }) {
  const [dues, setDues] = useState(null);
  const [sans, setSans] = useState([]);
  const charger = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([outreachAPI.mails({ site: siteId, relances_dues: true }), outreachAPI.sansReponse(siteId)]);
      setDues(d.mails || []); setSans(s.cibles || []);
    } catch { setDues([]); setSans([]); }
  }, [siteId]);
  useEffect(() => { charger(); }, [charger, version]);
  if (dues === null) return null;
  const Ligne = ({ m, relance }) => (
    <li className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
      <div className="min-w-0 text-sm">
        <span className="text-text-primary font-medium">{m.domaine}</span>
        <span className="text-text-muted"> · « {m.objet} » · {fmt(m.envoye_le)}{m.statut === 'relance' ? ' (relancé)' : ''}{relance && m.relance_prevue_le ? ` · relance prévue le ${fmt(m.relance_prevue_le)}` : ''}</span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onOuvrir(m.target_id)} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Ouvrir la fiche"><FiExternalLink size={14} /></button>
        {relance && <button onClick={() => onRelancer(m)} className="px-2 py-1 text-xs rounded-lg bg-surface-strong text-text-primary hover:bg-border-strong flex items-center gap-1" title="Préparer la relance (même fil, contrôles côté serveur)"><FiRotateCcw size={12} /> Relancer</button>}
      </div>
    </li>
  );
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiMail size={14} /> Netlinking : envoi depuis {expediteur}</h3>
        <span className="text-xs text-text-muted">Un mail par cible, écrit pour elle ; doublons, relances et cadence contrôlés par le CRM.</span>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-text-muted mb-1 flex items-center gap-1"><FiClock size={12} /> Relances dues ({dues.length})</div>
          {dues.length ? <ul>{dues.map((m) => <Ligne key={m.id} m={m} relance />)}</ul> : <p className="text-sm text-text-muted">Aucune relance due.</p>}
        </div>
        <div>
          <div className="text-xs text-text-muted mb-1">Cibles sans réponse ({sans.length})</div>
          {sans.length ? <ul>{sans.map((m) => <Ligne key={m.target_id} m={m} />)}</ul> : <p className="text-sm text-text-muted">Aucune cible en attente de réponse.</p>}
        </div>
      </div>
    </div>
  );
}

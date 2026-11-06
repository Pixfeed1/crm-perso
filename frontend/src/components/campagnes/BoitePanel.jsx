// Boîte d'envoi (lot 7) : réponses et rebonds lus automatiquement (lecture seule), refus soumis à votre
// confirmation. Un refus probable a déjà fermé les relances ; c'est vous qui décidez du blocage.
import React, { useCallback, useEffect, useState } from 'react';
import { FiInbox, FiRefreshCw, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { campagnesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const TYPES = {
  reponse: { label: 'Réponse', cls: 'bg-success-bg text-success-text' },
  refus_probable: { label: 'Refus ?', cls: 'bg-danger-bg text-danger-text' },
  rebond: { label: 'Rebond', cls: 'bg-danger-bg text-danger-text' },
  rebond_temporaire: { label: 'Non-remise temporaire', cls: 'bg-warning-bg text-warning-text' },
  auto: { label: 'Réponse automatique', cls: 'bg-neutral-bg text-neutral-text' }
};
const fmt = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

export default function BoitePanel() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const charger = useCallback(async () => { try { const d = await campagnesAPI.boite(); setData(d); if (d.a_confirmer) setOuvert(true); } catch { setData(null); } }, []);
  useEffect(() => { charger(); }, [charger]);
  if (!data) return null;

  const relever = async () => {
    setBusy(true);
    try {
      const r = await campagnesAPI.releverBoite();
      if (r.configuree === false) toast.error(r.message);
      else toast.success(`${r.lus} message(s) lu(s), ${r.retenus} concernant des prospects${r.erreurs && r.erreurs.length ? `, ${r.erreurs.length} illisible(s)` : ''}`);
      charger();
    } catch (e) { toast.error(e.message || 'Relevé impossible'); } finally { setBusy(false); }
  };
  const decider = async (m, decision) => {
    try {
      await campagnesAPI.confirmerBoite(m.id, decision);
      toast.success(decision === 'pas_refus' ? 'Noté : simple réponse, aucun blocage' : decision === 'tout' ? 'Refus de toute sollicitation enregistré' : 'Ne plus écrire : enregistré');
      charger();
    } catch (e) { toast.error(e.message || 'Décision impossible'); }
  };

  if (!data.configuree) {
    return (
      <div className="mb-4 rounded-xl border border-border bg-surface-muted/50 p-3 text-xs text-text-muted flex items-center gap-2">
        <FiInbox size={14} /> Lecture de la boîte d'envoi non configurée : les réponses et les rebonds se marquent à la main sur la ligne. Pour l'activer : IMAP_HOST, IMAP_USER et IMAP_PASSWORD dans backend/.env.
      </div>
    );
  }
  return (
    <div className={`mb-4 rounded-xl border p-3 ${data.a_confirmer ? 'border-danger-text/30 bg-danger-bg/30' : 'border-border bg-surface'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={() => setOuvert((v) => !v)} className="flex items-center gap-2 text-sm text-text-primary">
          <FiInbox size={15} /> Boîte d'envoi
          {data.a_confirmer > 0 && <strong className="text-danger-text">{data.a_confirmer} refus à confirmer</strong>}
          <span className="text-xs text-text-muted">{data.dernier_releve ? `relevée le ${fmt(data.dernier_releve)}` : 'jamais relevée'} · {data.messages.length} message(s) de prospects</span>
          {ouvert ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
        </button>
        <button onClick={relever} disabled={busy} className="px-2.5 py-1 text-xs rounded-lg bg-surface-strong text-text-primary hover:bg-border-strong flex items-center gap-1 disabled:opacity-50">
          <FiRefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Relever maintenant
        </button>
      </div>
      {ouvert && (
        <ul className="mt-3 space-y-2">
          {data.messages.length === 0 && <li className="text-xs text-text-muted">Aucun message de prospect pour l'instant. Les autres messages de la boîte sont ignorés et ne sont pas conservés.</li>}
          {data.messages.map((m) => {
            const t = TYPES[m.type] || { label: m.type, cls: 'bg-neutral-bg text-neutral-text' };
            return (
              <li key={m.id} className="rounded-lg border border-border bg-surface p-2.5">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>
                  <span className="text-text-primary">{m.company || m.name || m.adresse}</span>
                  <span className="text-xs text-text-muted">{fmt(m.recu_le)} · {m.de}</span>
                  {m.statut === 'confirme' && <span className="text-xs text-danger-text">refus confirmé</span>}
                  {m.statut === 'rejete' && <span className="text-xs text-text-muted">pas un refus</span>}
                </div>
                {m.sujet && <div className="text-xs text-text-secondary mt-0.5">« {m.sujet} »</div>}
                {m.extrait && <p className="text-xs text-text-muted mt-1 line-clamp-3">{m.extrait}</p>}
                {m.raison && <p className="text-[11px] text-text-muted mt-0.5">Repéré : {m.raison}</p>}
                {m.statut === 'a_confirmer' && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button onClick={() => decider(m, 'tout')} className="px-2.5 py-1 text-xs rounded-lg bg-danger-bg text-danger-text hover:opacity-80">Refus de toute sollicitation</button>
                    <button onClick={() => decider(m, 'email')} className="px-2.5 py-1 text-xs rounded-lg bg-surface-strong text-text-primary hover:bg-border-strong">Ne plus écrire</button>
                    <button onClick={() => decider(m, 'pas_refus')} className="px-2.5 py-1 text-xs rounded-lg text-text-muted hover:text-text-primary">Ce n'est pas un refus</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

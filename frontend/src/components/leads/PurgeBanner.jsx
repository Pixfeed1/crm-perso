// Liste mensuelle « à supprimer » (lot 4) : prospects sans contact depuis 3 ans. Rien n'est supprimé
// sans votre validation : cochez ce qui part, le reste est gardé un an. Les listes d'opposition
// (désinscriptions, refus de prospection) sont toujours conservées.
import React, { useCallback, useEffect, useState } from 'react';
import { FiArchive, FiChevronDown, FiChevronUp, FiRefreshCw } from 'react-icons/fi';
import { leadsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '?');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const libelleMois = (m) => { const [a, n] = String(m || '').split('-'); return n ? `${MOIS[Number(n) - 1]} ${a}` : m; };

export default function PurgeBanner({ onDone }) {
  const { toast } = useToast();
  const [liste, setListe] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [coches, setCoches] = useState(new Set());
  const [confirme, setConfirme] = useState(false);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    try {
      const l = await leadsAPI.getPurge();
      setListe(l && l.lignes && l.lignes.some((x) => !x.decision) ? l : null);
      setCoches(new Set(((l && l.lignes) || []).filter((x) => !x.decision).map((x) => x.lead_id)));
    } catch { setListe(null); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  if (!liste) return null;
  const lignes = liste.lignes.filter((x) => !x.decision);
  const nbSuppr = lignes.filter((x) => coches.has(x.lead_id)).length;
  const basculer = (id) => { const s = new Set(coches); if (s.has(id)) s.delete(id); else s.add(id); setCoches(s); setConfirme(false); };

  const recalculer = async () => {
    setBusy(true);
    try { await leadsAPI.recalculerPurge(); await charger(); toast.success('Liste recalculée'); }
    catch (e) { toast.error(e.message || 'Calcul impossible'); } finally { setBusy(false); }
  };
  const valider = async () => {
    setBusy(true);
    try {
      const r = await leadsAPI.validerPurge(liste.id, [...coches]);
      toast.success(`${r.supprimes} prospect${r.supprimes > 1 ? 's' : ''} supprimé${r.supprimes > 1 ? 's' : ''}, ${r.gardes} gardé${r.gardes > 1 ? 's' : ''} un an${r.plus_concernes ? `, ${r.plus_concernes} recontacté${r.plus_concernes > 1 ? 's' : ''} entre-temps (gardé${r.plus_concernes > 1 ? 's' : ''})` : ''}`);
      setListe(null); setOuvert(false); setConfirme(false);
      if (onDone) onDone(r.supprimes);
    } catch (e) { toast.error(e.message || 'Validation impossible'); } finally { setBusy(false); }
  };

  return (
    <div className="mb-4 rounded-xl border border-warning-text/30 bg-warning-bg/40 p-3">
      <button onClick={() => setOuvert((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 text-sm text-text-primary">
          <FiArchive size={15} className="text-warning-text" />
          Liste à supprimer de {libelleMois(liste.mois)} : <strong>{lignes.length} prospect{lignes.length > 1 ? 's' : ''}</strong> sans contact depuis {liste.ans} ans. Rien ne part sans votre validation.
        </span>
        {ouvert ? <FiChevronUp className="text-text-muted" /> : <FiChevronDown className="text-text-muted" />}
      </button>
      {ouvert && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-text-muted">
            Cochés = supprimés définitivement (fiche, échanges, emails de prospection). Décochés = gardés un an, puis reproposés.
            Jamais concernés : clients, fiches gagnées ou liées à un projet, relances prévues. Les désinscriptions et refus de prospection sont conservés.
          </p>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-text-muted border-b border-border text-xs">
                <th className="px-3 py-2 w-8"><input type="checkbox" checked={nbSuppr === lignes.length} onChange={(e) => { setCoches(new Set(e.target.checked ? lignes.map((x) => x.lead_id) : [])); setConfirme(false); }} /></th>
                <th className="px-3 py-2">Prospect</th><th className="px-3 py-2">Domaine</th><th className="px-3 py-2">Dernier contact</th>
              </tr></thead>
              <tbody>
                {lignes.map((x) => (
                  <tr key={x.id} className="border-b border-border/50">
                    <td className="px-3 py-1.5"><input type="checkbox" checked={coches.has(x.lead_id)} onChange={() => basculer(x.lead_id)} /></td>
                    <td className="px-3 py-1.5 text-text-primary">{x.nom || `#${x.lead_id}`}<div className="text-xs text-text-muted">{x.email || ''}</div></td>
                    <td className="px-3 py-1.5 text-text-secondary">{x.domaine || '—'}</td>
                    <td className="px-3 py-1.5 text-text-secondary">{fmt(x.dernier_contact)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!confirme ? (
              <button onClick={() => setConfirme(true)} disabled={busy} className="px-3 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50">
                Valider : supprimer {nbSuppr}, garder {lignes.length - nbSuppr}
              </button>
            ) : (
              <>
                <span className="text-sm text-danger-text">Supprimer définitivement {nbSuppr} prospect{nbSuppr > 1 ? 's' : ''} ? C'est irréversible.</span>
                <button onClick={valider} disabled={busy} className="px-3 py-1.5 text-sm rounded-lg bg-danger-bg text-danger-text hover:opacity-80 disabled:opacity-50">{busy ? '…' : 'Oui, valider'}</button>
                <button onClick={() => setConfirme(false)} className="px-3 py-1.5 text-sm rounded-lg text-text-muted">Annuler</button>
              </>
            )}
            <button onClick={recalculer} disabled={busy} className="px-3 py-1.5 text-sm rounded-lg text-text-muted hover:text-text-primary flex items-center gap-1" title="Recalculer la liste avec les échanges du jour">
              <FiRefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Recalculer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

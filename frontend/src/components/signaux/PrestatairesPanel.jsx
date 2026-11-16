// Signaux > Prestataires : agences et freelances crédités en pied de page des sites crawlés, en procédure collective
// (BODACC), fermés (BODACC, SIRENE) ou au site à l'abandon (indice). Leurs sites clients deviennent des prospects ou
// entrent dans une campagne (préparée seulement : la validation et l'envoi restent dans l'onglet Campagnes).
import React, { useCallback, useEffect, useState } from 'react';
import { FiBriefcase, FiRefreshCw, FiUserPlus, FiSend, FiSlash, FiExternalLink, FiChevronDown, FiChevronUp, FiUser } from 'react-icons/fi';
import { prestatairesAPI, campagnesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const NIVEAUX = {
  procedure: { label: 'Procédure collective', cls: 'bg-danger-bg text-danger-text' },
  ferme: { label: 'Entreprise fermée', cls: 'bg-warning-bg text-warning-text' },
  abandon: { label: 'Site à l\'abandon (indice)', cls: 'bg-neutral-bg text-neutral-text' },
  actif: { label: 'Rien à signaler', cls: 'bg-success-bg text-success-text' },
  a_verifier: { label: 'Pas encore vérifié', cls: 'bg-neutral-bg text-neutral-text' },
};
const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
const bouton = 'px-2.5 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5 disabled:opacity-50';

function Ligne({ p, campagnes, onChange }) {
  const { toast } = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [detail, setDetail] = useState(null);
  const [campagne, setCampagne] = useState('');
  const [busy, setBusy] = useState('');
  const n = NIVEAUX[p.statut] || NIVEAUX.a_verifier;
  const preuve = (p.preuves || [])[0];
  const certain = p.siren_source === 'mentions légales du site';

  const ouvrir = async () => {
    setOuvert((v) => !v);
    if (!detail) { try { setDetail(await prestatairesAPI.detail(p.domaine)); } catch (e) { toast.error(e.message); } }
  };
  const action = async (quoi, fn, ok) => {
    setBusy(quoi);
    try { const r = await fn(); toast.success(ok(r)); setDetail(await prestatairesAPI.detail(p.domaine)); onChange(); }
    catch (e) { toast.error(e.message || 'Échec'); } finally { setBusy(''); }
  };

  return (
    <div className="bg-surface border border-border rounded-xl">
      <button onClick={ouvrir} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-text-primary">{p.nom || p.domaine}</span>
            <span className="text-xs text-text-muted">{p.domaine}{p.siren ? ` · SIREN ${p.siren}` : ''}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${n.cls}`}>{n.label}</span>
          </div>
          {preuve && <div className="text-xs text-text-secondary mt-1">{preuve.nature}{preuve.date ? ` · ${preuve.source || 'vérification du site'} du ${fmt(preuve.date)}` : ''}{preuve.tribunal ? ` · ${preuve.tribunal}` : ''}</div>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-text-primary">{p.nb_clients} site{p.nb_clients > 1 ? 's' : ''} client{p.nb_clients > 1 ? 's' : ''}</span>
          {ouvert ? <FiChevronUp className="text-text-muted" /> : <FiChevronDown className="text-text-muted" />}
        </div>
      </button>
      {ouvert && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div className="text-xs text-text-muted">
            {p.siren ? (certain ? 'Identité certaine : SIREN lu dans les mentions légales du site du prestataire. L\'email par la preuve peut citer le fait.' : `Identité ${p.siren_source || 'non sûre'} : le fait n'est pas cité dans les emails (risque d'homonyme).`) : 'SIREN introuvable : seul le site du prestataire est vérifié (indice).'}
            {p.verifie_le ? ` Vérifié le ${fmt(p.verifie_le)}.` : ''}{p.erreur ? ` Erreur : ${p.erreur}` : ''}
          </div>
          <ul className="space-y-1">
            {(p.preuves || []).map((x, i) => (
              <li key={i} className="text-sm text-text-primary">
                {x.niveau >= 2 ? '•' : '◦'} {x.nature}{x.date ? ` (${x.source || 'vérification du site'} du ${fmt(x.date)})` : ''}{x.tribunal ? `, ${x.tribunal}` : ''}{x.niveau === 1 ? ' : indice, jamais cité' : x.niveau === 0 ? ' : indice faible, affiché seulement avec un autre signal' : ''}
                {x.url && <a href={x.url} target="_blank" rel="noreferrer" className="ml-2 text-accent inline-flex items-center gap-1 text-xs">source <FiExternalLink size={11} /></a>}
              </li>
            ))}
          </ul>
          {detail && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-text-muted border-b border-border"><th className="px-2 py-1">Site client</th><th className="px-2 py-1">Plateforme</th><th className="px-2 py-1">Email</th><th className="px-2 py-1">Fiche</th></tr></thead>
                <tbody>
                  {detail.clients.map((c) => (
                    <tr key={`${c.result_id}-${c.domain}`} className="border-b border-border/50">
                      <td className="px-2 py-1 text-text-primary">{c.domain}</td>
                      <td className="px-2 py-1 text-text-secondary">{c.platform || '-'}</td>
                      <td className="px-2 py-1 text-text-secondary">{c.email || '-'}{c.desinscrit ? ' (désinscrit)' : ''}</td>
                      <td className="px-2 py-1 text-text-secondary">{c.lead_id ? `#${c.lead_id} ${c.relation_status || ''}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={!!busy} onClick={() => action('prospects', () => prestatairesAPI.prospects(p.domaine), (r) => `${r.creees} prospect(s) créé(s), ${r.deja} déjà en fiche`)} className={`${bouton} bg-accent text-white`}><FiUserPlus /> Sites clients en prospects</button>
            <select value={campagne} onChange={(e) => setCampagne(e.target.value)} className="px-2 py-1.5 rounded-lg bg-surface-muted border border-border text-xs text-text-primary">
              <option value="">Campagne…</option>
              {campagnes.filter((c) => ['brouillon', 'en_cours', 'pause'].includes(c.statut)).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <button disabled={!!busy || !campagne} onClick={() => action('campagne', () => prestatairesAPI.campagne(p.domaine, Number(campagne)), (r) => `${r.ajoutes} ligne(s) ajoutée(s) à la campagne, à relire et valider dans Campagnes`)} className={`${bouton} bg-surface-strong text-text-primary`}><FiSend /> Ajouter à la campagne</button>
            <button disabled={!!busy} onClick={() => action('fiche', () => prestatairesAPI.fiche(p.domaine), (r) => (r.deja ? `Fiche déjà créée (#${r.lead_id})` : `Fiche du prestataire créée (#${r.lead_id})`))} className={`${bouton} bg-surface-strong text-text-primary`} title="Piste : reprise de son portefeuille, en message privé"><FiUser /> Fiche du prestataire</button>
            <button disabled={!!busy} onClick={() => action('verifier', () => prestatairesAPI.verifier(p.domaine), () => 'Vérifié')} className={`${bouton} text-text-muted`}><FiRefreshCw /> Revérifier</button>
            <button disabled={!!busy} onClick={() => action('ignorer', () => prestatairesAPI.ignorer(p.domaine, {}), () => 'Prestataire ignoré')} className={`${bouton} text-text-muted`}><FiSlash /> Ignorer</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PrestatairesPanel() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [tous, setTous] = useState(false);
  const [campagnes, setCampagnes] = useState([]);
  const [enCours, setEnCours] = useState(null);

  const charger = useCallback(async () => {
    try {
      const [l, e] = await Promise.all([prestatairesAPI.lister({ gravite_min: tous ? 0 : 1 }), prestatairesAPI.etat()]);
      setData(l); setEnCours(e.en_cours);
    } catch (e) { toast.error(e.message || 'Liste indisponible'); }
  }, [tous, toast]);
  useEffect(() => { charger(); campagnesAPI.list().then((c) => setCampagnes(Array.isArray(c) ? c : c.campagnes || [])).catch(() => {}); }, [charger]);
  useEffect(() => { if (!enCours) return undefined; const t = setInterval(charger, 15000); return () => clearInterval(t); }, [enCours, charger]);

  const toutVerifier = async () => {
    try { await prestatairesAPI.verifier(); toast.success('Vérification lancée : BODACC, SIRENE et sites des prestataires'); charger(); }
    catch (e) { toast.error(e.message); }
  };
  if (!data) return null;
  const t = data.totaux || {};
  return (
    <div className="space-y-3">
      <div className="bg-surface border border-border rounded-xl p-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 font-semibold text-text-primary"><FiBriefcase /> Prestataires en difficulté ou disparus</div>
          <p className="text-xs text-text-muted mt-1 max-w-3xl">
            Agences et freelances crédités en pied de page de vos sites crawlés. Vérifiés chaque lundi : procédures collectives et radiations au BODACC,
            entreprises cessées dans SIRENE, et site du prestataire (simple indice). Leurs clients risquent de se retrouver sans suivi.
          </p>
          <div className="text-xs text-text-secondary mt-2">
            {t.procedure || 0} en procédure · {t.ferme || 0} fermés · {t.abandon || 0} indices · {t.actif || 0} sans problème · {t.a_verifier || 0} à vérifier
            {enCours ? ` · vérification en cours depuis ${new Date(enCours).toLocaleTimeString('fr-FR')}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-text-muted"><input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} /> tous les prestataires</label>
          <button onClick={toutVerifier} disabled={!!enCours} className={`${bouton} bg-surface-strong text-text-primary`}><FiRefreshCw className={enCours ? 'animate-spin' : ''} /> Vérifier maintenant</button>
        </div>
      </div>
      {data.prestataires.length === 0 && <div className="text-sm text-text-muted p-4">Aucun prestataire à signaler{tous ? '' : ' (cochez « tous les prestataires » pour voir la liste complète)'}.</div>}
      {data.prestataires.map((p) => <Ligne key={p.domaine} p={p} campagnes={campagnes} onChange={charger} />)}
    </div>
  );
}

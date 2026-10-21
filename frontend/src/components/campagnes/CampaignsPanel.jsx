// src/components/campagnes/CampaignsPanel.jsx
//
// Onglet « Campagnes » du Portefeuille : liste des campagnes, puis vue d'une campagne en trois
// étapes. PRÉPARER (lignes classées prêt / à vérifier / exclu), RELIRE (email dépliable et
// modifiable, preuve avec source et date, validation ligne par ligne ou en lot), PROGRAMMER
// (cadence, compte expéditeur, mode test, pause, arrêt immédiat). Aucun envoi sans validation.
// Charte : tokens de thème, react-icons, framer-motion. Aucune couleur en dur.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiPlus, FiTrash2, FiArrowLeft, FiCheck, FiCheckCircle, FiAlertTriangle, FiXCircle, FiPause, FiPlay, FiStopCircle, FiChevronDown, FiChevronUp, FiRefreshCw, FiShield, FiLoader, FiExternalLink, FiMessageCircle, FiSlash } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { campagnesAPI, emailTemplatesAPI, emailSignaturesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const STATUT_CAMPAGNE = {
  brouillon: { cls: 'bg-neutral-bg text-neutral-text', label: 'Brouillon' },
  en_cours: { cls: 'bg-success-bg text-success-text', label: 'En cours' },
  pause: { cls: 'bg-warning-bg text-warning-text', label: 'En pause' },
  arretee: { cls: 'bg-danger-bg text-danger-text', label: 'Arrêtée' },
  terminee: { cls: 'bg-info-bg text-info-text', label: 'Terminée' }
};
const STATUT_LIGNE = {
  pret: { cls: 'bg-info-bg text-info-text', label: 'Prêt à valider' },
  a_verifier: { cls: 'bg-warning-bg text-warning-text', label: 'À vérifier' },
  exclu: { cls: 'bg-neutral-bg text-neutral-text', label: 'Exclu' },
  valide: { cls: 'bg-success-bg text-success-text', label: 'Validé' },
  programme: { cls: 'bg-success-bg text-success-text', label: 'Programmé' },
  envoye: { cls: 'bg-success-bg text-success-text', label: 'Envoyé' },
  echec: { cls: 'bg-danger-bg text-danger-text', label: 'Échec' },
  arrete: { cls: 'bg-neutral-bg text-neutral-text', label: 'Arrêté' },
  repondu: { cls: 'bg-success-bg text-success-text', label: 'A répondu' },
  rebond: { cls: 'bg-danger-bg text-danger-text', label: 'Rebond' },
  oppose: { cls: 'bg-danger-bg text-danger-text', label: 'Opposition' }
};
const badge = (map, k) => map[k] || { cls: 'bg-neutral-bg text-neutral-text', label: k };
const fmt = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const fmtDate = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR'); };
const VUES = [
  { key: 'pret', label: 'Prêts à valider' }, { key: 'a_verifier', label: 'À vérifier' }, { key: 'valide', label: 'Validés' },
  { key: 'programme', label: 'Programmés' }, { key: 'envoye', label: 'Envoyés' }, { key: 'exclu', label: 'Exclus' }, { key: 'tous', label: 'Tous' }
];

// ─── Liste ───────────────────────────────────────────────────────────────────
const CampaignList = ({ onOpen }) => {
  const { toast } = useToast();
  const [list, setList] = useState([]);
  const [creating, setCreating] = useState(false);
  const [nom, setNom] = useState('');
  const load = useCallback(() => campagnesAPI.list().then((l) => setList(l || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    try { const c = await campagnesAPI.create({ nom: nom || undefined }); setNom(''); setCreating(false); onOpen(c.id); } catch (e) { toast.error(e.message || 'Erreur'); }
  };
  const remove = async (c, e) => {
    e.stopPropagation();
    try { await campagnesAPI.remove(c.id); toast.success('Brouillon supprimé'); load(); } catch (err) { toast.error(err.message || 'Suppression impossible'); }
  };
  return (
    <div>
      <div className="bg-surface border border-border rounded-2xl p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiSend size={15} /> Campagnes de prospection</h3>
            <p className="text-xs text-text-muted mt-1 max-w-2xl">
              Prépare depuis le Crawl ou la liste des Prospects, relis chaque email, valide, puis programme à cadence lente.
              Rien ne part sans ta validation. Les réponses, rebonds et oppositions différés ne sont pas détectés automatiquement : ils se marquent à la main sur la ligne.
            </p>
          </div>
          {creating ? (
            <div className="flex items-center gap-2">
              <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la campagne" className="px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
              <button onClick={create} className="px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm">Créer</button>
              <button onClick={() => setCreating(false)} className="px-3 py-2 bg-surface-strong text-text-primary rounded-lg text-sm">Annuler</button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm flex items-center gap-1.5"><FiPlus size={14} /> Nouvelle campagne</button>
          )}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="text-center py-12 bg-surface/30 rounded-lg border border-border">
          <FiSend className="w-12 h-12 mx-auto text-text-muted mb-3" />
          <p className="text-text-muted">Aucune campagne. Depuis le Crawl ou la liste des Prospects, sélectionne des fiches puis « Préparer une campagne ».</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((c) => {
            const b = badge(STATUT_CAMPAGNE, c.statut);
            return (
              <div key={c.id} onClick={() => onOpen(c.id)} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-muted/30 hover:bg-surface-muted/60 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">{c.nom}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span>
                    {c.test_mode && <span className="text-xs px-2 py-0.5 rounded-full bg-warning-bg text-warning-text">test</span>}
                    <span className="text-xs text-text-muted">· {c.mode}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {c.nb_items} ligne{c.nb_items > 1 ? 's' : ''} · {c.nb_pret} prêt{c.nb_pret > 1 ? 's' : ''} · {c.nb_a_verifier} à vérifier · {c.nb_valide} validé{c.nb_valide > 1 ? 's' : ''} · {c.nb_programme} programmé{c.nb_programme > 1 ? 's' : ''} · {c.nb_envoye} envoyé{c.nb_envoye > 1 ? 's' : ''} · <span className="text-success-text">{c.nb_repondu} réponse{c.nb_repondu > 1 ? 's' : ''}</span>{c.nb_echec ? <span className="text-danger-text"> · {c.nb_echec} échec{c.nb_echec > 1 ? 's' : ''}</span> : null}
                  </div>
                  {c.message && <div className="text-xs text-warning-text mt-0.5">{c.message}</div>}
                </div>
                {c.statut === 'brouillon' && (
                  <button onClick={(e) => remove(c, e)} className="p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong" title="Supprimer ce brouillon"><FiTrash2 size={15} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Ligne dépliable ────────────────────────────────────────────────────────
const ItemRow = ({ item, campaign, selected, onToggle, onChange, onReanalyze }) => {
  const [reanalyzing, setReanalyzing] = useState(false);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(item.subject || '');
  const [body, setBody] = useState(item.body || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setSubject(item.subject || ''); setBody(item.body || ''); }, [item.subject, item.body]);
  const b = badge(STATUT_LIGNE, item.statut);
  const editable = ['pret', 'a_verifier', 'valide'].includes(item.statut);
  const dirty = subject !== (item.subject || '') || body !== (item.body || '');
  const save = async () => { setSaving(true); try { await onChange(item.id, { subject, body }); } finally { setSaving(false); } };
  const act = (payload) => onChange(item.id, payload);
  return (
    <div className="border border-border rounded-xl bg-surface-muted/30">
      <div className="flex items-start gap-3 p-3">
        {['pret', 'a_verifier', 'valide'].includes(item.statut) && <input type="checkbox" className="mt-1" checked={selected} onChange={() => onToggle(item.id)} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-primary">{item.lead_name || item.domain}</span>
            <span className="text-xs text-text-muted">{item.domain}{item.to_email ? ` · ${item.to_email}` : ''}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span>
            {item.mode && <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{item.mode}</span>}
          </div>
          {item.raison && <div className={`text-xs mt-0.5 ${item.statut === 'a_verifier' ? 'text-warning-text' : 'text-text-muted'}`}>{item.raison}</div>}
          {item.preuve_signal && (
            <div className="text-xs text-text-muted mt-0.5">
              Preuve : <span className="text-text-secondary">{item.preuve_signal}</span> · {item.preuve_brut}
              {item.preuve_url && <> · <a href={item.preuve_url} target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">URL <FiExternalLink size={10} /></a></>}
              {item.preuve_date ? ` · mesuré le ${fmtDate(item.preuve_date)}` : ' · date de mesure inconnue (ancien crawl)'}
              {item.identite && <> · {item.identite}</>}
            </div>
          )}
          {item.scheduled_at && <div className="text-xs text-text-muted mt-0.5">Prévu le {fmt(item.scheduled_at)}{item.sent_at ? ` · envoyé le ${fmt(item.sent_at)}` : ''}</div>}
          {item.subject && <div className="text-xs text-text-secondary mt-1 truncate"><span className="text-text-muted">Objet :</span> {item.subject}</div>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {item.body && <button onClick={() => setOpen((v) => !v)} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Voir / modifier l'email">{open ? <FiChevronUp size={15} /> : <FiChevronDown size={15} />}</button>}
          {['pret', 'a_verifier'].includes(item.statut) && item.body && <button onClick={() => act({ statut: 'valide' })} className="px-2.5 py-1 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover">Valider</button>}
          {item.statut === 'valide' && <button onClick={() => act({ statut: 'pret' })} className="px-2.5 py-1 text-xs rounded-lg bg-surface-strong text-text-primary hover:bg-border-strong">Dévalider</button>}
          {['pret', 'a_verifier', 'valide', 'exclu'].includes(item.statut) && (
            <button onClick={async () => { setReanalyzing(true); try { await onReanalyze(item.id); } finally { setReanalyzing(false); } }} disabled={reanalyzing}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong disabled:opacity-50" title="Réanalyser le site (mesures du jour, SIRENE), régénérer l'email et reclasser la ligne">
              <FiRefreshCw size={14} className={reanalyzing ? 'animate-spin' : ''} />
            </button>
          )}
          {['pret', 'a_verifier', 'valide'].includes(item.statut) && <button onClick={() => act({ statut: 'exclu', raison: 'écarté à la relecture' })} className="p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong" title="Exclure"><FiSlash size={14} /></button>}
          {['envoye', 'programme'].includes(item.statut) && (
            <>
              <button onClick={() => act({ statut: 'repondu' })} className="px-2 py-1 text-xs rounded-lg bg-success-bg text-success-text hover:opacity-80 flex items-center gap-1" title="Le prospect a répondu : relances fermées, fiche en discussion"><FiMessageCircle size={12} /> A répondu</button>
              <button onClick={() => act({ statut: 'rebond' })} className="px-2 py-1 text-xs rounded-lg bg-danger-bg text-danger-text hover:opacity-80" title="Email revenu en erreur : adresse bloquée">Rebond</button>
            </>
          )}
          {['envoye', 'programme', 'repondu', 'valide', 'pret', 'a_verifier'].includes(item.statut) && <button onClick={() => act({ statut: 'oppose' })} className="px-2 py-1 text-xs rounded-lg bg-surface-strong text-danger-text hover:bg-border-strong" title="Opposition à la prospection : adresse bloquée définitivement, fiche fermée">Opposition</button>}
        </div>
      </div>
      <AnimatePresence>
        {open && item.body && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!editable}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent disabled:opacity-70" />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={11} disabled={!editable}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent resize-y disabled:opacity-70" />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-text-muted">{body.split(/\s+/).filter(Boolean).length} mots · la signature et le pied de désinscription sont ajoutés à l'envoi.</span>
                <div className="flex items-center gap-2">
                  {editable && (
                    <select value="" onChange={(e) => { if (e.target.value) act({ mode: e.target.value }); }}
                      className="px-2 py-1 text-xs bg-surface-strong border border-border rounded-lg text-text-primary" title="Régénérer l'email dans un autre mode (le texte repasse en « prêt à valider »)">
                      <option value="">Régénérer…</option>
                      <option value="preuve">par la preuve</option>
                      <option value="maintenance">maintenance, sans alerte</option>
                      {campaign.template_id && <option value="modele">avec le modèle de la campagne</option>}
                      <option value="claude">Claude libre (payant, encadré)</option>
                    </select>
                  )}
                  {editable && dirty && <button onClick={save} disabled={saving} className="px-2.5 py-1 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Vue d'une campagne ─────────────────────────────────────────────────────
const CampaignView = ({ id, onBack }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [vue, setVue] = useState('pret');
  const [selected, setSelected] = useState(new Set());
  const [sender, setSender] = useState(null);
  const [checking, setChecking] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testEmails, setTestEmails] = useState('');
  const [debut, setDebut] = useState(''); // « Commencer le » : vide = dès maintenant, à la cadence
  const [working, setWorking] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [signatures, setSignatures] = useState([]);
  const [templates, setTemplates] = useState([]);
  useEffect(() => {
    emailSignaturesAPI.list().then((l) => setSignatures(l || [])).catch(() => {});
    emailTemplatesAPI.list().then((l) => setTemplates(l || [])).catch(() => {});
  }, []);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try { const d = await campagnesAPI.get(id); setData(d); if (d.campaign.test_emails && !testEmails) setTestEmails(d.campaign.test_emails); } catch (e) { toast.error(e.message || 'Campagne introuvable'); onBack(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => { load(); }, [load]);
  // Suivi en direct tant que des envois sont programmés.
  useEffect(() => {
    const live = data && data.campaign && ['en_cours', 'pause'].includes(data.campaign.statut) && (data.stats.par_statut.programme || 0) > 0;
    if (!live) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return undefined; }
    pollRef.current = setInterval(load, 20000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [data, load]);

  if (!data) return <div className="text-center py-10 text-text-muted"><FiLoader className="inline animate-spin" /> Chargement…</div>;
  const { campaign, items, stats } = data;
  const b = badge(STATUT_CAMPAGNE, campaign.statut);
  const visibles = vue === 'tous' ? items : items.filter((i) => i.statut === vue);
  const counts = stats.par_statut || {};
  const selectables = visibles.filter((i) => ['pret', 'a_verifier', 'valide'].includes(i.statut));

  const reanalyzeItem = async (itemId) => {
    try {
      const r = await campagnesAPI.reanalyzeItem(id, itemId);
      toast.success(r.analyse && r.analyse.preuves && r.analyse.preuves.length ? `Réanalysé : ${r.analyse.preuves.join(', ')} · ligne ${badge(STATUT_LIGNE, r.item.statut).label.toLowerCase()}` : `Réanalysé : aucune preuve · ligne ${badge(STATUT_LIGNE, r.item.statut).label.toLowerCase()}`);
      load();
    } catch (e) { toast.error(e.message || 'Réanalyse impossible'); }
  };
  const changeItem = async (itemId, payload) => {
    try {
      const it = await campagnesAPI.updateItem(id, itemId, payload);
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, ...it } : x)) }));
      if (payload.statut) load();
    } catch (e) { toast.error(e.message || 'Modification refusée'); }
  };
  const validerSelection = async (statut = 'valide') => {
    if (!selected.size) return;
    try { const r = await campagnesAPI.validateMany(id, [...selected], statut); toast.success(`${r.modifies} ligne${r.modifies > 1 ? 's' : ''} ${statut === 'valide' ? 'validée' : 'dévalidée'}${r.modifies > 1 ? 's' : ''}`); setSelected(new Set()); load(); } catch (e) { toast.error(e.message || 'Erreur'); }
  };
  const checkSender = async () => { setChecking(true); try { setSender(await campagnesAPI.senderCheck()); } catch (e) { toast.error(e.message || 'Vérification impossible'); } finally { setChecking(false); } };
  const programmer = async () => {
    const n = counts.valide || 0;
    if (!n) { toast.error('Aucune ligne validée à programmer'); return; }
    if (testMode && !testEmails.trim()) { toast.error('Indique au moins une adresse de test'); return; }
    const quand = debut ? ` à partir du ${new Date(debut).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ' dès maintenant';
    const ok = window.confirm(testMode
      ? `Programmer ${n} email${n > 1 ? 's' : ''} de TEST vers ${testEmails}${quand} ?`
      : `Programmer ${n} email${n > 1 ? 's' : ''} RÉELS vers les prospects validés${quand}, ${campaign.par_jour} par jour entre ${campaign.heure_debut} h et ${campaign.heure_fin} h ?`);
    if (!ok) return;
    try {
      setWorking('schedule');
      const r = await campagnesAPI.schedule(id, { test: testMode, test_emails: testEmails, debut: debut ? new Date(debut).toISOString() : null });
      toast.success(`${r.programmes} envoi${r.programmes > 1 ? 's' : ''} programmé${r.programmes > 1 ? 's' : ''}${r.premier ? `, du ${fmt(r.premier)} au ${fmt(r.dernier)}` : ''}`);
      if (r.ignores && r.ignores.length) toast.info(`${r.ignores.length} ligne${r.ignores.length > 1 ? 's' : ''} exclue${r.ignores.length > 1 ? 's' : ''} au recontrôle`);
      setVue('programme'); load();
    } catch (e) { toast.error(e.message || 'Programmation impossible'); } finally { setWorking(null); }
  };
  const simple = async (fn, msg) => { try { setWorking(msg); await fn(); toast.success(msg); load(); } catch (e) { toast.error(e.message || 'Erreur'); } finally { setWorking(null); } };
  const saveSettings = async (payload) => { try { const c = await campagnesAPI.update(id, payload); setData((d) => ({ ...d, campaign: c })); } catch (e) { toast.error(e.message || 'Erreur'); } };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Retour"><FiArrowLeft /></button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-text-primary">{campaign.nom}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span>
              {campaign.test_mode && <span className="text-xs px-2 py-0.5 rounded-full bg-warning-bg text-warning-text">mode test</span>}
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              {stats.total} ligne{stats.total > 1 ? 's' : ''} · <span className="text-text-primary">{stats.envoyes} envoyé{stats.envoyes > 1 ? 's' : ''}</span> · <span className="text-success-text">{stats.reponses} réponse{stats.reponses > 1 ? 's' : ''}</span> · {stats.discussions} en discussion · {stats.rendez_vous} rendez-vous · <span className="text-success-text">{stats.contrats} contrat{stats.contrats > 1 ? 's' : ''}</span> · {stats.echecs} échec{stats.echecs > 1 ? 's' : ''}{stats.ouvertures != null ? ` · ${stats.ouvertures} ouvertures` : ''}
            </div>
            {campaign.message && <div className="text-xs text-warning-text mt-0.5 flex items-center gap-1"><FiAlertTriangle size={12} /> {campaign.message}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {campaign.statut === 'en_cours' && <button onClick={() => simple(() => campagnesAPI.pause(id), 'Campagne en pause')} className="px-3 py-2 rounded-lg bg-warning-bg text-warning-text text-sm flex items-center gap-1.5"><FiPause size={14} /> Pause</button>}
          {campaign.statut === 'pause' && <button onClick={() => simple(() => campagnesAPI.resume(id), 'Campagne reprise')} className="px-3 py-2 rounded-lg bg-success-bg text-success-text text-sm flex items-center gap-1.5"><FiPlay size={14} /> Reprendre</button>}
          {['en_cours', 'pause'].includes(campaign.statut) && (
            <button onClick={() => { if (window.confirm('Arrêter la campagne ? Tous les envois restants sont annulés définitivement.')) simple(() => campagnesAPI.stop(id), 'Campagne arrêtée'); }}
              className="px-3 py-2 rounded-lg bg-danger-bg text-danger-text text-sm font-medium flex items-center gap-1.5"><FiStopCircle size={15} /> Arrêter tout</button>
          )}
        </div>
      </div>

      {/* Avertissement permanent : ce que le CRM ne détecte pas */}
      <div className="text-xs rounded-lg border border-border bg-surface-muted/60 text-text-secondary px-3 py-2 mb-4 flex items-start gap-2">
        <FiAlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-warning-text" />
        <span>Les réponses, rebonds et oppositions reçus dans ta boîte mail ne sont pas détectés automatiquement. Marque-les sur la ligne (« A répondu », « Rebond », « Opposition ») : les envois restants vers ce contact s'annulent et l'adresse est bloquée quand il le faut.</span>
      </div>

      {/* Étape 3 : programmer */}
      {['brouillon', 'en_cours', 'pause'].includes(campaign.statut) && (
        <div className="bg-surface border border-border rounded-2xl p-5 mb-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiSend size={14} /> Programmer les envois validés ({counts.valide || 0})</h4>
            <button onClick={() => setShowSettings((v) => !v)} className="text-xs text-accent hover:underline">{showSettings ? 'Masquer les réglages' : 'Réglages de cadence'}</button>
          </div>
          <div className="text-xs text-text-muted mt-1">{campaign.par_jour} par jour, de {campaign.heure_debut} h à {campaign.heure_fin} h, espacés d'au moins {campaign.espacement_min} min{campaign.jours_ouvres ? ', jours ouvrés' : ''} · compte {campaign.from_account} · mode {campaign.mode} · signature {campaign.signature_id ? `#${campaign.signature_id}` : 'par défaut'}{campaign.bcc ? ` · Cci ${campaign.bcc}` : ''} · relance {campaign.relance_jours ? `J+${campaign.relance_jours} (${campaign.relance_canal})` : 'aucune'}</div>
          {showSettings && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              {[['par_jour', 'Par jour', 1, 100], ['heure_debut', 'Début (h)', 0, 23], ['heure_fin', 'Fin (h)', 1, 24], ['espacement_min', 'Espacement (min)', 1, 240]].map(([k, l, min, max]) => (
                <div key={k}>
                  <label className="block text-xs text-text-secondary mb-1">{l}</label>
                  <input type="number" min={min} max={max} defaultValue={campaign[k]} onBlur={(e) => saveSettings({ [k]: parseInt(e.target.value, 10) })}
                    className="w-full px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-text-secondary mb-1">Compte</label>
                <select defaultValue={campaign.from_account} onChange={(e) => saveSettings({ from_account: e.target.value })} className="w-full px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm">
                  <option value="pro">Pro (SMTP)</option><option value="gmail">Gmail</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Mode de génération</label>
                <select defaultValue={campaign.mode} onChange={(e) => saveSettings({ mode: e.target.value })} className="w-full px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm" title="S'applique aux prochains prospects ajoutés ; les lignes existantes se régénèrent une par une">
                  <option value="preuve">Preuve (repli maintenance)</option><option value="maintenance">Maintenance seule</option><option value="modele">Modèle du menu</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Modèle (mode modèle)</label>
                <select defaultValue={campaign.template_id || ''} onChange={(e) => saveSettings({ template_id: e.target.value ? parseInt(e.target.value, 10) : null })} className="w-full px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm">
                  <option value="">Aucun</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Signature</label>
                <select defaultValue={campaign.signature_id || ''} onChange={(e) => saveSettings({ signature_id: e.target.value ? parseInt(e.target.value, 10) : null })} className="w-full px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm">
                  <option value="">Par défaut (Paramètres)</option>
                  {signatures.map((sg) => <option key={sg.id} value={sg.id}>{sg.name || sg.title || `Signature #${sg.id}`}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Copie cachée (Cci)</label>
                <input type="email" defaultValue={campaign.bcc || ''} placeholder="moi@pixfeed.net" onBlur={(e) => saveSettings({ bcc: e.target.value.trim() || null })}
                  className="w-full px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Relance (manuelle, dans le Suivi)</label>
                <select defaultValue={campaign.relance_jours || ''} onChange={(e) => saveSettings({ relance_jours: e.target.value ? parseInt(e.target.value, 10) : null })} className="w-full px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm" title="Désactivée par défaut. Si activée, une relance à faire apparaît dans le Suivi J+N après chaque envoi ; une réponse la ferme.">
                  <option value="">Aucune</option><option value="3">J+3</option><option value="7">J+7</option><option value="14">J+14</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Canal de relance</label>
                <select defaultValue={campaign.relance_canal || 'email'} onChange={(e) => saveSettings({ relance_canal: e.target.value })} className="w-full px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm">
                  <option value="email">Email</option><option value="appel">Appel</option><option value="sms">SMS</option>
                </select>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button onClick={checkSender} disabled={checking} className="px-3 py-2 rounded-lg bg-surface-strong text-text-primary hover:bg-border-strong text-sm flex items-center gap-1.5 disabled:opacity-50"><FiShield size={14} className={checking ? 'animate-spin' : ''} /> Vérifier l'expéditeur</button>
            <label className="flex items-center gap-2 text-sm text-text-secondary" title="Vide : les envois commencent tout de suite, à la cadence. Rempli : les créneaux partent de cette date.">Commencer le
              <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} className="px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} /> Mode test (vers mes adresses)</label>
            {testMode && <input value={testEmails} onChange={(e) => setTestEmails(e.target.value)} placeholder="moi@exemple.fr, autre@exemple.fr" className="px-3 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent min-w-[260px]" />}
            <button onClick={programmer} disabled={!!working || !(counts.valide || 0)} className={`px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 ${testMode ? 'bg-warning-text' : 'bg-accent hover:bg-accent-hover'}`}>
              <FiSend size={14} /> {working === 'schedule' ? 'Programmation…' : testMode ? `Programmer ${counts.valide || 0} test(s)` : `Programmer ${counts.valide || 0} envoi(s) réel(s)`}
            </button>
          </div>
          {sender && (
            <div className="mt-3 text-xs rounded-lg border border-border bg-surface-muted/60 text-text-secondary px-3 py-2 space-y-0.5">
              <div>SMTP : {sender.smtp && sender.smtp.ok ? <span className="text-success-text">connexion OK ({sender.smtp.host})</span> : <span className="text-danger-text">échec {sender.smtp && sender.smtp.erreur}</span>} · Gmail : {sender.gmail && sender.gmail.configure ? 'configuré' : 'non configuré'}</div>
              <div>Domaine {sender.domaine || '?'} : SPF {sender.spf && sender.spf.ok ? <span className="text-success-text">présent</span> : <span className="text-danger-text">absent</span>} · DMARC {sender.dmarc && sender.dmarc.ok ? <span className="text-success-text">présent</span> : <span className="text-danger-text">absent</span>} · DKIM {sender.dkim && sender.dkim.ok === true ? <span className="text-success-text">présent</span> : sender.dkim && sender.dkim.ok === false ? <span className="text-danger-text">absent</span> : <span className="text-text-muted">non vérifiable</span>}</div>
              {(sender.conseils || []).map((c, i) => <div key={i} className="text-warning-text">· {c}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Étapes 1 et 2 : lignes classées, relecture */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {VUES.map((v) => (
          <button key={v.key} onClick={() => { setVue(v.key); setSelected(new Set()); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${vue === v.key ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
            {v.label} ({v.key === 'tous' ? stats.total : (counts[v.key] || 0)})
          </button>
        ))}
      </div>
      {selectables.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <label className="text-xs text-text-muted flex items-center gap-1.5"><input type="checkbox" checked={selectables.every((i) => selected.has(i.id))} onChange={(e) => setSelected(e.target.checked ? new Set(selectables.map((i) => i.id)) : new Set())} /> tout sélectionner ({selectables.length})</label>
          <button onClick={() => validerSelection('valide')} disabled={!selected.size} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1"><FiCheckCircle size={14} /> Valider la sélection{selected.size ? ` (${selected.size})` : ''}</button>
          <button onClick={() => validerSelection('pret')} disabled={!selected.size} className="px-3 py-1.5 rounded-lg bg-surface-strong text-text-primary text-sm hover:bg-border-strong disabled:opacity-50">Dévalider</button>
          {vue === 'a_verifier' && <span className="text-xs text-warning-text">Les lignes « à vérifier » ne partent jamais sans ta validation explicite, ligne par ligne ou ici.</span>}
        </div>
      )}
      {visibles.length === 0 ? (
        <div className="text-center py-10 bg-surface/30 rounded-lg border border-border text-text-muted text-sm">
          {stats.total === 0 ? <>Aucune ligne. Ajoute des prospects depuis le Crawl ou la liste des <button onClick={() => navigate('/portefeuille?tab=prospects')} className="text-accent hover:underline">Prospects</button>.</> : 'Rien dans cette vue.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((it) => <ItemRow key={it.id} item={it} campaign={campaign} selected={selected.has(it.id)} onToggle={(iid) => setSelected((p) => { const n = new Set(p); if (n.has(iid)) n.delete(iid); else n.add(iid); return n; })} onChange={changeItem} onReanalyze={reanalyzeItem} />)}
        </div>
      )}
      <p className="text-xs text-text-muted mt-4 flex items-center gap-1"><FiCheck size={12} /> Chaque email est généré par les règles validées : présentation PixFeed, preuve vérifiée ou maintenance sans alerte, refus discret. Aucune relance automatique n'est créée.</p>
      <p className="text-xs text-text-muted mt-1 flex items-center gap-1"><FiXCircle size={12} /> Une ligne exclue ne part jamais : désinscrit, sollicité depuis moins de 90 jours, autre campagne active, fiche fermée, site bloqué par le crawl.</p>
    </div>
  );
};

const CampaignsPanel = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const current = searchParams.get('campagne');
  const open = (id) => setSearchParams({ tab: 'campagnes', campagne: String(id) });
  const back = () => setSearchParams({ tab: 'campagnes' });
  return current ? <CampaignView id={current} onBack={back} /> : <CampaignList onOpen={open} />;
};

export default CampaignsPanel;

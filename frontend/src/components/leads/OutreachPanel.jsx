// src/components/leads/OutreachPanel.jsx
//
// Outreach multi-canal (Email / Facebook / Instagram) sur les leads.
// L'historique vit dans la TABLE interactions (plus de localStorage) : chaque action crée
// une interaction standard taggée `result = outreach:<canal>:<statut>` -> visible dans le
// Suivi (cockpit) et l'historique du contact, relances planifiées comprises.
// Pas d'envoi automatique (pas d'API DM Facebook/Instagram) : rédaction + copie + mailto,
// puis "Marquer envoyé". Templates email : ceux du module Email (persistés en base) +
// modèles par défaut ; DM : modèles par défaut. Charte : tokens de thème.
import React, { useState, useEffect, useCallback } from 'react';
import {
  FiMail, FiSend, FiClock, FiCheck, FiX,
  FiUser, FiPhone, FiCopy, FiChevronDown, FiChevronUp,
  FiInstagram, FiFacebook, FiZap, FiMessageSquare, FiExternalLink
} from 'react-icons/fi';
import { interactionsAPI, emailTemplatesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { decodeHtml } from '../../utils/decodeHtml';

const CHANNELS = [
  { id: 'email', label: 'Email', icon: FiMail },
  { id: 'facebook', label: 'Facebook', icon: FiFacebook },
  { id: 'instagram', label: 'Instagram', icon: FiInstagram }
];
const channelLabel = (id) => (CHANNELS.find((c) => c.id === id) || {}).label || id;

// URL du profil social d'un lead : accepte une URL complète ou un simple pseudo (@x ou x).
const socialUrl = (channel, value) => {
  const v = (value || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, '');
  return channel === 'facebook' ? `https://facebook.com/${handle}` : `https://instagram.com/${handle}`;
};
// URL du profil pour un canal donné du lead (null si non renseigné ou canal email).
const leadChannelUrl = (lead, channel) => {
  if (!lead) return null;
  if (channel === 'facebook') return socialUrl('facebook', lead.facebook_url);
  if (channel === 'instagram') return socialUrl('instagram', lead.instagram_url);
  return null;
};

// Modèles par défaut (les templates email PERSISTÉS du module Email s'y ajoutent).
const DEFAULT_TEMPLATES = {
  email: [
    {
      id: 'def-1', name: 'Premier contact',
      subject: 'Collaboration {{entreprise}} x [Ton entreprise]',
      body: `Bonjour {{prénom}},\n\nJe me permets de vous contacter car j'ai découvert {{entreprise}} et je pense que nous pourrions collaborer ensemble.\n\n[Ton pitch ici]\n\nSeriez-vous disponible pour un échange de 15 minutes cette semaine ?\n\nBien cordialement`
    },
    {
      id: 'def-2', name: 'Relance',
      subject: 'Re: Collaboration {{entreprise}}',
      body: `Bonjour {{prénom}},\n\nJe me permets de revenir vers vous suite à mon précédent message.\n\nAvez-vous eu le temps d'y réfléchir ?\n\nBien cordialement`
    },
    {
      id: 'def-3', name: 'Premier contact e-commerce (plateforme)',
      subject: 'Votre boutique {{plateforme}} — {{site}}',
      body: `Bonjour {{prénom}},\n\nEn parcourant {{site}}, j'ai vu que votre boutique tourne sous {{plateforme}}.\n\n[Observation concrète sur LEUR site : vitesse, fiche produit, référencement...]\n\nJ'accompagne des boutiques {{plateforme}} sur ce type de sujets. Seriez-vous ouvert à un échange rapide de 15 minutes ?\n\nBien cordialement`
    }
  ],
  facebook: [
    { id: 'def-1', name: 'Premier DM', body: `Salut {{prénom}} !\n\nJe viens de découvrir {{entreprise}} et j'adore ce que vous faites !\n\nJe travaille dans [ton domaine] et je pense qu'on pourrait faire des trucs cool ensemble. T'es open pour en discuter ?` },
    { id: 'def-2', name: 'Relance friendly', body: `Hey {{prénom}} ! J'espère que tu vas bien\n\nJe te relance juste pour savoir si t'avais vu mon message ?` }
  ],
  instagram: [
    { id: 'def-1', name: 'Premier DM', body: `Hey {{prénom}} !\n\nJe kiffe trop ce que tu fais avec {{entreprise}} !\n\nJe bosse dans [ton domaine] et j'ai une idée qui pourrait t'intéresser. On en parle ?` },
    { id: 'def-2', name: 'Relance', body: `Yo {{prénom}} ! T'as vu mon message ?` }
  ]
};

const STATUS_META = {
  sent: { label: 'Envoyé', cls: 'bg-info-bg text-info-text', dot: 'bg-info-text' },
  responded: { label: 'A répondu', cls: 'bg-success-bg text-success-text', dot: 'bg-success-text' },
  not_interested: { label: 'Pas intéressé', cls: 'bg-danger-bg text-danger-text', dot: 'bg-danger-text' }
};

const OutreachPanel = ({ leads = [] }) => {
  const { toast } = useToast();

  const [selectedLead, setSelectedLead] = useState(null);
  const [activeChannel, setActiveChannel] = useState('email');
  const [message, setMessage] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'not_contacted' | 'pending' | 'to_followup'
  const [showTemplates, setShowTemplates] = useState(false);
  const [showFollowupPicker, setShowFollowupPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Résumé outreach (base) : { [lead_id]: { email:{status,date}, ..., next_followup } }
  const [summary, setSummary] = useState({});
  const loadSummary = useCallback(() => {
    interactionsAPI.getOutreachSummary().then((s) => setSummary(s || {})).catch(() => {});
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  // Templates email persistés (module Email) fusionnés avec les modèles par défaut.
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  useEffect(() => {
    emailTemplatesAPI.list()
      .then((saved) => {
        if (Array.isArray(saved) && saved.length) {
          setTemplates((t) => ({
            ...t,
            email: [
              ...saved.map((s) => ({ id: `db-${s.id}`, name: s.name, subject: s.subject || '', body: s.body || '' })),
              ...DEFAULT_TEMPLATES.email
            ]
          }));
        }
      })
      .catch(() => {});
  }, []);

  const channelStatus = (leadId, channel) => (summary[leadId] || {})[channel] || null;
  const hasFollowupDue = (leadId) => {
    const f = (summary[leadId] || {}).next_followup;
    return f && new Date(f) <= new Date();
  };

  // Filtres de la liste.
  const filteredLeads = leads.filter((lead) => {
    const h = summary[lead.id] || {};
    const hasContact = h.email || h.facebook || h.instagram;
    const hasPending = ['email', 'facebook', 'instagram'].some((c) => h[c]?.status === 'sent');
    switch (filter) {
      case 'not_contacted': return !hasContact;
      case 'pending': return hasPending;
      case 'to_followup': return hasFollowupDue(lead.id);
      default: return true;
    }
  });

  const stats = {
    total: leads.length,
    notContacted: leads.filter((l) => {
      const h = summary[l.id] || {};
      return !(h.email || h.facebook || h.instagram);
    }).length,
    pending: leads.filter((l) => {
      const h = summary[l.id] || {};
      return ['email', 'facebook', 'instagram'].some((c) => h[c]?.status === 'sent');
    }).length,
    responded: leads.filter((l) => {
      const h = summary[l.id] || {};
      return ['email', 'facebook', 'instagram'].some((c) => h[c]?.status === 'responded');
    }).length
  };

  // Variables de templates -> champs RÉELS des leads (name / company).
  const replaceVariables = (text, lead) => {
    if (!text || !lead) return text;
    const name = decodeHtml(lead.name) || '';
    const company = decodeHtml(lead.company) || name;
    return text
      .replace(/\{\{prénom\}\}/gi, name.split(' ')[0] || company)
      .replace(/\{\{nom\}\}/gi, name)
      .replace(/\{\{entreprise\}\}/gi, company)
      .replace(/\{\{email\}\}/gi, lead.email || '')
      .replace(/\{\{téléphone\}\}/gi, lead.phone || '')
      // Personnalisation qui fait la différence en cold : la plateforme détectée au crawl
      // ("votre boutique PrestaShop...") et le site du lead.
      .replace(/\{\{plateforme\}\}/gi, lead.platform || 'votre site')
      .replace(/\{\{site\}\}/gi, decodeHtml(lead.company) || '');
  };

  const applyTemplate = (template) => {
    if (activeChannel === 'email') setEmailSubject(replaceVariables(template.subject, selectedLead));
    setMessage(replaceVariables(template.body, selectedLead));
    setShowTemplates(false);
  };

  const copyMessage = () => {
    const full = activeChannel === 'email' ? `Objet: ${emailSubject}\n\n${message}` : message;
    navigator.clipboard.writeText(full);
    toast.success('Message copié !');
  };

  // Crée l'interaction outreach (visible dans le Suivi + historique du contact).
  const logOutreach = async ({ status, notes, followupDate = null, reached = null, type = 'note' }) => {
    if (!selectedLead) return;
    setSaving(true);
    try {
      await interactionsAPI.create({
        contact_type: 'lead',
        contact_id: selectedLead.id,
        type,
        reached,
        notes,
        result: `outreach:${activeChannel}:${status}`,
        next_followup_date: followupDate,
        // Les relances CRM ne connaissent pas facebook/instagram -> canal 'autre'.
        next_followup_channel: followupDate ? (activeChannel === 'email' ? 'email' : 'autre') : null
      });
      loadSummary();
    } catch (e) {
      toast.error("Erreur lors de l'enregistrement");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const markAsSent = async () => {
    const label = channelLabel(activeChannel);
    const body = activeChannel === 'email' && emailSubject ? `Objet : ${emailSubject}\n\n${message}` : message;
    try {
      await logOutreach({
        status: 'sent',
        type: activeChannel === 'email' ? 'email' : 'note',
        reached: 'message',
        notes: `[Outreach ${label}]\n${body}`
      });
      toast.success(`${activeChannel === 'email' ? 'Email' : 'Message'} marqué comme envoyé !`);
      // Nudge relance : un cold SANS relance ne rapporte quasi jamais (la majorité des
      // réponses arrivent à la 2e/3e touche) -> on ouvre directement le choix de relance.
      setShowFollowupPicker(true);
      toast.info('Planifie la relance maintenant (J+3 recommandé)');
    } catch (e) { /* déjà signalé */ }
  };

  const markAsResponded = async () => {
    try {
      await logOutreach({ status: 'responded', reached: 'joint', notes: `[Outreach ${channelLabel(activeChannel)}] Réponse reçue` });
      toast.success('Marqué comme répondu !');
    } catch (e) { /* déjà signalé */ }
  };

  const markNotInterested = async () => {
    try {
      await logOutreach({ status: 'not_interested', notes: `[Outreach ${channelLabel(activeChannel)}] Pas intéressé` });
      toast.info('Marqué comme pas intéressé');
    } catch (e) { /* déjà signalé */ }
  };

  const scheduleFollowup = async (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const current = channelStatus(selectedLead?.id, activeChannel);
    try {
      await logOutreach({
        status: current?.status || 'sent',
        notes: `[Outreach ${channelLabel(activeChannel)}] Relance programmée`,
        followupDate: d.toISOString().slice(0, 10)
      });
      setShowFollowupPicker(false);
      toast.success(`Relance planifiée dans ${days} jour${days > 1 ? 's' : ''}`);
    } catch (e) { /* déjà signalé */ }
  };

  const activeStatus = selectedLead ? channelStatus(selectedLead.id, activeChannel) : null;
  const activeFollowup = selectedLead ? (summary[selectedLead.id] || {}).next_followup : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-accent/15 text-accent rounded-xl flex items-center justify-center flex-shrink-0">
            <FiSend size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-text-primary mb-1">Outreach multi-canal</h3>
            <p className="text-sm text-text-muted">
              Email, Facebook &amp; Instagram — chaque action est enregistrée dans le Suivi (interactions + relances).
            </p>
          </div>
        </div>

        {/* Stats rapides */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total leads', value: stats.total, cls: 'text-text-primary' },
            { label: 'Non contactés', value: stats.notContacted, cls: 'text-warning-text' },
            { label: 'En attente', value: stats.pending, cls: 'text-info-text' },
            { label: 'Ont répondu', value: stats.responded, cls: 'text-success-text' }
          ].map((s) => (
            <div key={s.label} className="bg-surface-muted rounded-lg p-3 text-center border border-border">
              <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
              <div className="text-xs text-text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Liste des leads */}
        <div className="lg:col-span-1 bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-text-primary flex items-center gap-2">
              <FiUser className="text-accent" size={15} /> Leads à contacter
            </h4>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-xs bg-surface-muted border border-border rounded-lg px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="all">Tous ({leads.length})</option>
              <option value="not_contacted">Non contactés ({stats.notContacted})</option>
              <option value="pending">En attente ({stats.pending})</option>
              <option value="to_followup">À relancer</option>
            </select>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredLeads.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                <FiUser className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucun lead à afficher</p>
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const isSelected = selectedLead?.id === lead.id;
                return (
                  <button
                    key={lead.id}
                    onClick={() => { setSelectedLead(lead); setMessage(''); setEmailSubject(''); }}
                    className={`w-full text-left p-3 rounded-lg transition-colors border ${
                      isSelected ? 'bg-accent/10 border-accent/50' : 'bg-surface-muted hover:bg-surface-strong border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-text-primary truncate">{decodeHtml(lead.name)}</div>
                        <div className="text-xs text-text-muted truncate">
                          {decodeHtml(lead.company) || lead.email || 'Pas de contact'}
                        </div>
                      </div>
                      {/* Indicateurs de canaux */}
                      <div className="flex gap-1 flex-shrink-0">
                        {CHANNELS.map(({ id, icon: Icon }) => {
                          const st = channelStatus(lead.id, id);
                          if (!st) return null;
                          const meta = STATUS_META[st.status] || STATUS_META.sent;
                          return (
                            <span key={id} className={`w-5 h-5 rounded flex items-center justify-center ${meta.cls}`} title={`${channelLabel(id)} : ${meta.label}`}>
                              <Icon size={11} />
                            </span>
                          );
                        })}
                        {hasFollowupDue(lead.id) && (
                          <span className="w-5 h-5 rounded flex items-center justify-center bg-warning-bg text-warning-text" title="Relance due">
                            <FiClock size={11} />
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Zone de rédaction */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-4">
          {!selectedLead ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-text-muted">
              <FiMessageSquare className="w-12 h-12 mb-4 opacity-50" />
              <p>Sélectionnez un lead pour commencer</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Info lead sélectionné */}
              <div className="flex items-center justify-between bg-surface-muted rounded-lg p-3 border border-border">
                <div className="min-w-0">
                  <div className="font-semibold text-text-primary truncate">{decodeHtml(selectedLead.name)}</div>
                  <div className="text-sm text-text-muted truncate">
                    {selectedLead.company && <span>{decodeHtml(selectedLead.company)} • </span>}
                    {selectedLead.email || selectedLead.phone || 'Pas de contact'}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {selectedLead.email && (
                    <a href={`mailto:${selectedLead.email}`} className="p-2 bg-surface-strong hover:bg-border-strong rounded-lg transition-colors" title="Ouvrir email">
                      <FiMail size={15} className="text-text-primary" />
                    </a>
                  )}
                  {selectedLead.phone && (
                    <a href={`tel:${selectedLead.phone}`} className="p-2 bg-surface-strong hover:bg-border-strong rounded-lg transition-colors" title="Appeler">
                      <FiPhone size={15} className="text-text-primary" />
                    </a>
                  )}
                  {leadChannelUrl(selectedLead, 'facebook') && (
                    <a href={leadChannelUrl(selectedLead, 'facebook')} target="_blank" rel="noopener noreferrer"
                      className="p-2 bg-surface-strong hover:bg-border-strong rounded-lg transition-colors" title="Ouvrir le profil Facebook">
                      <FiFacebook size={15} className="text-text-primary" />
                    </a>
                  )}
                  {leadChannelUrl(selectedLead, 'instagram') && (
                    <a href={leadChannelUrl(selectedLead, 'instagram')} target="_blank" rel="noopener noreferrer"
                      className="p-2 bg-surface-strong hover:bg-border-strong rounded-lg transition-colors" title="Ouvrir le profil Instagram">
                      <FiInstagram size={15} className="text-text-primary" />
                    </a>
                  )}
                </div>
              </div>

              {/* Sélection du canal */}
              <div className="flex gap-2">
                {CHANNELS.map(({ id, label, icon: Icon }) => {
                  const st = channelStatus(selectedLead.id, id);
                  const meta = st ? (STATUS_META[st.status] || STATUS_META.sent) : null;
                  return (
                    <button
                      key={id}
                      onClick={() => { setActiveChannel(id); setMessage(''); setEmailSubject(''); }}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                        activeChannel === id ? 'bg-accent text-white' : 'bg-surface-muted text-text-secondary hover:bg-surface-strong'
                      }`}
                    >
                      <Icon size={15} />
                      <span className="hidden sm:inline">{label}</span>
                      {meta && <span className={`ml-1 w-2 h-2 rounded-full ${meta.dot}`} />}
                    </button>
                  );
                })}
              </div>

              {/* Profil du canal actif : lien direct pour ouvrir la page FB/IG du lead
                  (ou rappel de le renseigner dans la fiche si absent). */}
              {activeChannel !== 'email' && (
                leadChannelUrl(selectedLead, activeChannel) ? (
                  <a
                    href={leadChannelUrl(selectedLead, activeChannel)}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hover"
                  >
                    {activeChannel === 'facebook' ? <FiFacebook size={14} /> : <FiInstagram size={14} />}
                    Ouvrir le profil {channelLabel(activeChannel)} <FiExternalLink size={12} />
                  </a>
                ) : (
                  <p className="text-xs text-text-muted">
                    Pas de profil {channelLabel(activeChannel)} renseigné — ajoute-le dans la fiche du lead
                    (champ « {channelLabel(activeChannel)} ») pour pouvoir l'ouvrir d'un clic.
                  </p>
                )
              )}

              {/* Statut actuel du canal */}
              {(activeStatus || activeFollowup) && (
                <div className={`text-sm p-2 rounded-lg ${activeStatus ? (STATUS_META[activeStatus.status] || STATUS_META.sent).cls : 'bg-warning-bg text-warning-text'}`}>
                  {activeStatus && <>{(STATUS_META[activeStatus.status] || STATUS_META.sent).label} le {new Date(activeStatus.date).toLocaleDateString('fr-FR')}</>}
                  {activeFollowup && <> • Relance prévue le {new Date(activeFollowup).toLocaleDateString('fr-FR')}</>}
                </div>
              )}

              {/* Templates */}
              <div>
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors"
                >
                  <FiZap size={14} /> Templates rapides {showTemplates ? <FiChevronUp /> : <FiChevronDown />}
                </button>
                {showTemplates && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(templates[activeChannel] || []).map((template) => (
                      <button
                        key={template.id}
                        onClick={() => applyTemplate(template)}
                        className="text-left p-3 bg-surface-muted hover:bg-surface-strong rounded-lg transition-colors border border-border"
                      >
                        <div className="font-medium text-text-primary text-sm">{template.name}</div>
                        <div className="text-xs text-text-muted truncate mt-1">{(template.body || '').substring(0, 50)}…</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Champ objet (email uniquement) */}
              {activeChannel === 'email' && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Objet</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Objet de l'email…"
                    className="w-full px-4 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              {/* Zone de texte message */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Message
                  <span className="text-xs text-text-muted ml-2">Variables : {'{{prénom}}'}, {'{{nom}}'}, {'{{entreprise}}'}, {'{{email}}'}, {'{{plateforme}}'}, {'{{site}}'}</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`Écrivez votre message ${channelLabel(activeChannel)}…`}
                  rows={8}
                  className="w-full px-4 py-3 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-text-muted">{message.length} caractères</span>
                  <button
                    onClick={copyMessage}
                    disabled={!message}
                    className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 disabled:opacity-50"
                  >
                    <FiCopy size={11} /> Copier
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <button
                  onClick={markAsSent}
                  disabled={!message || saving}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  <FiSend size={15} /> Marquer envoyé
                </button>
                <button
                  onClick={markAsResponded}
                  disabled={saving}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-success-bg text-success-text border border-success-text/30 hover:bg-success-bg/70 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  <FiCheck size={15} /> A répondu
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowFollowupPicker(!showFollowupPicker)}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    <FiClock size={15} /> Relancer
                  </button>
                  {showFollowupPicker && (
                    <div className="absolute bottom-full left-0 mb-2 bg-surface border border-border-strong rounded-lg p-2 shadow-xl z-10">
                      <div className="text-xs text-text-muted mb-2">Relancer dans :</div>
                      <div className="flex flex-col gap-1">
                        {[1, 2, 3, 5, 7, 14].map((days) => (
                          <button
                            key={days}
                            onClick={() => scheduleFollowup(days)}
                            className="px-3 py-1 text-sm text-text-primary hover:bg-surface-strong rounded transition-colors text-left"
                          >
                            {days} jour{days > 1 ? 's' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={markNotInterested}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-danger-bg text-danger-text border border-danger-text/30 hover:bg-danger-bg/70 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  <FiX size={15} /> Pas intéressé
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OutreachPanel;

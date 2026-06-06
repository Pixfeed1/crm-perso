// src/components/leads/OutreachPanel.jsx
import React, { useState, useEffect } from 'react';
import {
  FiMail, FiMessageCircle, FiSend, FiClock, FiCheck, FiX,
  FiUser, FiPhone, FiCalendar, FiEdit3, FiCopy, FiChevronDown,
  FiChevronUp, FiFilter, FiRefreshCw, FiEye, FiMessageSquare,
  FiInstagram, FiFacebook, FiPlus, FiTrash2, FiSave, FiZap
} from 'react-icons/fi';
import { leadsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const OutreachPanel = ({ leads = [], onLeadUpdated }) => {
  const { toast } = useToast();

  // État principal
  const [selectedLead, setSelectedLead] = useState(null);
  const [activeChannel, setActiveChannel] = useState('email'); // 'email', 'facebook', 'instagram'
  const [message, setMessage] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'not_contacted', 'pending', 'to_followup'
  const [showTemplates, setShowTemplates] = useState(false);
  const [saving, setSaving] = useState(false);

  // Templates par canal
  const [templates, setTemplates] = useState({
    email: [
      {
        id: 1,
        name: 'Premier contact',
        subject: 'Collaboration {{entreprise}} x [Ton entreprise]',
        body: `Bonjour {{prénom}},

Je me permets de vous contacter car j'ai découvert {{entreprise}} et je pense que nous pourrions collaborer ensemble.

[Ton pitch ici]

Seriez-vous disponible pour un échange de 15 minutes cette semaine ?

Bien cordialement`
      },
      {
        id: 2,
        name: 'Relance',
        subject: 'Re: Collaboration {{entreprise}}',
        body: `Bonjour {{prénom}},

Je me permets de revenir vers vous suite à mon précédent message.

Avez-vous eu le temps d'y réfléchir ?

Bien cordialement`
      }
    ],
    facebook: [
      {
        id: 1,
        name: 'Premier DM',
        body: `Salut {{prénom}} !

Je viens de découvrir {{entreprise}} et j'adore ce que vous faites !

Je travaille dans [ton domaine] et je pense qu'on pourrait faire des trucs cool ensemble. T'es open pour en discuter ?`
      },
      {
        id: 2,
        name: 'Relance friendly',
        body: `Hey {{prénom}} ! J'espère que tu vas bien

Je te relance juste pour savoir si t'avais vu mon message ?`
      }
    ],
    instagram: [
      {
        id: 1,
        name: 'Premier DM',
        body: `Hey {{prénom}} !

Je kiffe trop ce que tu fais avec {{entreprise}} !

Je bosse dans [ton domaine] et j'ai une idée qui pourrait t'intéresser. On en parle ?`
      },
      {
        id: 2,
        name: 'Relance',
        body: `Yo {{prénom}} ! T'as vu mon message ?`
      }
    ]
  });

  // Historique des outreach
  const [outreachHistory, setOutreachHistory] = useState({});

  // Charger l'historique depuis localStorage
  useEffect(() => {
    const saved = localStorage.getItem('outreach_history');
    if (saved) {
      setOutreachHistory(JSON.parse(saved));
    }
  }, []);

  // Sauvegarder l'historique
  const saveHistory = (newHistory) => {
    setOutreachHistory(newHistory);
    localStorage.setItem('outreach_history', JSON.stringify(newHistory));
  };

  // Filtrer les leads
  const filteredLeads = leads.filter(lead => {
    const history = outreachHistory[lead.id] || {};
    const hasContact = history.email || history.facebook || history.instagram;
    const hasPendingResponse = Object.values(history).some(h => h?.status === 'sent');
    const needsFollowup = Object.values(history).some(h => h?.followup_date && new Date(h.followup_date) <= new Date());

    switch (filter) {
      case 'not_contacted':
        return !hasContact;
      case 'pending':
        return hasPendingResponse;
      case 'to_followup':
        return needsFollowup;
      default:
        return true;
    }
  });

  // Stats rapides
  const stats = {
    total: leads.length,
    notContacted: leads.filter(l => !outreachHistory[l.id]).length,
    pending: leads.filter(l => {
      const h = outreachHistory[l.id];
      return h && Object.values(h).some(ch => ch?.status === 'sent');
    }).length,
    responded: leads.filter(l => {
      const h = outreachHistory[l.id];
      return h && Object.values(h).some(ch => ch?.status === 'responded');
    }).length
  };

  // Remplacer les variables dans le message
  const replaceVariables = (text, lead) => {
    if (!text || !lead) return text;
    return text
      .replace(/\{\{prénom\}\}/gi, lead.contact_name?.split(' ')[0] || lead.company_name || '')
      .replace(/\{\{nom\}\}/gi, lead.contact_name || '')
      .replace(/\{\{entreprise\}\}/gi, lead.company_name || '')
      .replace(/\{\{email\}\}/gi, lead.email || '')
      .replace(/\{\{téléphone\}\}/gi, lead.phone || '');
  };

  // Appliquer un template
  const applyTemplate = (template) => {
    if (activeChannel === 'email') {
      setEmailSubject(replaceVariables(template.subject, selectedLead));
    }
    setMessage(replaceVariables(template.body, selectedLead));
    setShowTemplates(false);
    toast.success('Template appliqué !');
  };

  // Copier le message
  const copyMessage = () => {
    const fullMessage = activeChannel === 'email'
      ? `Objet: ${emailSubject}\n\n${message}`
      : message;
    navigator.clipboard.writeText(fullMessage);
    toast.success('Message copié !');
  };

  // Marquer comme envoyé
  const markAsSent = () => {
    if (!selectedLead) return;

    const leadHistory = outreachHistory[selectedLead.id] || {};
    const newHistory = {
      ...outreachHistory,
      [selectedLead.id]: {
        ...leadHistory,
        [activeChannel]: {
          status: 'sent',
          message: message,
          subject: emailSubject,
          sent_at: new Date().toISOString(),
          followup_date: null
        }
      }
    };

    saveHistory(newHistory);
    toast.success(`${activeChannel === 'email' ? 'Email' : 'Message'} marqué comme envoyé !`);
  };

  // Marquer comme répondu
  const markAsResponded = () => {
    if (!selectedLead) return;

    const leadHistory = outreachHistory[selectedLead.id] || {};
    const channelHistory = leadHistory[activeChannel] || {};

    const newHistory = {
      ...outreachHistory,
      [selectedLead.id]: {
        ...leadHistory,
        [activeChannel]: {
          ...channelHistory,
          status: 'responded',
          responded_at: new Date().toISOString()
        }
      }
    };

    saveHistory(newHistory);
    toast.success('Marqué comme répondu !');
  };

  // Planifier relance
  const [showFollowupPicker, setShowFollowupPicker] = useState(false);
  const scheduleFollowup = (days) => {
    if (!selectedLead) return;

    const followupDate = new Date();
    followupDate.setDate(followupDate.getDate() + days);

    const leadHistory = outreachHistory[selectedLead.id] || {};
    const channelHistory = leadHistory[activeChannel] || {};

    const newHistory = {
      ...outreachHistory,
      [selectedLead.id]: {
        ...leadHistory,
        [activeChannel]: {
          ...channelHistory,
          followup_date: followupDate.toISOString(),
          status: channelHistory.status || 'pending'
        }
      }
    };

    saveHistory(newHistory);
    setShowFollowupPicker(false);
    toast.success(`Relance planifiée dans ${days} jour${days > 1 ? 's' : ''}`);
  };

  // Obtenir le statut d'un lead pour un canal
  const getChannelStatus = (lead, channel) => {
    const history = outreachHistory[lead?.id]?.[channel];
    if (!history) return null;
    return history;
  };

  // Icône du canal
  const getChannelIcon = (channel) => {
    switch (channel) {
      case 'email': return <FiMail className="w-4 h-4" />;
      case 'facebook': return <FiFacebook className="w-4 h-4" />;
      case 'instagram': return <FiInstagram className="w-4 h-4" />;
      default: return <FiMessageCircle className="w-4 h-4" />;
    }
  };

  // Couleur du statut
  const getStatusColor = (status) => {
    switch (status) {
      case 'sent': return 'text-blue-400 bg-blue-500/20';
      case 'responded': return 'text-green-400 bg-green-500/20';
      case 'not_interested': return 'text-red-400 bg-red-500/20';
      default: return 'text-text-muted bg-gray-500/20';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-900/40 via-teal-900/30 to-emerald-900/40 border border-emerald-500/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiSend className="text-text-primary text-xl" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-text-primary mb-1">
              Outreach Multi-Canal
            </h3>
            <p className="text-sm text-emerald-200">
              Email, Facebook & Instagram - Gérez vos campagnes de prospection
            </p>
          </div>
        </div>

        {/* Stats rapides */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-text-primary">{stats.total}</div>
            <div className="text-xs text-text-muted">Total leads</div>
          </div>
          <div className="bg-surface/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-400">{stats.notContacted}</div>
            <div className="text-xs text-text-muted">Non contactés</div>
          </div>
          <div className="bg-surface/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.pending}</div>
            <div className="text-xs text-text-muted">En attente</div>
          </div>
          <div className="bg-surface/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-400">{stats.responded}</div>
            <div className="text-xs text-text-muted">Ont répondu</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Liste des leads */}
        <div className="lg:col-span-1 bg-surface/30 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-text-primary flex items-center gap-2">
              <FiUser className="text-emerald-400" />
              Leads à contacter
            </h4>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-xs bg-surface-strong border border-border-strong rounded-lg px-2 py-1 text-text-primary"
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
              filteredLeads.map(lead => {
                const history = outreachHistory[lead.id] || {};
                const isSelected = selectedLead?.id === lead.id;

                return (
                  <button
                    key={lead.id}
                    onClick={() => {
                      setSelectedLead(lead);
                      setMessage('');
                      setEmailSubject('');
                    }}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      isSelected
                        ? 'bg-emerald-600/30 border-emerald-500'
                        : 'bg-surface/50 hover:bg-surface-strong/50 border-transparent'
                    } border`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-text-primary truncate">
                          {lead.company_name}
                        </div>
                        <div className="text-xs text-text-muted truncate">
                          {lead.contact_name || 'Pas de contact'}
                        </div>
                      </div>
                      {/* Indicateurs de canaux */}
                      <div className="flex gap-1 flex-shrink-0">
                        {['email', 'facebook', 'instagram'].map(channel => {
                          const status = history[channel]?.status;
                          return status ? (
                            <span
                              key={channel}
                              className={`w-5 h-5 rounded flex items-center justify-center ${getStatusColor(status)}`}
                              title={`${channel}: ${status}`}
                            >
                              {getChannelIcon(channel)}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Zone de rédaction */}
        <div className="lg:col-span-2 bg-surface/30 border border-border rounded-xl p-4">
          {!selectedLead ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-text-muted">
              <FiMessageSquare className="w-12 h-12 mb-4 opacity-50" />
              <p>Sélectionnez un lead pour commencer</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Info lead sélectionné */}
              <div className="flex items-center justify-between bg-surface-muted/50 rounded-lg p-3">
                <div>
                  <div className="font-semibold text-text-primary">{selectedLead.company_name}</div>
                  <div className="text-sm text-text-muted">
                    {selectedLead.contact_name && <span>{selectedLead.contact_name} • </span>}
                    {selectedLead.email || selectedLead.phone || 'Pas de contact'}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedLead.email && (
                    <a
                      href={`mailto:${selectedLead.email}`}
                      className="p-2 bg-surface-strong hover:bg-border-strong rounded-lg transition-colors"
                      title="Ouvrir email"
                    >
                      <FiMail className="w-4 h-4 text-text-primary" />
                    </a>
                  )}
                  {selectedLead.phone && (
                    <a
                      href={`tel:${selectedLead.phone}`}
                      className="p-2 bg-surface-strong hover:bg-border-strong rounded-lg transition-colors"
                      title="Appeler"
                    >
                      <FiPhone className="w-4 h-4 text-text-primary" />
                    </a>
                  )}
                </div>
              </div>

              {/* Sélection du canal */}
              <div className="flex gap-2">
                {[
                  { id: 'email', label: 'Email', icon: FiMail, color: 'emerald' },
                  { id: 'facebook', label: 'Facebook', icon: FiFacebook, color: 'blue' },
                  { id: 'instagram', label: 'Instagram', icon: FiInstagram, color: 'pink' }
                ].map(channel => {
                  const status = getChannelStatus(selectedLead, channel.id);
                  return (
                    <button
                      key={channel.id}
                      onClick={() => {
                        setActiveChannel(channel.id);
                        // Pré-remplir avec le dernier message si existant
                        if (status?.message) {
                          setMessage(status.message);
                          if (channel.id === 'email' && status.subject) {
                            setEmailSubject(status.subject);
                          }
                        } else {
                          setMessage('');
                          setEmailSubject('');
                        }
                      }}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                        activeChannel === channel.id
                          ? `bg-${channel.color}-600 text-text-primary`
                          : 'bg-surface-strong/50 text-text-secondary hover:bg-border-strong/50'
                      }`}
                    >
                      <channel.icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{channel.label}</span>
                      {status && (
                        <span className={`ml-1 w-2 h-2 rounded-full ${
                          status.status === 'responded' ? 'bg-green-400' :
                          status.status === 'sent' ? 'bg-blue-400' : 'bg-gray-400'
                        }`} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Statut actuel du canal */}
              {getChannelStatus(selectedLead, activeChannel) && (
                <div className={`text-sm p-2 rounded-lg ${getStatusColor(getChannelStatus(selectedLead, activeChannel).status)}`}>
                  {getChannelStatus(selectedLead, activeChannel).status === 'sent' && (
                    <>Envoyé le {new Date(getChannelStatus(selectedLead, activeChannel).sent_at).toLocaleDateString('fr-FR')}</>
                  )}
                  {getChannelStatus(selectedLead, activeChannel).status === 'responded' && (
                    <>A répondu le {new Date(getChannelStatus(selectedLead, activeChannel).responded_at).toLocaleDateString('fr-FR')}</>
                  )}
                  {getChannelStatus(selectedLead, activeChannel).followup_date && (
                    <> • Relance prévue le {new Date(getChannelStatus(selectedLead, activeChannel).followup_date).toLocaleDateString('fr-FR')}</>
                  )}
                </div>
              )}

              {/* Templates */}
              <div>
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <FiZap className="w-4 h-4" />
                  Templates rapides
                  {showTemplates ? <FiChevronUp /> : <FiChevronDown />}
                </button>

                {showTemplates && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {templates[activeChannel]?.map(template => (
                      <button
                        key={template.id}
                        onClick={() => applyTemplate(template)}
                        className="text-left p-3 bg-surface-strong/50 hover:bg-border-strong/50 rounded-lg transition-colors"
                      >
                        <div className="font-medium text-text-primary text-sm">{template.name}</div>
                        <div className="text-xs text-text-muted truncate mt-1">
                          {template.body.substring(0, 50)}...
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Champ objet (email uniquement) */}
              {activeChannel === 'email' && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Objet
                  </label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Objet de l'email..."
                    className="w-full px-4 py-2 bg-surface-muted/50 border border-border-strong rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Zone de texte message */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Message
                  <span className="text-xs text-gray-500 ml-2">
                    Variables: {`{{prénom}}`}, {`{{entreprise}}`}, {`{{email}}`}
                  </span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`Écrivez votre message ${activeChannel === 'email' ? 'email' : activeChannel === 'facebook' ? 'Facebook' : 'Instagram'}...`}
                  rows={8}
                  className="w-full px-4 py-3 bg-surface-muted/50 border border-border-strong rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-500">
                    {message.length} caractères
                  </span>
                  <button
                    onClick={copyMessage}
                    disabled={!message}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    <FiCopy className="w-3 h-3" />
                    Copier
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <button
                  onClick={markAsSent}
                  disabled={!message}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-strong disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
                >
                  <FiSend className="w-4 h-4" />
                  Marquer envoyé
                </button>

                <button
                  onClick={markAsResponded}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  <FiCheck className="w-4 h-4" />
                  A répondu
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowFollowupPicker(!showFollowupPicker)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg font-medium transition-colors"
                  >
                    <FiClock className="w-4 h-4" />
                    Relancer
                  </button>

                  {showFollowupPicker && (
                    <div className="absolute bottom-full left-0 mb-2 bg-surface border border-border-strong rounded-lg p-2 shadow-xl z-10">
                      <div className="text-xs text-text-muted mb-2">Relancer dans :</div>
                      <div className="flex flex-col gap-1">
                        {[1, 2, 3, 5, 7, 14].map(days => (
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
                  onClick={() => {
                    const leadHistory = outreachHistory[selectedLead.id] || {};
                    const newHistory = {
                      ...outreachHistory,
                      [selectedLead.id]: {
                        ...leadHistory,
                        [activeChannel]: {
                          ...leadHistory[activeChannel],
                          status: 'not_interested'
                        }
                      }
                    };
                    saveHistory(newHistory);
                    toast.info('Marqué comme pas intéressé');
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg font-medium transition-colors"
                >
                  <FiX className="w-4 h-4" />
                  Pas intéressé
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

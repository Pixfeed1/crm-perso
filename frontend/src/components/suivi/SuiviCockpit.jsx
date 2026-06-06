// src/components/suivi/SuiviCockpit.jsx
//
// Cockpit "Suivi" (onglet Portefeuille) : 3 cartes focus + filtres + liste des
// contacts (prospects + clients) avec dernier echange, prochaine relance et
// actions rapides. Donnees agregees en UNE requete (getCockpit).
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiBell, FiAlertTriangle, FiActivity, FiPhone, FiMessageSquare,
  FiFileText, FiCalendar, FiMail, FiCheck, FiUser
} from 'react-icons/fi';
import { interactionsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import LogExchangeModal from '../common/LogExchangeModal';
import { RELATION_STATUSES, statusMeta, reachedMeta } from '../../utils/relationStatus';

const TYPE_ICON = { email: FiMail, appel: FiPhone, sms: FiMessageSquare, note: FiFileText, rdv: FiCalendar };

const formatDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};
const relativeDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const now = new Date();
  const days = Math.round((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days > 1 && days < 7) return `il y a ${days} j`;
  return formatDate(s);
};
const followupUrgency = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d < today) return { cls: 'bg-danger-bg text-danger-text', label: 'En retard' };
  if (d.getTime() === today.getTime()) return { cls: 'bg-warning-bg text-warning-text', label: "Aujourd'hui" };
  return { cls: 'bg-neutral-bg text-neutral-text', label: formatDate(dateStr) };
};
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const FILTERS = [
  { key: 'relance_today', label: 'À relancer' },
  { key: 'overdue', label: 'En retard' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'clients', label: 'Clients' },
  { key: 'all', label: 'Tous' }
];

const SuiviCockpit = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState({ stats: { relance_today: 0, overdue: 0, exchanges_7d: 0 }, contacts: [] });
  const [loading, setLoading] = useState(true);
  const [logTarget, setLogTarget] = useState(null); // { contact_type, contact_id, name, phone, type }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await interactionsAPI.getCockpit(filter);
      setData(res || { stats: {}, contacts: [] });
    } catch (error) {
      console.error('Erreur cockpit suivi:', error);
      toast.error('Erreur lors du chargement du suivi');
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => { load(); }, [load]);

  const markDone = async (followupId) => {
    if (!followupId) return;
    try {
      await interactionsAPI.markFollowupDone(followupId, true);
      toast.success('Relance marquée comme faite');
      load();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const openLog = (c, type) => setLogTarget({
    contact_type: c.contact_type, contact_id: c.contact_id, name: c.contact_name,
    phone: c.contact_phone, type, relation_status: c.relation_status
  });

  const goToContact = (c) => navigate(`/portefeuille?tab=${c.contact_type === 'lead' ? 'prospects' : 'clients'}`);

  const stats = data.stats || {};
  const cards = [
    { key: 'relance_today', icon: FiBell, label: 'À relancer aujourd\'hui', value: stats.relance_today || 0, color: 'text-warning-text' },
    { key: 'overdue', icon: FiAlertTriangle, label: 'En retard', value: stats.overdue || 0, color: 'text-danger-text' },
    { key: 'all', icon: FiActivity, label: 'Échanges (7 j)', value: stats.exchanges_7d || 0, color: 'text-accent' }
  ];

  return (
    <div>
      {/* Cartes focus */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {cards.map((c) => {
          const Icon = c.icon;
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`text-left bg-surface border rounded-2xl p-4 transition-all ${active ? 'border-accent' : 'border-border hover:border-border-strong'}`}
            >
              <div className="flex items-center gap-2 text-text-muted text-sm mb-1">
                <Icon className={c.color} size={16} /> {c.label}
              </div>
              <div className="text-2xl font-bold text-text-primary">{c.value}</div>
            </button>
          );
        })}
      </div>

      {/* Filtres principaux */}
      <div className="flex flex-wrap gap-2 mb-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === f.key ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Filtres par statut de relation */}
      <div className="flex flex-wrap gap-2 mb-4">
        {RELATION_STATUSES.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${s.cls} ${
              filter === s.key ? 'ring-2 ring-accent' : 'opacity-80 hover:opacity-100'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <p className="text-text-muted text-sm py-8 text-center">Chargement...</p>
      ) : data.contacts.length === 0 ? (
        <div className="text-center py-12 bg-surface/30 rounded-lg border border-border">
          <FiBell className="w-12 h-12 mx-auto text-text-muted mb-3" />
          <p className="text-text-muted">Aucun contact à suivre pour ce filtre.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {data.contacts.map((c) => {
              const LastIcon = TYPE_ICON[c.last_type] || FiFileText;
              const urg = followupUrgency(c.next_followup);
              return (
                <motion.div
                  key={`${c.contact_type}-${c.contact_id}`}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3 hover:border-border-strong transition-colors"
                >
                  <button onClick={() => goToContact(c)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center text-sm font-semibold flex-shrink-0">
                      {initials(c.contact_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-text-primary truncate">{c.contact_name || 'Contact'}</span>
                        <span className="text-xs text-text-muted">{c.contact_type === 'lead' ? 'Prospect' : 'Client'}</span>
                        {(() => { const sm = statusMeta(c.relation_status); return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sm.cls}`}>{sm.label}</span>; })()}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                        {c.last_date ? (
                          <>
                            <LastIcon size={12} />
                            {(() => { const rm = reachedMeta(c.last_reached); return <span>{rm ? `${rm.verb} ` : ''}{relativeDate(c.last_date)}</span>; })()}
                            {c.last_result && <span className="px-1.5 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{c.last_result}</span>}
                          </>
                        ) : (
                          <span>Aucun échange</span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Prochaine relance */}
                  <div className="hidden sm:block flex-shrink-0 w-28 text-right">
                    {urg && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urg.cls}`}>{urg.label}</span>
                    )}
                  </div>

                  {/* Actions rapides : un jeu clair, sans doublon */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openLog(c, 'appel')} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Enregistrer un appel">
                      <FiPhone size={15} />
                    </button>
                    <button onClick={() => openLog(c, 'sms')} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Enregistrer un SMS">
                      <FiMessageSquare size={15} />
                    </button>
                    <button onClick={() => openLog(c, 'note')} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Ajouter une note">
                      <FiFileText size={15} />
                    </button>
                    {c.followup_id && (
                      <button onClick={() => markDone(c.followup_id)} className="p-2 rounded-lg text-success-text hover:bg-success-bg" title="Marquer la relance comme faite">
                        <FiCheck size={15} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <LogExchangeModal
        isOpen={!!logTarget}
        onClose={() => setLogTarget(null)}
        onSaved={load}
        contactType={logTarget?.contact_type}
        contactId={logTarget?.contact_id}
        contactName={logTarget?.name}
        phone={logTarget?.phone}
        defaultType={logTarget?.type || 'appel'}
        currentStatus={logTarget?.relation_status || 'nouveau'}
      />
    </div>
  );
};

export default SuiviCockpit;

// Contrat de maintenance complet : champs préremplis depuis la fiche client et le contrat,
// modifiables, enregistrés sur le contrat, puis PDF téléchargé.
import React, { useEffect, useState } from 'react';
import { FiDownload, FiSave, FiLoader, FiX } from 'react-icons/fi';
import Modal from '../common/Modal';
import { maintenanceContractsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const champ = 'w-full bg-surface-muted/50 border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';
const Champ = ({ label, children }) => <label className="block"><span className="block text-xs text-text-muted mb-1">{label}</span>{children}</label>;

export async function telecharger(res, defaut) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const m = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
  a.href = url; a.download = m ? m[1] : defaut;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ContratModal = ({ isOpen, onClose, contract }) => {
  const { toast } = useToast();
  const [f, setF] = useState(null);
  const [formule, setFormule] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen || !contract) return;
    setF(null);
    maintenanceContractsAPI.getContrat(contract.id)
      .then((r) => { setF(r.infos); setFormule(r.formule); })
      .catch((e) => { toast.error(e.message || 'Chargement impossible'); onClose(); });
  }, [isOpen, contract, toast, onClose]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const surMesure = formule && formule.type === 'maintenance-sur-mesure';

  const enregistrer = async () => { await maintenanceContractsAPI.saveContrat(contract.id, f); };
  const sauver = async () => {
    setBusy(true);
    try { await enregistrer(); toast.success('Informations du contrat enregistrées'); } catch (e) { toast.error(e.message || 'Enregistrement refusé'); } finally { setBusy(false); }
  };
  const generer = async () => {
    setBusy(true);
    try {
      await enregistrer();
      await telecharger(await maintenanceContractsAPI.downloadContrat(contract.id), 'Contrat_Maintenance.pdf');
      toast.success('Contrat téléchargé');
    } catch (e) { toast.error(e.message || 'Génération du contrat impossible'); } finally { setBusy(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[760px]">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-text-primary">Contrat de maintenance{formule ? `, formule ${formule.label.replace('_', ' ')}` : ''}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong"><FiX size={18} /></button>
        </div>
        <p className="text-xs text-text-muted mb-4">Champs préremplis depuis la fiche client et le contrat. Ce qui reste vide apparaît en pointillés dans le PDF, à compléter à la main. Le prix, la date de début, le jour de prélèvement et l'hébergeur viennent du contrat de maintenance.</p>
        {!f ? <div className="text-center py-10 text-text-muted"><FiLoader className="inline animate-spin" /> Chargement…</div> : (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-text-primary mb-2">Client</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Champ label="Raison sociale"><input value={f.client_raison_sociale || ''} onChange={set('client_raison_sociale')} className={champ} /></Champ>
                <Champ label="Forme juridique et SIRET"><input value={f.client_forme_siret || ''} onChange={set('client_forme_siret')} className={champ} /></Champ>
                <Champ label="Adresse du siège"><input value={f.client_adresse || ''} onChange={set('client_adresse')} className={champ} /></Champ>
                <Champ label="Représentant (nom et qualité)"><input value={f.client_representant || ''} onChange={set('client_representant')} placeholder="Patricia Dalmas, gérante" className={champ} /></Champ>
              </div>
            </div>
            {!surMesure && (
              <div>
                <div className="text-sm font-semibold text-text-primary mb-2">Service maintenu</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Champ label="Nature">
                    <select value={f.service_type || 'le site'} onChange={set('service_type')} className={champ}>
                      <option value="le site">Site</option>
                      <option value="la boutique en ligne">Boutique en ligne</option>
                      <option value="l’application web">Application web</option>
                    </select>
                  </Champ>
                  <Champ label="Technologie"><input value={f.technologie || ''} onChange={set('technologie')} placeholder="PrestaShop 1.7, WordPress, Node.js…" className={champ} /></Champ>
                </div>
              </div>
            )}
            {surMesure && (
              <div>
                <div className="text-sm font-semibold text-text-primary mb-2">Devis accepté</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Champ label="Périmètre (sites, applications, serveurs)"><input value={f.perimetre || ''} onChange={set('perimetre')} className={champ} /></Champ>
                  <Champ label="Référence du devis"><input value={f.devis_reference || ''} onChange={set('devis_reference')} placeholder="D-2026-012 du 20/10/2026" className={champ} /></Champ>
                  <Champ label="Heures de développement incluses"><input value={f.heures_incluses || ''} onChange={set('heures_incluses')} placeholder="4 heures" className={champ} /></Champ>
                  <Champ label="Taux horaire au-delà"><input value={f.taux_horaire_ht || ''} onChange={set('taux_horaire_ht')} placeholder="60 €" className={champ} /></Champ>
                  <Champ label="Délai de prise en charge"><input value={f.delai_prise_en_charge || ''} onChange={set('delai_prise_en_charge')} placeholder="Sous 2 heures ouvrées" className={champ} /></Champ>
                  <Champ label="Plages d'astreinte"><input value={f.plages_astreinte || ''} onChange={set('plages_astreinte')} placeholder="7 j/7, de 8 h à 22 h" className={champ} /></Champ>
                  <Champ label="Durée d'engagement"><input value={f.duree_engagement || ''} onChange={set('duree_engagement')} placeholder="une durée initiale de 12 mois" className={champ} /></Champ>
                  <Champ label="Interlocuteur dédié"><input value={f.interlocuteur || ''} onChange={set('interlocuteur')} className={champ} /></Champ>
                </div>
              </div>
            )}
            <div>
              <div className="text-sm font-semibold text-text-primary mb-2">Vous (repris dans tous les contrats)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Champ label="Votre forme juridique"><input value={f.prestataire_forme || ''} onChange={set('prestataire_forme')} placeholder="Entreprise individuelle" className={champ} /></Champ>
                <Champ label="Mention TVA">
                  <select value={f.mention_tva || ''} onChange={set('mention_tva')} className={champ}>
                    <option value="">TVA en sus au taux en vigueur</option>
                    <option value="TVA non applicable, article 293 B du CGI">TVA non applicable, article 293 B du CGI</option>
                  </select>
                </Champ>
                <Champ label="Date de signature (vide : à remplir à la main)"><input value={f.date_signature || ''} onChange={set('date_signature')} placeholder="27/10/2026" className={champ} /></Champ>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button onClick={sauver} disabled={busy} className="px-3 py-2 rounded-lg bg-surface-strong text-text-primary text-sm hover:bg-border-strong disabled:opacity-50 flex items-center gap-1.5"><FiSave size={14} /> Enregistrer</button>
              <button onClick={generer} disabled={busy} className="px-3 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5">
                {busy ? <FiLoader size={14} className="animate-spin" /> : <FiDownload size={14} />} Télécharger le contrat (PDF)
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ContratModal;

// Diffuseur : préparation de la diffusion des créations 3D (scènes, publications, réglages).
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiImage, FiCalendar, FiSettings, FiPlus, FiLoader } from 'react-icons/fi';
import { diffuseurAPI } from '../services/api';
import { useToast } from '../hooks/useToast';
import SceneView from '../components/diffuseur/SceneView';
import PublicationsView from '../components/diffuseur/PublicationsView';
import ReglagesView from '../components/diffuseur/ReglagesView';
import { champ, boutonPrincipal } from '../components/diffuseur/constants';

const TABS = [
  { key: 'scenes', label: 'Scènes', icon: FiImage },
  { key: 'publications', label: 'Publications', icon: FiCalendar },
  { key: 'reglages', label: 'Réglages', icon: FiSettings }
];

const Scenes = ({ onOpen }) => {
  const { toast } = useToast();
  const [scenes, setScenes] = useState(null);
  const [nom, setNom] = useState('');
  const load = useCallback(() => diffuseurAPI.listScenes().then((s) => setScenes(s || [])).catch((e) => { toast.error(e.message || 'Chargement impossible'); setScenes([]); }), [toast]);
  useEffect(() => { load(); }, [load]);
  const creer = async () => {
    if (!nom.trim()) return;
    try { const d = await diffuseurAPI.createScene({ nom: nom.trim() }); setNom(''); onOpen(d.scene.id); } catch (e) { toast.error(e.message || 'Création refusée'); }
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && creer()} placeholder="Nom de la nouvelle scène" className={champ} />
        <button onClick={creer} disabled={!nom.trim()} className={boutonPrincipal}><FiPlus size={14} /> Créer</button>
      </div>
      {scenes === null ? <div className="text-center py-10 text-text-muted"><FiLoader className="inline animate-spin" /> Chargement…</div>
        : scenes.length === 0 ? <div className="text-center py-10 bg-surface/30 rounded-lg border border-border text-text-muted text-sm">Aucune scène. Créez-en une, puis envoyez ses rendus.</div>
          : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {scenes.map((s) => (
                <button key={s.id} onClick={() => onOpen(s.id)} className="text-left bg-surface border border-border rounded-xl overflow-hidden hover:border-accent transition-colors">
                  {s.vignette_url ? <img src={s.vignette_url} alt="" className="w-full aspect-[2/3] object-cover" loading="lazy" /> : <div className="w-full aspect-[2/3] bg-surface-muted flex items-center justify-center text-text-muted"><FiImage size={28} /></div>}
                  <div className="p-2">
                    <div className="text-sm font-medium text-text-primary truncate">{s.nom}{s.sensible ? ' · sensible' : ''}</div>
                    <div className="text-xs text-text-muted">{s.nb_images} image{s.nb_images > 1 ? 's' : ''} · {s.nb_textes} rédigée{s.nb_textes > 1 ? 's' : ''}</div>
                    <div className="text-xs text-text-muted">{s.nb_a_valider} à valider · {s.nb_valides} validée{s.nb_valides > 1 ? 's' : ''}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
    </div>
  );
};

const Diffuseur = ({ embedded = false }) => {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'scenes';
  const sceneId = parseInt(params.get('scene'), 10) || null;
  const aller = (p) => setParams(Object.fromEntries(Object.entries({ section: params.get('section'), ...p }).filter(([, v]) => v != null)));
  return (
    <div className="h-full flex flex-col">
      <div className={`flex gap-1 px-2 sm:px-4 border-b border-border/50 shrink-0 overflow-x-auto ${embedded ? 'pt-2' : 'lg:pl-72 pt-16 sm:pt-2'}`}>
        {TABS.map((t) => {
          const Icon = t.icon; const actif = tab === t.key;
          return (
            <button key={t.key} onClick={() => aller({ tab: t.key })}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${actif ? 'text-indigo-300' : 'text-text-muted hover:text-text-primary'}`}>
              <Icon size={16} /> {t.label}
              {actif && <motion.div layoutId="diffuseur-tab-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-indigo-500" />}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-4 lg:p-6">
        <div className="max-w-6xl mx-auto w-full">
          {tab === 'scenes' && (sceneId
            ? <SceneView key={sceneId} sceneId={sceneId} onBack={() => aller({ tab: 'scenes' })} onDeleted={() => aller({ tab: 'scenes' })} />
            : <Scenes onOpen={(id) => aller({ tab: 'scenes', scene: id })} />)}
          {tab === 'publications' && <PublicationsView />}
          {tab === 'reglages' && <ReglagesView />}
        </div>
      </div>
    </div>
  );
};

export default Diffuseur;

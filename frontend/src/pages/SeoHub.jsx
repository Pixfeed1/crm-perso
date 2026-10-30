// Hub SEO : une barre de sections en haut (comme Portefeuille) qui regroupe le SEO de jurojin.net et
// pixfeed.net, le Diffuseur (créations 3D) et le Configurateur PC, pour ne pas multiplier les entrées
// du menu principal. Section choisie dans ?section= ; les autres paramètres de chaque section sont gardés.
import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiShare2, FiImage, FiCpu, FiLoader } from 'react-icons/fi';

const Seo = lazy(() => import('./Seo'));
const Diffuseur = lazy(() => import('./Diffuseur'));
const Configurateur = lazy(() => import('./Configurateur'));

const SECTIONS = [
  { key: 'seo', label: 'SEO', icon: FiShare2 },
  { key: 'diffuseur', label: 'Diffuseur', icon: FiImage },
  { key: 'configurateur', label: 'Configurateur PC', icon: FiCpu }
];

const SeoHub = () => {
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.some((s) => s.key === params.get('section')) ? params.get('section') : 'seo';
  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-1 px-2 sm:px-4 lg:pl-72 pt-16 sm:pt-2 border-b border-border/50 shrink-0 overflow-x-auto">
        {SECTIONS.map((s) => {
          const Icon = s.icon; const actif = section === s.key;
          return (
            <button key={s.key} onClick={() => setParams({ section: s.key })}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${actif ? 'text-indigo-300' : 'text-text-muted hover:text-text-primary'}`}>
              <Icon size={16} /> {s.label}
              {actif && <motion.div layoutId="seo-hub-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-indigo-500" />}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<div className="text-center py-16 text-text-muted"><FiLoader className="inline animate-spin" /> Chargement…</div>}>
          {section === 'seo' && <Seo />}
          {section === 'diffuseur' && <Diffuseur embedded />}
          {section === 'configurateur' && <Configurateur embedded />}
        </Suspense>
      </div>
    </div>
  );
};

export default SeoHub;

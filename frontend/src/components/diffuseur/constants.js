// Diffuseur : libellés partagés par les écrans.
export const PLATEFORMES = {
  instagram: { label: 'Instagram', cls: 'bg-info-bg text-info-text' },
  facebook: { label: 'Facebook', cls: 'bg-info-bg text-info-text' },
  pinterest: { label: 'Pinterest', cls: 'bg-danger-bg text-danger-text' },
  x: { label: 'X', cls: 'bg-neutral-bg text-neutral-text' },
  bluesky: { label: 'Bluesky', cls: 'bg-info-bg text-info-text' }
};
export const ORDRE_PLATEFORMES = ['instagram', 'facebook', 'pinterest', 'x', 'bluesky'];

export const STATUTS = {
  a_valider: { label: 'À valider', cls: 'bg-warning-bg text-warning-text' },
  valide: { label: 'Validée', cls: 'bg-success-bg text-success-text' },
  rejete: { label: 'Rejetée', cls: 'bg-neutral-bg text-neutral-text' }
};

export const BLUESKY = {
  depose: { label: 'Déposée pour publication', cls: 'bg-info-bg text-info-text' },
  publie: { label: 'Publiée', cls: 'bg-success-bg text-success-text' },
  erreur: { label: 'Erreur de publication', cls: 'bg-danger-bg text-danger-text' }
};

export const LANGUES = { fr: 'Français', en: 'Anglais', fr_en: 'Français et anglais' };
export const LIENS = { affilie: 'Lien affilié', article: 'Article jurojin.net', aucun: 'Aucun lien' };

export const fmtDate = (s) => {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

export const demain = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const champ = 'w-full bg-surface-muted/50 border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';
export const bouton = 'px-3 py-1.5 rounded-lg bg-surface-strong text-text-primary text-sm hover:bg-border-strong disabled:opacity-50 flex items-center gap-1.5';
export const boutonPrincipal = 'px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5';

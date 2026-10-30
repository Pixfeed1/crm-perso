/* Profils d'usage : ce qui compte pour chaque logiciel, et comment on le mesure.
   Règles éditoriales validées avec la sélection. Les poids w = [carte graphique, processeur, mémoire, stockage].
   Métriques :
     gpu « rendu »        : score Blender Open Data (OptiX, HIP ou oneAPI), carte la plus rapide de chaque marque comprise
     gpu « rendu_nvidia » : idem, mais 0 pour les cartes non Nvidia (moteurs CUDA/OptiX seulement)
     gpu « jeu »          : indice jeu éditorial (à remplacer par une mesure dès qu'une source existe)
     cpu « calcul »       : score Blender Open Data processeur (calcul multicœur)
     cpu « jeu »          : indice jeu éditorial du processeur
   Les plafonds (gcap, ccap) sont exprimés dans l'échelle de la métrique, normalisée à 100 = référence. */

const P = {
  blender:   { n: "Blender", gpu: "rendu", cpu: "calcul", w: [10, 3, 2, 1], cap: 64, vram: 8, ramLourd: 32,
               mesure: { type: "duree", base: "gpu", echantillons: 30000, libelle: "Rendu d'une scène type", source: "Blender Open Data" },
               projets: ["Objets, personnages seuls, premiers rendus", "Scènes complètes, simulations, rendus d'animation"] },
  unreal:    { n: "Unreal / Unity", gpu: "jeu", cpu: "calcul", w: [8, 4, 3, 3], cap: 64, vram: 12, gen5: true, ramLourd: 64,
               projets: ["Prototypes, petits niveaux", "Mondes ouverts, textures 4K, Nanite et Lumen"] },
  zbrush:    { n: "ZBrush", gpu: "jeu", cpu: "calcul", w: [1, 10, 6, 1], cap: 128, gcap: 40, ramLourd: 64,
               projets: ["Sculptures de quelques millions de polygones", "Modèles très denses, nombreux sous-outils"] },
  daz:       { n: "Daz Studio", gpu: "rendu_nvidia", nvidia: true, cpu: "calcul", w: [10, 2, 2, 1], cap: 64, vram: 12, vramLourd: 16, ramLourd: 32,
               mesure: { type: "duree", base: "gpu", echantillons: 45000, libelle: "Rendu Iray d'un personnage dans son décor", source: "dérivée de Blender Open Data (OptiX)" },
               projets: ["Un personnage, décor simple", "Plusieurs personnages, cheveux, décor complet"] },
  keyshot:   { n: "KeyShot", gpu: "rendu_nvidia", cpu: "calcul", w: [4, 8, 3, 1], cap: 64, gcap: 80, ramLourd: 32,
               mesure: { type: "duree", base: "cpu", echantillons: 2000, libelle: "Rendu d'une image produit sur le processeur", source: "dérivée de Blender Open Data (processeur)" },
               projets: ["Produits isolés, visuels fixes", "Scènes complètes, animations de produit"] },
  premiere:  { n: "Premiere Pro", gpu: "jeu", cpu: "calcul", w: [5, 7, 4, 3], cap: 64, gcap: 100, vram: 8, ramLourd: 32,
               projets: ["Montage en 1080p, projets courts", "4K et plus, longs projets, nombreuses pistes"] },
  resolve:   { n: "DaVinci Resolve", gpu: "rendu", cpu: "calcul", w: [9, 4, 3, 3], cap: 64, vram: 12, vramLourd: 16, ramLourd: 32,
               projets: ["Étalonnage en 1080p, peu de nœuds", "4K et plus, réduction de bruit, nombreux nœuds"] },
  ae:        { n: "After Effects", gpu: "jeu", cpu: "calcul", w: [3, 6, 9, 2], cap: 128, gcap: 62, ramLourd: 64,
               projets: ["Animations courtes, peu de calques", "Compositions longues, nombreux calques et effets"] },
  photoshop: { n: "Photoshop", gpu: "jeu", cpu: "calcul", w: [2, 7, 5, 2], cap: 64, gcap: 50, ccap: 80, ramLourd: 32,
               projets: ["Retouches pour le web, fichiers légers", "Grands formats d'impression, nombreux calques"] },
  lightroom: { n: "Lightroom", gpu: "jeu", cpu: "calcul", w: [2, 8, 5, 2], cap: 64, gcap: 50, ccap: 85, ramLourd: 32,
               projets: ["Quelques milliers de photos", "Gros catalogues, fichiers de boîtiers très haute définition"] },
  illustrator:{ n: "Illustrator", gpu: "jeu", cpu: "calcul", w: [2, 6, 3, 1], cap: 32, gcap: 40, ccap: 60, ramLourd: 32,
               projets: ["Logos, visuels pour le web", "Affiches et fichiers d'impression complexes"] },
  figma:     { n: "Figma", gpu: "jeu", cpu: "calcul", w: [1, 4, 2, 1], cap: 32, gcap: 6, ccap: 45, ramLourd: 32,
               projets: ["Quelques maquettes", "Gros fichiers, design systems complets"] },
  courant:   { n: "Usage courant", office: true, gpu: "jeu", cpu: "calcul", w: [0.2, 3, 2, 1], cap: 16, gcap: 6, ccap: 40 }
};
const CREA = ["blender", "unreal", "zbrush", "daz", "keyshot", "premiere", "resolve", "ae", "photoshop", "lightroom", "illustrator", "figma"];
const ECRANS = ["1080", "1440", "2160"];

/** Profil jeu : la définition de l'écran fixe le plafond utile de la carte graphique. */
function jeu(ecran, type) {
  const comp = type === "comp";
  return { n: "Jeu vidéo", game: true, gpu: "jeu", cpu: "jeu", w: comp ? [8, 8, 2, 1.5] : [10, 3, 2, 1.5], cap: 32,
    gcap: { 1080: 62, 1440: 100, 2160: 160 }[ecran], vram: ecran === "1080" ? 8 : 12 };
}
/** Création + jeu : on garde le plus exigeant des deux sur chaque point. */
function mix(a, g) {
  return { ...a, n: a.n, mixed: true, w: a.w.map((x, i) => Math.max(x, g.w[i])), cap: Math.max(a.cap, g.cap),
    gcap: Math.max(a.gcap || 999, g.gcap), vram: Math.max(a.vram || 0, g.vram), cpu: "mix", gpuJeu: true };
}

const TEXTES = {
  blender: { titre: "La carte graphique d'abord, le reste suit", conseils: ["Cycles calcule le rendu sur la carte graphique, et c'est sur les cartes Nvidia, avec OptiX, qu'il va le plus vite. C'est donc là que part la plus grosse part du budget.", "Le processeur sert surtout à la modélisation et à la simulation : un modèle milieu de gamme suffit largement."] },
  unreal: { titre: "De la mémoire vidéo et un SSD qui suit", conseils: ["Les scènes temps réel chargent beaucoup de textures : au moins 12 Go de mémoire vidéo évitent de buter au premier projet ambitieux.", "La compilation des shaders sollicite le processeur et le disque. Un SSD rapide raccourcit nettement ces attentes."] },
  zbrush: { titre: "Processeur et mémoire, carte graphique modeste", conseils: ["ZBrush sculpte ses millions de polygones avec le processeur et la mémoire vive. Une grosse carte graphique n'y change presque rien.", "L'argent économisé sur la carte part dans les cœurs et dans la RAM, pour garder une sculpture fluide sur les modèles lourds."] },
  daz: { titre: "Une carte Nvidia avec assez de mémoire vidéo", conseils: ["Iray, le moteur de rendu de Daz, ne fonctionne sur carte graphique qu'avec Nvidia. Si la scène dépasse la mémoire vidéo, le rendu bascule sur le processeur et devient très lent.", "Avec des personnages Genesis 9, des cheveux et un décor, 16 Go de mémoire vidéo font une vraie différence."] },
  keyshot: { titre: "Un processeur généreux, une carte Nvidia en bonus", conseils: ["KeyShot rend aussi bien sur le processeur que sur une carte Nvidia récente. Un processeur à beaucoup de cœurs garde le rendu rapide quel que soit le mode choisi.", "Les scènes produit restent raisonnables en mémoire : inutile de viser la carte la plus chère."] },
  premiere: { titre: "Un processeur solide et une carte qui décode", conseils: ["Le montage s'appuie surtout sur le processeur, mais une carte graphique récente accélère le décodage des fichiers lourds et l'export.", "Un SSD rapide et assez grand pour vos rushs évite les saccades à la lecture."] },
  resolve: { titre: "La carte graphique fait l'étalonnage", conseils: ["Resolve confie presque tout à la carte graphique : étalonnage, réduction de bruit, effets. La mémoire vidéo limite la résolution et le nombre de nœuds.", "Le processeur et la RAM suivent, sans besoin d'aller au haut de gamme."] },
  ae: { titre: "De la mémoire vive avant tout", conseils: ["After Effects garde ses prévisualisations en mémoire vive : plus il y en a, plus vous pouvez lire de secondes sans attendre.", "Un processeur rapide aide pour la plupart des effets, la carte graphique accélère surtout certains plug-ins."] },
  photoshop: { titre: "Processeur rapide et mémoire confortable", conseils: ["Photoshop tient surtout au processeur et à la mémoire, qui accueille vos calques. Au-delà de 64 Go, le gain devient marginal.", "Une carte graphique d'entrée de gamme suffit pour les filtres accélérés et les fonctions d'IA."] },
  lightroom: { titre: "Le processeur fait défiler votre catalogue", conseils: ["L'import, les aperçus et l'export reposent sur le processeur. Un modèle récent à 8 cœurs ou plus change le quotidien sur les gros catalogues.", "Le masquage par IA profite d'une carte graphique correcte, sans plus."] },
  illustrator: { titre: "Une machine équilibrée suffit", conseils: ["Illustrator reste léger : un processeur récent et 32 Go de mémoire couvrent même les fichiers d'impression complexes.", "Mieux vaut investir l'écart de prix dans un bon écran calibré."] },
  figma: { titre: "Presque n'importe quelle machine récente", conseils: ["Figma tourne dans le navigateur et calcule peu localement. Un processeur moderne et 16 à 32 Go de mémoire suffisent largement.", "Gardez votre budget pour un grand écran : c'est là que vous gagnerez en confort."] },
  courant: { titre: "Simple, silencieux et sans dépense inutile", conseils: ["Pour la bureautique, le web et la vidéo en streaming, un processeur avec graphique intégrée fait tout le travail.", "Au-delà d'un certain budget, plus rien ne change : mieux vaut le garder pour un bon écran ou un portable."] },
  "jeu-comp": { titre: "Des images par seconde avant tout", conseils: ["Dans les jeux compétitifs, chaque image compte et le processeur devient vite la limite. Les modèles avec beaucoup de cache, comme les X3D d'AMD, y excellent.", "La carte graphique n'a pas besoin d'être énorme si vous baissez un peu les réglages pour gagner en fluidité."] },
  "jeu-solo": { titre: "La carte graphique fait les belles images", conseils: ["En grands jeux solo, la carte graphique fait presque tout. La définition de votre écran décide du modèle : ce qui suffit en 1080p s'essouffle en 4K.", "Un processeur milieu de gamme suffit, et 32 Go de mémoire couvrent tous les jeux actuels."] },
  mixte: { titre: "Une machine pour créer et pour jouer", jeu: "Pour le jeu, la carte graphique a été choisie aussi en fonction de votre écran en {ecran}, et le processeur garde de bonnes cadences sans sacrifier le reste." }
};

module.exports = { P, CREA, ECRANS, jeu, mix, TEXTES };

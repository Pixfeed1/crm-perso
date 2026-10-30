/* Configurateur PC (généré depuis la maquette par build-wp.py) */
(()=>{
/* La page ne calcule plus rien : elle lit les paliers préparés par l'agent. */
/* Pas encore de données publiées (premier relevé pas fait, fichier illisible) : on s'arrête sans erreur. */
const SRC=document.getElementById("configurateur-data"), TOOL0=document.querySelector(".cfg-pc");
if(!SRC||!TOOL0)return;
let D;try{D=JSON.parse(SRC.textContent);}catch(e){return;}
const K=D.composants, CFG=D.configs;
const FAM={"3d":["blender","unreal","zbrush","daz","keyshot"],video:["premiere","resolve","ae"],photo:["photoshop","lightroom","illustrator","figma"],game:[],office:[]};
const NOMS={blender:["Blender","BL"],unreal:["Unreal / Unity","UE"],zbrush:["ZBrush","ZB"],daz:["Daz Studio","DS"],keyshot:["KeyShot","KS"],
  premiere:["Premiere Pro","PR"],resolve:["DaVinci Resolve","DR"],ae:["After Effects","AE"],photoshop:["Photoshop","PS"],lightroom:["Lightroom","LR"],illustrator:["Illustrator","AI"],figma:["Figma","FG"]};
const ECRAN={1080:"1080p",1440:"1440p",2160:"4K"};

const $=id=>document.getElementById("cfg-"+id), form=$("form"), range=$("budget"), budIn=$("budgetIn");
const fmt=n=>Math.round(n).toLocaleString("fr-FR")+" €";
const nb=t=>t.replace(/ ([?!:;%])/g," $1");          // typographie française
const dateFr=iso=>new Date(iso+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
range.min=D.budget.min; range.max=D.budget.max; range.step=D.budget.pas;
const showBud=v=>{budIn.value=v;budIn.style.width=(String(v).length+.2)+"ch";};
const setBudget=v=>{v=Math.round((+v||0)/D.budget.pas)*D.budget.pas;v=Math.min(D.budget.max,Math.max(D.budget.min,v));range.value=v;showBud(v);render();};

/* ---------- Questions ---------- */
function fillSofts(){
  const fam=form.fam.value, list=FAM[fam], cur=form.soft?form.soft.value:null;
  $("softs").innerHTML=list.map((id,i)=>`<label class="opt"><input type="radio" name="soft" id="cfg-s-${id}" value="${id}" ${(cur===id||(!list.includes(cur)&&i===0))?"checked":""}><span class="card"><span class="logo" aria-hidden="true">${NOMS[id][1]}</span><span class="c-name">${NOMS[id][0]}</span></span></label>`).join("");
  fillProjets();
  toggleSets();
}
function fillProjets(){
  const s=form.soft&&form.soft.value; if(!s||!D.projets[s]) return;
  const cur=form.projet?form.projet.value:"lourd", [leg,lou]=D.projets[s];
  $("projets").innerHTML=[["leger","Plutôt légers",leg],["lourd","Plutôt lourds",lou]].map(([v,t,sub])=>
    `<label class="opt"><input type="radio" name="projet" id="cfg-p-${v}" value="${v}" ${cur===v?"checked":""}><span class="card"><span class="c-name">${t}</span><span class="c-sub">${sub}</span></span></label>`).join("");
}
function toggleSets(){
  const fam=form.fam.value, creative=fam!=="office"&&fam!=="game", also=$("alsoGame").checked;
  $("softset").hidden=!creative; $("loadset").hidden=!creative;
  $("gameset").hidden=fam!=="game";
  $("screenset").hidden=!(fam==="game"||(creative&&also));
  $("screenleg").textContent=fam==="game"?"Votre écran":"Votre écran de jeu";
}
function cle(){
  const fam=form.fam.value;
  if(fam==="office") return "courant|-|-";
  if(fam==="game") return `jeu|${form.games.value}|${form.screen.value}`;
  return `${form.soft.value}|${form.projet.value}|${$("alsoGame").checked?form.screen.value:"-"}`;
}
function textes(){
  const fam=form.fam.value;
  if(fam==="office") return D.textes.courant;
  if(fam==="game") return D.textes["jeu-"+form.games.value];
  const t=D.textes[form.soft.value];
  if(!$("alsoGame").checked) return t;
  return {titre:D.textes.mixte.titre,conseils:[t.conseils[0],D.textes.mixte.jeu.replace("{ecran}",ECRAN[form.screen.value])]};
}

/* ---------- Fiche ---------- */
const at=(prof,b)=>{let r=null;for(const p of prof.paliers){if(p.budget<=b) r=p; else break;} return r;};
let choix="max", dernier="";                      // machine affichée : la plus rapide, ou l'alternative
const duree=s=>s<60?`${s} s`:`${Math.floor(s/60)} min`+(s%60?` ${String(s%60).padStart(2,"0")} s`:"");
const totalDe=c=>Object.values(c).reduce((t,id)=>t+K[id].prix,0);
function effetCourt(prof,m){ const t=[];
  if(prof.mesure&&m.duree!=null) t.push(duree(m.duree));
  if(prof.mesure_jeu&&m.ips!=null) t.push(`${m.ips} images/s`);
  return t.join(" · "); }
function effetLong(prof,m){ const t=[];
  if(prof.mesure&&m.duree!=null) t.push(`<b>${prof.mesure.libelle}</b> : environ ${duree(m.duree)}.`);
  if(prof.mesure_jeu&&m.ips!=null) t.push(`<b>${prof.mesure_jeu.libelle} en ${ECRAN[prof.mesure_jeu.ecran]}</b> : environ ${m.ips} images par seconde.`);
  const s=prof.mesure||{}, src=s.source==="exemple"?" (Mesures d'exemple.)":s.derivee?` (Estimation ${s.source.replace(/^dérivée/,"tirée")}.)`:s.source?` (Source : ${s.source}.)`:"";
  return t.length?"En pratique. "+t.join(" ")+src:""; }
function details(id){
  const c=K[id], x=c.caracteristiques||{}, l=[];
  if(c.fiche) l.push(c.fiche);
  if(x.vram) l.push(`Mémoire vidéo : ${x.vram} Go`);
  if(x.conso_max) l.push(`Consommation maximale en charge : ${x.conso_max} W`);
  else if(x.tdp) l.push(`Consommation maximale : ${x.tdp} W`);
  if(x.longueur) l.push(`Longueur : ${x.longueur} mm`);
  if(c.categorie==="cpu") l.push(x.ventirad_fourni?"Ventirad fourni dans la boîte":"Vendu sans ventirad : il est compté dans « Le reste de la machine »");
  if(x.memoire&&c.categorie==="ram") l.push(`Type : ${x.memoire}`);
  if(c.mesure&&c.mesure.score) l.push(`Score Blender ${c.mesure.source.version} : ${c.mesure.score.toLocaleString("fr-FR")}, médiane de ${c.mesure.tests.toLocaleString("fr-FR")} tests publiés sur Blender Open Data`);
  if(c.reserves&&c.reserves.length) l.push(`En cas de rupture : ${c.reserves.map(r=>r.modele).join(", ou ")}`);
  if(!l.length) return "";
  return `<details class="more"><summary>Détails</summary><ul>${l.map(t=>`<li>${nb(t)}</li>`).join("")}</ul></details>`;
}
function ligne(id,role,why,key){
  const c=K[id];
  const pick=c.modele?`<b>Modèle retenu : ${c.modele}.</b> ${c.pourquoi}`:c.pourquoi;
  return `<li class="${key?"key":""}"><span class="role">${role}${key?' <span class="tag">Priorité</span>':''}</span><span class="name">${c.puce}</span><span class="price">${c.prix?fmt(c.prix):"Inclus"}</span>${why?`<span class="why">${nb(why)}</span>`:""}<span class="pick">${nb(pick)}</span>${achat(c)}${details(id)}</li>`;
}
/* lien vers l'offre retenue (la moins chère en stock), et les autres marchands sans prix */
function achat(c){
  if(!c.prix||!c.offres.length) return "";
  const dispo=c.offres.filter(o=>o.en_stock), best=dispo.find(o=>o.prix===c.prix)||dispo[0], autres=dispo.filter(o=>o!==best);
  return `<span class="shops"><a class="buy" href="${best.lien}" rel="sponsored nofollow">Voir chez ${best.nom}</a>${autres.length?` <span class="also-at">aussi chez ${autres.map(o=>`<a href="${o.lien}" rel="sponsored nofollow">${o.nom}</a>`).join(", ")}</span>`:""}</span>`;
}
function render(){
  const fam=form.fam.value, bud=+range.value, prof=D.profils[cle()], tx=textes(), game=fam==="game";
  if(document.activeElement!==budIn) showBud(bud);
  const min=D.budget.min,max=D.budget.max,pk=prof.priorite;

  // repères : les deux qui entourent le budget d'abord, puis les autres s'ils ont la place
  const mw=$("marks").clientWidth||600, gap=Math.max(9,74/mw*100), P2=b=>(b-min)/(max-min)*100, keep=[];
  const rp=prof.reperes, passed=rp.filter(m=>m.budget<=bud).pop(), next=rp.find(m=>m.budget>bud);
  const fits=m=>!keep.some(k=>Math.abs(P2(k.budget)-P2(m.budget))<gap);
  [passed,next,...rp].forEach(m=>{if(m&&!keep.includes(m)&&fits(m)) keep.push(m);});
  keep.sort((a,b)=>a.budget-b.budget);
  $("marks").innerHTML=keep.map(m=>{const pos=P2(m.budget),edge=pos<6?" start":pos>94?" end":"";
    return `<button type="button" class="mark${edge}${bud>=m.budget?" reached":""}" style="left:${pos}%" data-v="${m.budget}" tabindex="-1">${m.libelle}</button>`;}).join("");
  $("markcap").textContent=rp.length?{gpu:"Paliers de carte graphique",cpu:"Paliers de processeur",ram:"Paliers de mémoire"}[pk]:"";
  $("presets").innerHTML=prof.budgets_conseilles.map(p=>`<button type="button" class="chip" data-v="${p.budget}" aria-pressed="${p.budget===bud}">${p.libelle} <small>${fmt(p.budget)}</small></button>`).join("");

  $("headline").textContent=tx.titre;
  $("advice").innerHTML=tx.conseils.map(t=>"<p>"+nb(t)+"</p>").join("");
  $("for").textContent=fam==="office"?"Usage courant":game?`Jeu vidéo · ${ECRAN[form.screen.value]} · ${form.games.value==="comp"?"compétitif":"grands jeux solo"}`
    :`${NOMS[form.soft.value][0]} · projets ${form.projet.value==="lourd"?"lourds":"légers"}${$("alsoGame").checked?" · jeu en "+ECRAN[form.screen.value]:""}`;

  const p=at(prof,bud);
  if(!p){
    $("parts").innerHTML=""; $("total").textContent="";
    $("left").textContent=nb(`Pour cet usage, la première machine qui tient la route démarre à ${fmt(prof.paliers[0].budget)}.`);
    $("upsell").innerHTML=nb(`<b>${fmt(prof.paliers[0].budget-bud)} de plus</b> suffiraient pour une machine adaptée.`); $("upsell").hidden=false;
    return;
  }
  const id=cle()+"@"+p.budget; if(id!==dernier){choix="max";dernier=id;}
  const alt=p.alternative, useAlt=choix==="alt"&&alt;
  const c=CFG[useAlt?alt.config:p.config], mes=useAlt?alt.mesures:p.mesures;
  if(alt){
    const mot=game?"fluide":"rapide", rien=alt.ecart_pct<=1, A=CFG[p.config], B=CFG[alt.config];
    // ce que la machine de votre budget a en plus, dit en clair
    const plus=[]; for(const k of ["gpu","cpu","ram","ssd"]) if(A[k]!==B[k]&&K[A[k]].prix>K[B[k]].prix) plus.push(k==="ssd"?`SSD ${K[A[k]].court}`:k==="ram"?`${K[A[k]].court} de mémoire`:K[A[k]].court);
    const m1=rien?(plus.length?"En plus : "+plus.join(", "):effetCourt(prof,p.mesures)):effetCourt(prof,p.mesures);
    const m2=(rien?"Même vitesse":`${alt.ecart_pct} % plus lente`)+`, ${fmt(totalDe(A)-totalDe(B))} de moins`;
    const b1=`<button type="button" class="opt-btn" role="radio" data-c="max" aria-checked="${!useAlt}"><span class="t">${rien?"Votre budget":"La plus "+mot}</span><span class="p">${fmt(totalDe(A))}</span><span class="m">${nb(m1)}</span></button>`;
    const b2=`<button type="button" class="opt-btn" role="radio" data-c="alt" aria-checked="${!!useAlt}"><span class="t">${rien?(game?"Aussi fluide":"Aussi rapide"):"Presque aussi "+mot}</span><span class="p">${fmt(totalDe(B))}</span><span class="m">${nb(m2)}</span></button>`;
    $("choix").innerHTML=b1+b2; $("choix").hidden=false;
  } else $("choix").hidden=true;
  $("effet").innerHTML=nb(effetLong(prof,mes));

  // phrase vers le palier suivant. Un chiffre n'est donné que s'il vient d'une mesure sourcée (durée Blender Open Data) :
  // les écarts calculés sur les indices internes (jeu, montage, photo) servent au choix des machines, jamais à l'affichage.
  const s=p.suivant;
  if(s&&s.budget-bud<=600&&!useAlt){
    const ps=at(prof,s.budget), n=CFG[ps.config], ch=[];
    // seulement les montées en gamme : le palier suivant peut aussi descendre d'un cran sur une pièce pour financer l'autre
    if(n.gpu!==c.gpu&&(s.gains.gpu||0)>0) ch.push(`à la ${K[n.gpu].court}`);
    if(n.cpu!==c.cpu&&(s.gains.cpu||0)>0) ch.push(`au ${K[n.cpu].court}`);
    if(K[n.ram].caracteristiques.go>K[c.ram].caracteristiques.go) ch.push(`à ${K[n.ram].court} de mémoire`);
    if(!ch.length) ch.push(`à un ${K[n.ssd].puce}`);
    const a1=(p.mesures||{}).duree, a2=(ps.mesures||{}).duree;
    const chiffre=prof.mesure&&a1&&a2&&a2<=a1*0.95?` (${prof.mesure.libelle.toLowerCase()} : environ ${duree(a2)} au lieu de ${duree(a1)})`:"";
    $("upsell").innerHTML=nb(`<b>${fmt(s.budget-bud)} de plus</b> suffiraient pour passer ${ch.join(", et ")}${chiffre}.`); $("upsell").hidden=false;
  } else $("upsell").hidden=true;

  const R={
    gpu:game?"C'est elle qui fixe les images par seconde à cette définition.":pk==="gpu"?"C'est elle qui fait le gros du travail ici.":K[c.gpu].prix?"Suffisante pour ce logiciel, sans plus.":"",
    cpu:game&&pk==="cpu"?"Il tient les hautes cadences des jeux compétitifs.":game?"Assez rapide pour ne jamais brider la carte graphique.":pk==="cpu"?"Le cœur de la machine pour ce logiciel.":"Assez de cœurs pour ne jamais freiner le reste.",
    ram:pk==="ram"?"Plus de mémoire, c'est plus de travail en direct.":"Marge pour les gros fichiers et le multitâche.",
    ssd:"Système, projets et cache."
  };
  const sub=["cm","ventirad","alim","boitier"].map(k=>{const x=K[c[k]];return `<li><span class="name">${x.puce}</span><span class="price">${x.prix?fmt(x.prix):"Fourni"}</span><span class="pick">${nb(`<b>${x.modele}.</b> ${x.pourquoi}`)}</span>${achat(x)}</li>`;}).join("");
  $("parts").innerHTML=ligne(c.gpu,"Carte graphique",R.gpu,pk==="gpu")+ligne(c.cpu,"Processeur",R.cpu,pk==="cpu")+ligne(c.ram,"Mémoire vive",R.ram,pk==="ram")+ligne(c.ssd,"Stockage",R.ssd,false)
    +`<li class="group"><span class="role">Le reste de la machine</span><span class="why">Choisi pour aller avec le reste : support du processeur, refroidissement, puissance électrique et place pour la carte graphique.</span><ul class="sub">${sub}</ul></li>`;
  const total=Object.values(c).reduce((t,id)=>t+K[id].prix,0), rest=bud-total;
  $("total").textContent=fmt(total);
  const sy=D.systeme, libre=fam!=="game"&&!$("alsoGame").checked&&sy.gratuit_suffit.includes(fam==="office"?"courant":form.soft.value);
  $("os").textContent=nb(`Système non compris : comptez ${fmt(sy.prix)} pour une licence ${sy.nom}.`+(libre?" Pour cet usage, un système gratuit comme Linux suffit aussi.":""));
  const usage=fam==="game"?"ces jeux sur cet écran":fam==="office"?"cet usage":NOMS[form.soft.value][0]+($("alsoGame").checked?" et le jeu en "+ECRAN[form.screen.value]:"");
  const sat=prof.plafond;
  $("left").textContent=nb(
    (sat&&bud>=sat)?`Vous êtes au plafond utile pour ${usage} : au-delà de ${fmt(sat)}, plus rien ne change.`+(rest>150?` Gardez les ${fmt(rest)} restants pour un écran ou des accessoires.`:"")
    :sat?`Le plafond utile pour ${usage} est à ${fmt(sat)} : au-delà, plus rien ne change.`+(rest>150?` Il reste ${fmt(rest)} sur votre budget.`:"")
    :rest>150?`Il reste ${fmt(rest)} sur votre budget.`:"");
}
$("date").textContent=`Prix constatés le ${dateFr(D.prix_constates_le)}`+(D.selection.validee_le?"":" (exemple)");
$("choix").addEventListener("click",e=>{const b=e.target.closest(".opt-btn");if(b){choix=b.dataset.c;render();}});
$("presets").addEventListener("click",e=>{const b=e.target.closest(".chip");if(b) setBudget(b.dataset.v);});
$("marks").addEventListener("click",e=>{const m=e.target.closest(".mark");if(m) setBudget(m.dataset.v);});
budIn.addEventListener("change",()=>setBudget(budIn.value));
budIn.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();setBudget(budIn.value);}});
range.addEventListener("input",render);
form.addEventListener("change",e=>{
  if(e.target.name==="fam") fillSofts();
  else if(e.target.name==="soft") fillProjets();
  if(e.target.name==="fam"||e.target.id==="alsoGame"){toggleSets();setSteps();}
  render();
});
addEventListener("resize",()=>{clearTimeout(window._rz);window._rz=setTimeout(render,150);});

/* ---------- Parcours mobile ---------- */
let steps=[],step=0; const tool=$("tool"),next=$("next"),prevB=$("prev");
const NAMES={fam:"Activité",soft:"Logiciel",load:"Projets",screen:"Écran",games:"Jeux",budget:"Budget"};
function setSteps(){const f=form.fam.value;
  steps=f==="office"?["fam","budget"]:f==="game"?["fam","screen","games","budget"]:["fam","soft","load",...($("alsoGame").checked?["screen"]:[]),"budget"];
  if(step>=steps.length)step=steps.length-1;show();}
function show(){
  form.querySelectorAll("fieldset").forEach(f=>f.classList.toggle("on",f.dataset.step===steps[step]));
  $("progress").textContent="Question "+(step+1)+" sur "+steps.length;
  $("plabel").textContent=NAMES[steps[step]];
  $("barfill").style.width=((step+1)/steps.length*100)+"%";
  prevB.style.visibility=step?"visible":"hidden";
  next.textContent=step===steps.length-1?"Voir ma configuration":"Suivant";
  if(steps[step]==="budget") render();
}
next.onclick=()=>{if(step<steps.length-1){step++;show();}else{tool.classList.add("done");tool.scrollIntoView({behavior:"smooth",block:"start"});}};
prevB.onclick=()=>{if(step>0){step--;show();}};
$("restart").onclick=()=>{tool.classList.remove("done");step=0;show();};

fillSofts(); setSteps(); render();
})();

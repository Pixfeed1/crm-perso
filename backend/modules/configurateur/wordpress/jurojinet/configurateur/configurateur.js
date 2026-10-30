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
/* Logos officiels monochromes (tracés Simple Icons), seulement pour les marques qui autorisent l'usage de leur logo pour
   désigner leur logiciel. Les autres (Adobe, Maxon, Daz, Luxion) gardent un monogramme : pas de faux logo. */
const LOGOS={"blender":"M12.51 13.214c.046-.8.438-1.506 1.03-2.006a3.424 3.424 0 0 1 2.212-.79c.85 0 1.631.3 2.211.79.592.5.983 1.206 1.028 2.005.045.823-.285 1.586-.865 2.153a3.389 3.389 0 0 1-2.374.938 3.393 3.393 0 0 1-2.376-.938c-.58-.567-.91-1.33-.865-2.152M7.35 14.831c.006.314.106.922.256 1.398a7.372 7.372 0 0 0 1.593 2.757 8.227 8.227 0 0 0 2.787 2.001 8.947 8.947 0 0 0 3.66.76 8.964 8.964 0 0 0 3.657-.772 8.285 8.285 0 0 0 2.785-2.01 7.428 7.428 0 0 0 1.592-2.762 6.964 6.964 0 0 0 .25-3.074 7.123 7.123 0 0 0-1.016-2.779 7.764 7.764 0 0 0-1.852-2.043h.002L13.566 2.55l-.02-.015c-.492-.378-1.319-.376-1.86.002-.547.382-.609 1.015-.123 1.415l-.001.001 3.126 2.543-9.53.01h-.013c-.788.001-1.545.518-1.695 1.172-.154.665.38 1.217 1.2 1.22V8.9l4.83-.01-8.62 6.617-.034.025c-.813.622-1.075 1.658-.563 2.313.52.667 1.625.668 2.447.004L7.414 14s-.069.52-.063.831zm12.09 1.741c-.97.988-2.326 1.548-3.795 1.55-1.47.004-2.827-.552-3.797-1.538a4.51 4.51 0 0 1-1.036-1.622 4.282 4.282 0 0 1 .282-3.519 4.702 4.702 0 0 1 1.153-1.371c.942-.768 2.141-1.183 3.396-1.185 1.256-.002 2.455.41 3.398 1.175.48.391.87.854 1.152 1.367a4.28 4.28 0 0 1 .522 1.706 4.236 4.236 0 0 1-.239 1.811 4.54 4.54 0 0 1-1.035 1.626","unrealengine":"M12 0a12 12 0 1012 12A12 12 0 0012 0zm0 23.52A11.52 11.52 0 1123.52 12 11.52 11.52 0 0112 23.52zm7.13-9.791c-.206.997-1.126 3.557-4.06 4.942l-1.179-1.325-1.988 2a7.338 7.338 0 01-5.804-2.978 2.859 2.859 0 00.65.123c.326.006.678-.114.678-.66v-5.394a.89.89 0 00-1.116-.89c-.92.212-1.656 2.509-1.656 2.509a7.304 7.304 0 012.528-5.597 7.408 7.408 0 013.73-1.721c-1.006.573-1.57 1.507-1.57 2.29 0 1.262.76 1.109.984.923v7.28a1.157 1.157 0 00.148.256 1.075 1.075 0 00.88.445c.76 0 1.747-.868 1.747-.868V9.172c0-.6-.452-1.324-.905-1.572 0 0 .838-.149 1.484.346a5.537 5.537 0 01.387-.425c1.508-1.48 2.929-1.902 4.112-2.112 0 0-2.151 1.69-2.151 3.96 0 1.687.043 5.801.043 5.801.799.771 1.986-.342 3.059-1.441Z","unity":"m12.9288 4.2939 3.7997 2.1929c.1366.077.1415.2905 0 .3675l-4.515 2.6076a.4192.4192 0 0 1-.4246 0L7.274 6.8543c-.139-.0745-.1415-.293 0-.3675l3.7972-2.193V0L1.3758 5.5977V16.793l3.7177-2.1456v-4.3858c-.0025-.1565.1813-.2682.318-.1838l4.5148 2.6076a.4252.4252 0 0 1 .2136.3676v5.2127c.0025.1565-.1813.2682-.3179.1838l-3.7996-2.1929-3.7178 2.1457L12 24l9.6954-5.5977-3.7178-2.1457-3.7996 2.1929c-.1341.082-.3229-.0248-.3179-.1838V13.053c0-.1565.087-.2956.2136-.3676l4.5149-2.6076c.134-.082.3228.0224.3179.1838v4.3858l3.7177 2.1456V5.5977L12.9288 0Z","davinciresolve":"M17.621 0 5.977.004c-1.37 0-2.756.345-3.762 1.11a4.925 4.925 0 0 0-1.61 2.003C.233 3.93 0 5.02 0 5.951l.012 12.2c.002 1.604.479 3.057 1.461 4.112.984 1.056 2.462 1.683 4.331 1.691L16.856 24c1.26.005 3.095-.036 4.303-.714 1.075-.605 2.025-1.556 2.497-2.984.278-.84.345-2.084.344-3.147l-.021-11.13c-.002-.888-.15-2.023-.547-2.934-.425-.976-1.181-1.815-2.322-2.425C20.353.26 19.123 0 17.622 0zm0 .93c1.378 0 2.538.295 3.04.565.977.523 1.544 1.166 1.889 1.96.315.721.47 1.793.473 2.572l.018 11.13c.002 1.013-.097 2.257-.298 2.86-.396 1.202-1.146 1.946-2.063 2.462-.814.457-2.612.593-3.82.588l-11.05-.044c-1.657-.007-2.832-.534-3.626-1.386-.792-.851-1.212-2.06-1.212-3.485L.999 5.95c0-.829.196-1.827.474-2.437.345-.757.75-1.207 1.365-1.674C3.585 1.27 4.868.97 6.08.97zm-5.66 3.423c-1.976.089-3.204 1.658-3.214 3.29.019 1.443 1.635 3.481 2.884 4.53.12.099.154.109.33.18.062.025.198-.047.327-.135.36-.245.993-.947 1.648-1.738a7.67 7.67 0 0 0 1.031-1.683c.409-.89.261-1.599.235-1.888a3.983 3.983 0 0 0-.99-1.692 3.36 3.36 0 0 0-2.251-.864zm4.172 7.922a10.185 10.185 0 0 0-3.244.61c-.15.058-.26.1-.374.17-.057.036-.11.135-.105.292.017.433.29 1.278.624 2.27.384 1.135 1.066 2.27 1.844 2.74a3.23 3.23 0 0 0 2.53.342c.832-.243 1.595-.868 1.962-1.546.986-1.818.19-3.548-1.121-4.417-.447-.296-1.133-.445-1.89-.46-.074 0-.15-.002-.226-.001zm-8.432.038a6.201 6.201 0 0 0-.752.047c-.596.078-.932.273-1.29.51a3.177 3.177 0 0 0-1.365 1.979c-.075.552-.086 1.053.033 1.507.433 1.389 1.326 2.222 2.847 2.452.636.028 1.37-.063 1.99-.45 1.269-.782 2.08-3.17 2.412-4.742.053-.176.035-.357-.013-.42-.005-.067-.044-.113-.19-.183-.398-.192-1.32-.417-2.375-.6a7.68 7.68 0 0 0-1.297-.1z","figma":"M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z"};
const LOGO_DE={blender:["blender"],unreal:["unrealengine","unity"],resolve:["davinciresolve"],figma:["figma"]};
/* Fiches logiciel du site (adresse), écrites par le serveur à côté des données ; facultatives. */
let LOG={};try{const x=document.getElementById("configurateur-logiciels");if(x)LOG=JSON.parse(x.textContent)||{};}catch(e){LOG={};}
const sur=u=>typeof u==="string"&&/^(https:\/\/|\/(?!\/))[^\s"'<>`\\]*$/.test(u);
const fichesDe=id=>(LOG[id]||[]).filter(l=>l&&sur(l.url));
const logo=id=>LOGO_DE[id]?`<span class="logo svg" aria-hidden="true">${LOGO_DE[id].map(k=>`<svg viewBox="0 0 24 24" width="24" height="24" focusable="false"><path fill="currentColor" d="${LOGOS[k]}"/></svg>`).join("")}</span>`
  :`<span class="logo" aria-hidden="true">${NOMS[id][1]}</span>`;

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
  $("softs").innerHTML=list.map((id,i)=>`<label class="opt"><input type="radio" name="soft" id="cfg-s-${id}" value="${id}" ${(cur===id||(!list.includes(cur)&&i===0))?"checked":""}><span class="card">${logo(id)}<span class="c-name">${NOMS[id][0]}</span></span></label>`).join("");
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
  $("screenleg").textContent=fam==="game"?"Sur quel écran jouez-vous\u202F?":"Et pour jouer, quel écran\u202F?";
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
const calme=matchMedia("(prefers-reduced-motion: reduce)").matches;
let affiche=null, anim=0;
/* le total défile jusqu'à son montant (pas d'animation si le visiteur les a désactivées) */
function compte(v){
  const el=$("total");
  if(calme||affiche===null){affiche=v;el.textContent=fmt(v);return;}
  const de=affiche,t0=performance.now();cancelAnimationFrame(anim);affiche=v;
  const pas=t=>{const k=Math.min(1,(t-t0)/650);el.textContent=fmt(de+(v-de)*(1-Math.pow(1-k,3)));if(k<1)anim=requestAnimationFrame(pas);};
  anim=requestAnimationFrame(pas);
}
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
const ABR={gpu:"GPU",cpu:"CPU",ram:"RAM",ssd:"SSD",cm:"CM",ventirad:"FAN",alim:"ALIM",boitier:"BOÎT."};
/* vignette : la photo de l'offre affichée (flux du marchand), sinon une case neutre ; taille fixe, rien ne bouge au chargement */
function vignette(c,petite){
  const o=(c.offres||[]).find(x=>x.prix===c.prix&&x.image)||(c.offres||[]).find(x=>x.image), t=petite?44:64;
  return o?`<img class="thumb" src="${o.image}" alt="" width="${t}" height="${t}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    :`<span class="thumb vide" aria-hidden="true">${ABR[c.categorie]||""}</span>`;
}
function ligne(id,role,why,key,petite){
  const c=K[id];
  const pick=c.modele?`<b>${c.modele}.</b> ${c.pourquoi}`:c.pourquoi;
  return `<li class="${key?"key":""}${petite?" small":""}">${vignette(c,petite)}<span class="role">${role}${key?' <span class="tag">Priorité</span>':''}</span><span class="name">${c.puce}</span><span class="price">${c.prix?fmt(c.prix):c.categorie==="ventirad"?"Fourni":"Inclus"}</span>${why?`<span class="why">${nb(why)}</span>`:""}<span class="pick">${nb(pick)}</span>${achat(c)}${details(id)}</li>`;
}
/* lien vers l'offre retenue (la moins chère en stock), et les autres marchands sans prix */
function achat(c){
  if(!c.prix||!c.offres.length) return "";
  const dispo=c.offres.filter(o=>o.en_stock), best=dispo.find(o=>o.prix===c.prix)||dispo[0], autres=dispo.filter(o=>o!==best);
  const lien=(o,cl,t)=>`<a class="${cl}" href="${o.lien}" target="_blank" rel="sponsored nofollow noopener">${t}</a>`;
  return `<span class="shops">${lien(best,"buy",`Voir chez ${best.nom}<span aria-hidden="true"> →</span>`)}${autres.length?` <span class="also-at">aussi chez ${autres.map(o=>lien(o,"",o.nom)).join(", ")}</span>`:""}</span>`;
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
  const fiches=fam==="office"||fam==="game"?[]:fichesDe(form.soft.value);
  $("advice").innerHTML=tx.conseils.map(t=>"<p>"+nb(t)+"</p>").join("")
    +(fiches.length?`<p class="fiche">${fiches.map(l=>`<a href="${l.url}">Notre fiche ${l.nom} →</a>`).join("")}</p>`:"");
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
  // Marche suivante, à 600 € au plus. Quand une pièce prime pour l'usage (carte graphique pour Blender, par exemple),
  // on ne propose que la marche qui améliore cette pièce : payer plus pour une autre n'accélérerait presque rien.
  const monte=(n,k)=>n[k]!==c[k]&&K[n[k]].prix>K[c[k]].prix, plusRam=n=>K[n.ram].caracteristiques.go>K[c.ram].caracteristiques.go;
  const ps=useAlt?null:prof.paliers.find(q=>q.budget>bud&&q.budget-bud<=600&&(pk==="ram"?plusRam(CFG[q.config]):pk?monte(CFG[q.config],pk):true));
  if(ps){
    const s=ps, n=CFG[ps.config], ch=[];
    // seulement les montées en gamme : une marche peut aussi descendre d'un cran sur une pièce pour financer l'autre
    if(monte(n,"gpu")) ch.push(`à la ${K[n.gpu].court}`);
    if(monte(n,"cpu")) ch.push(`au ${K[n.cpu].court}`);
    if(plusRam(n)) ch.push(`à ${K[n.ram].court} de mémoire`);
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
  const ROLE={cm:"Carte mère",ventirad:"Refroidissement",alim:"Alimentation",boitier:"Boîtier"};
  $("parts").innerHTML=ligne(c.gpu,"Carte graphique",R.gpu,pk==="gpu")+ligne(c.cpu,"Processeur",R.cpu,pk==="cpu")+ligne(c.ram,"Mémoire vive",R.ram,pk==="ram")+ligne(c.ssd,"Stockage",R.ssd,false)
    +`<li class="sep"><span class="sep-t">Le reste de la machine</span><span class="sep-s">${nb("Choisi pour aller avec le reste : support du processeur, refroidissement, puissance électrique et place pour la carte graphique.")}</span></li>`
    +["cm","ventirad","alim","boitier"].map(k=>ligne(c[k],ROLE[k],"",false,true)).join("");
  [...$("parts").children].forEach((li,i)=>li.style.setProperty("--i",i));
  if(tool.classList.contains("done")) recap();
  const total=Object.values(c).reduce((t,id)=>t+K[id].prix,0), rest=bud-total;
  compte(total);
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

/* ---------- Parcours : une question à la fois, puis le résultat ---------- */
const NAMES={fam:"Activité",soft:"Logiciel",load:"Projets",screen:"Écran",games:"Jeux",budget:"Budget"};
const FAMN={"3d":"3D",video:"Vidéo et motion",photo:"Photo et design",game:"Jeu vidéo",office:"Usage courant"};
const AUTO=["fam","soft","screen","games"];       // un clic suffit : on passe à la question suivante
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
const enVue=()=>{const r=tool.getBoundingClientRect();if(r.top<0||r.top>innerHeight*.6)tool.scrollIntoView({behavior:calme?"auto":"smooth",block:"start"});};
function avancer(){if(step<steps.length-1){step++;show();enVue();}else reveler();}
function reveler(){
  tool.classList.add("done"); affiche=0; render();
  const sh=$("sheet"); sh.classList.remove("reveal");
  if(!calme){void sh.offsetWidth;sh.classList.add("reveal");setTimeout(()=>sh.classList.remove("reveal"),1800);}
  tool.scrollIntoView({behavior:calme?"auto":"smooth",block:"start"});
}
const crayon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
function recap(){
  const v={fam:()=>FAMN[form.fam.value],soft:()=>NOMS[form.soft.value][0],
    load:()=>"projets "+(form.projet.value==="lourd"?"lourds":"légers")+($("alsoGame").checked?", jeu aussi":""),
    screen:()=>"écran "+ECRAN[form.screen.value],games:()=>form.games.value==="comp"?"compétitif":"grands jeux solo"};
  $("recap").innerHTML='<span class="rc-l">Vos réponses</span>'+steps.map((k,i)=>v[k]?`<button type="button" class="rc" data-i="${i}" aria-label="Modifier : ${v[k]()}">${v[k]()}${crayon}</button>`:"").join("");
}
let steps=[],step=0; const tool=$("tool"),next=$("next"),prevB=$("prev");
next.onclick=avancer;
prevB.onclick=()=>{if(step>0){step--;show();}};
$("restart").onclick=()=>{tool.classList.remove("done");step=0;show();enVue();};
$("recap").addEventListener("click",e=>{const b=e.target.closest(".rc");if(b){tool.classList.remove("done");step=+b.dataset.i;show();enVue();}});
// un clic (souris ou doigt) sur une carte fait avancer ; au clavier, les flèches changent le choix sans avancer
form.addEventListener("pointerup",e=>{if(!e.target.closest(".opt")||tool.classList.contains("done")||!AUTO.includes(steps[step]))return;
  const at=step;setTimeout(()=>{if(step===at&&!tool.classList.contains("done"))avancer();},calme?0:260);});

fillSofts(); setSteps(); render();
})();

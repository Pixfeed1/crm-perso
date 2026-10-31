/* Configurateur PC (généré depuis la maquette par build-wp.py) */
(()=>{
/* La page ne calcule plus rien : elle lit les paliers préparés par l'agent. */
/* Pas encore de données publiées (premier relevé pas fait, fichier illisible) : on s'arrête sans erreur. */
const SRC=document.getElementById("configurateur-data"), TOOL0=document.querySelector(".cfg-pc");
if(!SRC||!TOOL0)return;
let D;try{D=JSON.parse(SRC.textContent);}catch(e){return;}
const K=D.composants, CFG=D.configs;
const FAM={"3d":["blender","maya","cinema4d","3dsmax","houdini","zbrush","substance","unreal","daz","keyshot"],video:["premiere","resolve","ae"],photo:["photoshop","lightroom","illustrator","clipstudio","figma"],cao:["sketchup","rhino","fusion","autocad"],game:[],office:[]};
const NOMS={blender:["Blender","BL"],maya:["Maya","MA"],cinema4d:["Cinema 4D","C4D"],"3dsmax":["3ds Max","3DS"],houdini:["Houdini","HO"],substance:["Substance Painter","SP"],clipstudio:["Clip Studio Paint","CSP"],sketchup:["SketchUp","SU"],rhino:["Rhino","RH"],fusion:["Fusion 360","F360"],autocad:["AutoCAD","CAD"],unreal:["Unreal / Unity","UE"],zbrush:["ZBrush","ZB"],daz:["Daz Studio","DS"],keyshot:["KeyShot","KS"],
  premiere:["Premiere Pro","PR"],resolve:["DaVinci Resolve","DR"],ae:["After Effects","AE"],photoshop:["Photoshop","PS"],lightroom:["Lightroom","LR"],illustrator:["Illustrator","AI"],figma:["Figma","FG"]};
const ECRAN={1080:"1080p",1440:"1440p",2160:"4K"};
/* Logos officiels (tracés Simple Icons, en couleur de la marque) pour Blender, Cinema 4D, Houdini, SketchUp, Rhino, Unreal, Unity, DaVinci Resolve et Figma.
   Les autres logiciels prennent le logo de leur fiche sur le site, ou leurs initiales : pas de faux logo. */
const LOGOS={"blender":"M12.51 13.214c.046-.8.438-1.506 1.03-2.006a3.424 3.424 0 0 1 2.212-.79c.85 0 1.631.3 2.211.79.592.5.983 1.206 1.028 2.005.045.823-.285 1.586-.865 2.153a3.389 3.389 0 0 1-2.374.938 3.393 3.393 0 0 1-2.376-.938c-.58-.567-.91-1.33-.865-2.152M7.35 14.831c.006.314.106.922.256 1.398a7.372 7.372 0 0 0 1.593 2.757 8.227 8.227 0 0 0 2.787 2.001 8.947 8.947 0 0 0 3.66.76 8.964 8.964 0 0 0 3.657-.772 8.285 8.285 0 0 0 2.785-2.01 7.428 7.428 0 0 0 1.592-2.762 6.964 6.964 0 0 0 .25-3.074 7.123 7.123 0 0 0-1.016-2.779 7.764 7.764 0 0 0-1.852-2.043h.002L13.566 2.55l-.02-.015c-.492-.378-1.319-.376-1.86.002-.547.382-.609 1.015-.123 1.415l-.001.001 3.126 2.543-9.53.01h-.013c-.788.001-1.545.518-1.695 1.172-.154.665.38 1.217 1.2 1.22V8.9l4.83-.01-8.62 6.617-.034.025c-.813.622-1.075 1.658-.563 2.313.52.667 1.625.668 2.447.004L7.414 14s-.069.52-.063.831zm12.09 1.741c-.97.988-2.326 1.548-3.795 1.55-1.47.004-2.827-.552-3.797-1.538a4.51 4.51 0 0 1-1.036-1.622 4.282 4.282 0 0 1 .282-3.519 4.702 4.702 0 0 1 1.153-1.371c.942-.768 2.141-1.183 3.396-1.185 1.256-.002 2.455.41 3.398 1.175.48.391.87.854 1.152 1.367a4.28 4.28 0 0 1 .522 1.706 4.236 4.236 0 0 1-.239 1.811 4.54 4.54 0 0 1-1.035 1.626","unrealengine":"M12 0a12 12 0 1012 12A12 12 0 0012 0zm0 23.52A11.52 11.52 0 1123.52 12 11.52 11.52 0 0112 23.52zm7.13-9.791c-.206.997-1.126 3.557-4.06 4.942l-1.179-1.325-1.988 2a7.338 7.338 0 01-5.804-2.978 2.859 2.859 0 00.65.123c.326.006.678-.114.678-.66v-5.394a.89.89 0 00-1.116-.89c-.92.212-1.656 2.509-1.656 2.509a7.304 7.304 0 012.528-5.597 7.408 7.408 0 013.73-1.721c-1.006.573-1.57 1.507-1.57 2.29 0 1.262.76 1.109.984.923v7.28a1.157 1.157 0 00.148.256 1.075 1.075 0 00.88.445c.76 0 1.747-.868 1.747-.868V9.172c0-.6-.452-1.324-.905-1.572 0 0 .838-.149 1.484.346a5.537 5.537 0 01.387-.425c1.508-1.48 2.929-1.902 4.112-2.112 0 0-2.151 1.69-2.151 3.96 0 1.687.043 5.801.043 5.801.799.771 1.986-.342 3.059-1.441Z","unity":"m12.9288 4.2939 3.7997 2.1929c.1366.077.1415.2905 0 .3675l-4.515 2.6076a.4192.4192 0 0 1-.4246 0L7.274 6.8543c-.139-.0745-.1415-.293 0-.3675l3.7972-2.193V0L1.3758 5.5977V16.793l3.7177-2.1456v-4.3858c-.0025-.1565.1813-.2682.318-.1838l4.5148 2.6076a.4252.4252 0 0 1 .2136.3676v5.2127c.0025.1565-.1813.2682-.3179.1838l-3.7996-2.1929-3.7178 2.1457L12 24l9.6954-5.5977-3.7178-2.1457-3.7996 2.1929c-.1341.082-.3229-.0248-.3179-.1838V13.053c0-.1565.087-.2956.2136-.3676l4.5149-2.6076c.134-.082.3228.0224.3179.1838v4.3858l3.7177 2.1456V5.5977L12.9288 0Z","davinciresolve":"M17.621 0 5.977.004c-1.37 0-2.756.345-3.762 1.11a4.925 4.925 0 0 0-1.61 2.003C.233 3.93 0 5.02 0 5.951l.012 12.2c.002 1.604.479 3.057 1.461 4.112.984 1.056 2.462 1.683 4.331 1.691L16.856 24c1.26.005 3.095-.036 4.303-.714 1.075-.605 2.025-1.556 2.497-2.984.278-.84.345-2.084.344-3.147l-.021-11.13c-.002-.888-.15-2.023-.547-2.934-.425-.976-1.181-1.815-2.322-2.425C20.353.26 19.123 0 17.622 0zm0 .93c1.378 0 2.538.295 3.04.565.977.523 1.544 1.166 1.889 1.96.315.721.47 1.793.473 2.572l.018 11.13c.002 1.013-.097 2.257-.298 2.86-.396 1.202-1.146 1.946-2.063 2.462-.814.457-2.612.593-3.82.588l-11.05-.044c-1.657-.007-2.832-.534-3.626-1.386-.792-.851-1.212-2.06-1.212-3.485L.999 5.95c0-.829.196-1.827.474-2.437.345-.757.75-1.207 1.365-1.674C3.585 1.27 4.868.97 6.08.97zm-5.66 3.423c-1.976.089-3.204 1.658-3.214 3.29.019 1.443 1.635 3.481 2.884 4.53.12.099.154.109.33.18.062.025.198-.047.327-.135.36-.245.993-.947 1.648-1.738a7.67 7.67 0 0 0 1.031-1.683c.409-.89.261-1.599.235-1.888a3.983 3.983 0 0 0-.99-1.692 3.36 3.36 0 0 0-2.251-.864zm4.172 7.922a10.185 10.185 0 0 0-3.244.61c-.15.058-.26.1-.374.17-.057.036-.11.135-.105.292.017.433.29 1.278.624 2.27.384 1.135 1.066 2.27 1.844 2.74a3.23 3.23 0 0 0 2.53.342c.832-.243 1.595-.868 1.962-1.546.986-1.818.19-3.548-1.121-4.417-.447-.296-1.133-.445-1.89-.46-.074 0-.15-.002-.226-.001zm-8.432.038a6.201 6.201 0 0 0-.752.047c-.596.078-.932.273-1.29.51a3.177 3.177 0 0 0-1.365 1.979c-.075.552-.086 1.053.033 1.507.433 1.389 1.326 2.222 2.847 2.452.636.028 1.37-.063 1.99-.45 1.269-.782 2.08-3.17 2.412-4.742.053-.176.035-.357-.013-.42-.005-.067-.044-.113-.19-.183-.398-.192-1.32-.417-2.375-.6a7.68 7.68 0 0 0-1.297-.1z","figma":"M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z","cinema4d":"M12.052 0C5.394-.007-.003 5.412 0 11.976.003 18.654 5.475 23.981 11.978 24c6.535.02 12.057-5.306 12.022-11.998-.009-1.665-.53-5.371-1.84-5.276-1.98.145-2.159 4.12-2.377 5.407-.417 2.46-1.346 5.08-2.953 6.99-1.88 2.359-4.697 3.634-7.662 3.158-3.55-.564-5.893-3.278-6.68-5.201-.753-1.723-1.035-4.162-.07-6.324 1.16-2.766 3.734-4.632 6.28-5.584 2.006-.827 4.103-1.151 5.357-1.375 2.516-.5 2.855-1.463 2.814-2.149-.015-.252-.256-.724-.785-.943C15.03.269 13.268.001 12.052 0zm5.098 1.342c.139.398.088.85-.148 1.256-.325.56-.972 1.05-1.897 1.29-1.636.428-2.976.554-4.34.96-1.312.39-3.397 1.018-5.316 2.552-.268.842-.341 1.892-.369 2.662.15 5.014 4.557 8.884 9.17 8.682.853-.037 1.921-.261 2.912-.68a13.56 13.56 0 0 0 1.387-2.683l.002-.002v-.002c.424-1.03.606-1.836.8-2.793.32-1.565.202-2.88 1.012-4.758.251-.582.71-1.113 1.258-1.346.25-.105.522-.133.79-.072-.89-2.471-3.115-4.326-5.26-5.066z","houdini":"M0 19.635V24h3.824A8.662 8.662 0 0 1 0 19.635zm16.042-4.555c0-4.037-3.253-7.92-8.111-8.089C4.483 6.873 1.801 8.136 0 10.005v4.209c1.224-3.549 4.595-5.158 7.419-5.128 3.531.041 6.251 2.703 6.275 5.72 0 2.878-1.183 4.992-4.436 5.516-1.774.296-4.548-.754-4.436-3.434.065-1.381 1.138-2.162 2.366-2.106-1.207 1.618.39 2.801 1.52 2.561a2.51 2.51 0 0 0 1.966-2.502c0-1.017-.958-2.662-3.333-2.6-2.936.068-4.785 2.183-4.85 4.797-.071 3.28 3.007 5.457 6.174 5.483 4.633.059 7.395-2.984 7.377-7.441zM0 0v6.906a12.855 12.855 0 0 1 7.931-2.609c6.801 0 11.134 4.762 11.131 10.765 0 4.17-1.946 7.308-4.995 8.938H24V0H0z","sketchup":"M.968 9.027l7.717 4.428-.006 1.32-4.39-2.518-2.763 1.57 7.148 4.12.005 1.27-7.658-4.405c.02.516.488 2.106 1.383 3.337.91 1.247 1.946 1.776 1.946 1.776L11.428 24V11.849L.975 5.846zm22.064-3.8L15.22.723S13.982 0 12.008 0C9.952 0 8.76.746 8.76.746l-7.236 4.14 11.009 6.328V24l7.245-4.136s1.295-.715 2.279-2.414c.867-1.496.975-2.943.975-2.943zM11.251 7.308s1.615-.298 2.98.49l2.171 1.25s.003 1.097.003 2.736c0 1.313-1.112 2.674-1.112 2.674l.002-4.816zm6.402 10.562l-2.358 1.353v-1.269l1.835-1.05c1.748-1.26 2.037-3.117 2.037-3.761l-.007-5.705-5.006-2.881s-.76-.499-2.129-.499c-1.367 0-2.113.461-2.113.461L8.154 5.53l-1.11-.641L9.473 3.5s.95-.527 2.544-.527c1.462 0 2.6.571 2.6.571L20.27 6.81l-.007 6.226c.04.957-.406 3.296-2.61 4.835z","rhinoceros":"M6.823 3.103c-.1 0-.213.006-.34.017-.511.044-1.25.18-1.802.329a6.269 6.269 0 0 0-1.15.42c-.231.112-.33.178-.354.273-.023.094.028.217.16.436s.346.533.535.961c.19.428.356.97.361 1.651.006.68-.149 1.5-.245 1.962-.096.462-.133.568-.227.618-.094.05-.245.044-.525-.021-.281-.065-.69-.187-1.1-.259-.41-.072-.819-.093-1.122-.038-.304.056-.504.189-.645.369-.14.18-.224.406-.282.75A6.957 6.957 0 0 0 0 11.687c.005.317.047.49.136.584.088.094.223.109.492.054s.672-.18 1.224-.215a6.302 6.302 0 0 1 1.94.202c.685.182 1.353.49 1.95.93.598.438 1.127 1.007 1.566 1.593.438.586.787 1.189 1.004 1.541.217.353.304.455.372.42.068-.035.117-.207.145-.417a3.141 3.141 0 0 0-.02-.848 7.467 7.467 0 0 0-.32-1.365 5.617 5.617 0 0 0-.495-1.018c-.146-.247-.241-.408-.245-.51-.004-.103.085-.148.51-.315.424-.167 1.185-.457 1.958-.808.772-.351 1.556-.764 2.042-1.106.486-.341.674-.61.724-.937.05-.326-.039-.71-.16-1.076a6.93 6.93 0 0 0-.529-1.193A13.696 13.696 0 0 0 11.28 5.6a9.187 9.187 0 0 0-1.1-1.236c-.282-.255-.421-.31-.51-.29-.09.02-.131.115-.168.47-.037.356-.07.973-.144 1.559a7.468 7.468 0 0 1-.432 1.773 12.543 12.543 0 0 1-.99 1.982c-.388.64-.803 1.212-1.054 1.462-.25.25-.336.18-.477.064l-.486-.4c-.15-.125-.253-.213-.273-.293-.02-.08.045-.15.27-.448.227-.299.615-.825.96-1.478a7.75 7.75 0 0 0 .796-2.282 10.1 10.1 0 0 0 .095-2.338c-.044-.564-.124-.77-.306-.896-.137-.095-.332-.146-.638-.146zm6.48 7.034h-.012c-.084.01-.192.112-.415.294a6.86 6.86 0 0 1-1.017.7c-.458.257-1.038.507-1.51.734-.47.226-.831.429-1.004.712-.172.283-.155.648.04.85.194.204.566.246.883.259.318.013.58-.002.826.087.246.09.475.285.764.516.288.23.637.498.925.561.289.063.518-.079.766-.202.249-.124.516-.23.888-.225.371.005.847.12 1.318.37.47.248.938.63 1.184.866.247.236.272.327.245.362-.028.036-.108.018-.304-.14-.196-.157-.508-.454-.917-.688-.41-.234-.916-.404-1.4-.391-.482.013-.94.21-1.23.55-.29.34-.412.822-.546 1.164-.133.341-.28.543-.47.617-.19.074-.424.02-.703-.099-.28-.12-.604-.307-.874-.442-.269-.136-.484-.22-.62-.353-.136-.132-.195-.31-.203-.571-.01-.26.032-.6.05-.853.02-.25.018-.413-.038-.56a1.079 1.079 0 0 0-.232-.35c-.07-.07-.099-.075-.113-.058-.014.017-.012.058.01.158.023.1.067.26.05.581-.019.321-.098.803-.16 1.17-.062.366-.107.618-.02.808.087.191.306.322.707.54.4.22.982.527 1.518.855.537.327 1.027.673 1.562 1.089.534.415 1.112.9 1.5 1.238.39.339.588.532.742.59.154.059.264-.018.307-.138.044-.12.023-.285-.014-.429a1.174 1.174 0 0 0-.24-.46 4.92 4.92 0 0 0-.68-.704c-.287-.243-.614-.463-.803-.614-.19-.151-.242-.233-.212-.259.03-.026.14.004.302.108.162.103.375.28.612.459.237.178.499.356.733.584.235.228.443.506.583.706.14.201.214.324.294.372.08.049.165.022.277-.05a3.03 3.03 0 0 0 .426-.355c.178-.169.398-.393.551-.633.154-.24.242-.496.299-.772.056-.276.08-.572.247-.862.167-.29.476-.574.994-1.025.518-.451 1.244-1.07 1.891-1.664.648-.595 1.216-1.165 1.696-1.802.479-.638.87-1.342 1.067-1.743.199-.4.205-.498.14-.526-.063-.027-.198.015-.61.313-.414.297-1.106.849-1.886 1.43-.781.58-1.65 1.19-2.336 1.569-.686.378-1.19.524-1.55.562-.361.037-.58-.034-.724-.11-.143-.077-.21-.158-.224-.241-.013-.084.03-.17.135-.275.106-.106.277-.232.447-.392.17-.16.338-.354.468-.556.13-.202.22-.411.261-.592.042-.181.034-.333-.04-.376-.074-.043-.215.023-.376.11-.162.086-.343.192-.593.3a2.683 2.683 0 0 1-.92.235 1.626 1.626 0 0 1-1.088-.313c-.343-.26-.635-.71-.866-1.147-.23-.438-.398-.865-.512-1.12-.108-.242-.168-.33-.246-.33zm-2.215 4.075a.422.422 0 0 0-.294.115c-.094.086-.145.2-.034.338.112.137.385.297.636.469.252.172.481.357.666.42.184.064.323.006.402-.096.08-.102.1-.247-.003-.404-.103-.157-.327-.325-.564-.481-.238-.157-.488-.302-.681-.346a.574.574 0 0 0-.128-.015zm.252.208c.025 0 .053.003.083.01.118.026.272.115.418.211.145.096.283.2.333.289.05.089.014.163-.048.216a.255.255 0 0 1-.247.053c-.1-.031-.216-.126-.36-.219-.145-.093-.319-.184-.387-.268-.068-.084-.031-.162.029-.218a.26.26 0 0 1 .18-.074zm4.778 3.728c.211-.008.42.06.602.24.183.178.34.467.383.732.042.265-.03.505-.125.692a1.58 1.58 0 0 1-.289.397c-.074.074-.109.095-.14.095h-.003c-.033-.001-.062-.023-.208-.171a7.39 7.39 0 0 1-.573-.642c-.165-.22-.232-.383-.263-.568-.032-.185-.027-.39.082-.536.109-.146.323-.23.534-.239zm.093 1.111a.258.258 0 0 0-.153.046c-.058.041-.105.113-.093.185.012.073.085.146.174.255.089.11.195.255.264.335.068.08.1.093.127.091.029-.002.054-.018.086-.048a.349.349 0 0 0 .094-.157.518.518 0 0 0 .002-.316.668.668 0 0 0-.218-.282.476.476 0 0 0-.283-.109z"};
const LOGO_DE={blender:["blender"],sketchup:["sketchup"],rhino:["rhinoceros"],cinema4d:["cinema4d"],houdini:["houdini"],unreal:["unrealengine","unity"],resolve:["davinciresolve"],figma:["figma"]};
const COULEUR={blender:"#E87D0D",unrealengine:"#0E1128",unity:"#000000",davinciresolve:"#233A51",figma:"#F24E1E",cinema4d:"#011A6A",houdini:"#FF4713",sketchup:"#005F9E",rhinoceros:"#801010"};   // couleurs officielles (Unity : noir, son blanc ne se voit pas sur fond clair)
/* Fiches logiciel du site (logo et adresse), écrites par le serveur à côté des données ; facultatives. */
let LOG={};try{const x=document.getElementById("configurateur-logiciels");if(x)LOG=JSON.parse(x.textContent)||{};}catch(e){LOG={};}
const sur=u=>typeof u==="string"&&/^(https:\/\/|\/(?!\/))[^\s"'<>`\\]*$/.test(u);
const fichesDe=id=>(LOG[id]||[]).filter(l=>l&&sur(l.url));
/* logo : tracé officiel en couleur s'il existe, sinon le logo de la fiche du site, sinon les initiales */
const logo=id=>LOGO_DE[id]?`<span class="logo svg" aria-hidden="true">${LOGO_DE[id].map(k=>`<svg viewBox="0 0 24 24" width="24" height="24" focusable="false"><path fill="${COULEUR[k]}" d="${LOGOS[k]}"/></svg>`).join("")}</span>`
  :(LOG[id]||[]).some(l=>l&&sur(l.logo))?`<span class="logo img" aria-hidden="true"><img src="${LOG[id].find(l=>l&&sur(l.logo)).logo}" data-o="${LOG[id].find(l=>l&&sur(l.logo)).logo}" alt="" width="32" height="32" decoding="async"></span>`
  :`<span class="logo" aria-hidden="true">${NOMS[id][1]}</span>`;

/* Logos de fiches sur fond uni (blanc, gris…) : ce fond, la couleur des quatre coins, devient transparent en partant
   des bords, sans toucher au dessin. Image d'un autre domaine sans autorisation, ou fond non uni : on garde l'originale. */
const detoures=new Map();
function sansFond(im){
  const k=Math.min(1,128/Math.max(im.naturalWidth,im.naturalHeight)), w=Math.max(1,Math.round(im.naturalWidth*k)), h=Math.max(1,Math.round(im.naturalHeight*k));
  const cv=document.createElement("canvas"); cv.width=w; cv.height=h; const cx=cv.getContext("2d"); cx.drawImage(im,0,0,w,h);
  const d=cx.getImageData(0,0,w,h), p=d.data, coins=[0,w-1,(h-1)*w,h*w-1].map(n=>n*4);
  if(coins.some(o=>p[o+3]<250)) return null;                                   // déjà transparent
  const f=[0,1,2].map(c=>coins.reduce((t,o)=>t+p[o+c],0)/4), ecart=o=>Math.abs(p[o]-f[0])+Math.abs(p[o+1]-f[1])+Math.abs(p[o+2]-f[2]);
  if(coins.some(o=>ecart(o)>30)) return null;                                  // pas de fond uni
  const vu=new Uint8Array(w*h), pile=[];
  for(let i=0;i<w;i++) pile.push(i,(h-1)*w+i);
  for(let j=0;j<h;j++) pile.push(j*w,j*w+w-1);
  while(pile.length){
    const n=pile.pop(); if(vu[n]) continue; vu[n]=1;
    const o=n*4, e=ecart(o);
    if(e>=60) continue;
    if(e>=30){p[o+3]=Math.min(p[o+3],Math.round(255*(e-30)/30));continue;}   // bord adouci, on ne va pas plus loin
    p[o+3]=0;
    const i=n%w, j=(n-i)/w;
    if(i>0)pile.push(n-1); if(i<w-1)pile.push(n+1); if(j>0)pile.push(n-w); if(j<h-1)pile.push(n+w);
  }
  cx.putImageData(d,0,0); return cv.toDataURL("image/png");
}
function detourer(img){
  const src=img.dataset.o;
  if(detoures.has(src)){const u=detoures.get(src); if(u) img.src=u; return;}
  detoures.set(src,null);
  const im=new Image(); im.crossOrigin="anonymous";
  im.onload=()=>{let u=null;try{u=sansFond(im);}catch(e){u=null;}
    detoures.set(src,u); if(u) document.querySelectorAll(".cfg-pc .logo img").forEach(x=>{if(x.dataset.o===src) x.src=u;});};
  im.src=src;
}

const $=id=>document.getElementById("cfg-"+id), form=$("form"), range=$("budget"), budIn=$("budgetIn");
const fmt=n=>Math.round(n).toLocaleString("fr-FR").replace(/[\u202F\u00A0]/g,"\u00A0")+"\u00A0€";   // espace insécable ordinaire : l'espace fine manque dans certaines polices (gros total sans séparateur)
const nb=t=>t.replace(/ ([?!:;%])/g," $1");          // typographie française
const dateFr=iso=>new Date(iso+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
range.min=D.budget.min; range.max=D.budget.max; range.step=D.budget.pas;
const showBud=v=>{budIn.value=v;budIn.style.width=(String(v).length+.2)+"ch";};
const setBudget=v=>{v=Math.round((+v||0)/D.budget.pas)*D.budget.pas;v=Math.min(D.budget.max,Math.max(D.budget.min,v));range.value=v;showBud(v);render();};

/* ---------- Questions ---------- */
function fillSofts(){
  const fam=form.fam.value, list=FAM[fam].filter(id=>D.projets&&D.projets[id]&&D.textes[id]), cur=form.soft?form.soft.value:null;   // seulement les logiciels présents dans les données publiées
  $("softs").innerHTML=list.map((id,i)=>`<label class="opt"><input type="radio" name="soft" id="cfg-s-${id}" value="${id}" ${(cur===id||(!list.includes(cur)&&i===0))?"checked":""}><span class="card">${logo(id)}<span class="c-name">${NOMS[id][0]}</span></span></label>`).join("");
  $("softs").querySelectorAll(".logo img[data-o]").forEach(detourer);
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
  const el=$("total"); clearTimeout(compte.t); compte.t=setTimeout(()=>{$("annonce").textContent=`Total estimé : ${fmt(v)}`;},700);   // annonce une seule fois, montant final
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
  const s=prof.mesure||{}, src=s.source==="exemple"?" (Mesures d'exemple.)":s.derivee||/^dérivée/.test(s.source||"")?" (Estimation à partir de mesures publiques.)":s.source?` (Source : ${s.source}.)`:"";
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
    $("parts").innerHTML=`<li class="sep"><button type="button" class="btn" data-v="${prof.paliers[0].budget}">Voir la machine à ${fmt(prof.paliers[0].budget)}</button></li>`; cancelAnimationFrame(anim); $("total").textContent="—"; affiche=null; $("choix").hidden=true; $("effet").innerHTML="";
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
$("parts").addEventListener("click",e=>{const b=e.target.closest(".btn[data-v]");if(b) setBudget(b.dataset.v);});
$("marks").addEventListener("click",e=>{const m=e.target.closest(".mark");if(m) setBudget(m.dataset.v);});
budIn.addEventListener("change",()=>setBudget(budIn.value));
budIn.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();setBudget(budIn.value);}});
range.addEventListener("input",render);
form.addEventListener("submit",e=>e.preventDefault());
form.addEventListener("change",e=>{
  if(e.target.name==="fam") fillSofts();
  else if(e.target.name==="soft") fillProjets();
  if(e.target.name==="fam"||e.target.id==="alsoGame"){toggleSets();setSteps();}
  render();
});
addEventListener("resize",()=>{clearTimeout(window._rz);window._rz=setTimeout(render,150);});

/* ---------- Parcours : une question à la fois, puis le résultat ---------- */
const NAMES={fam:"Activité",soft:"Logiciel",load:"Projets",screen:"Écran",games:"Jeux",budget:"Budget"};
const FAMN={"3d":"3D",video:"Vidéo et motion",photo:"Photo et design",cao:"Architecture et CAO",game:"Jeu vidéo",office:"Usage courant"};
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
/* le focus suit la question affichée : choix coché (ou premier choix) de la nouvelle étape, sans faire défiler */
function focusEtape(){const f=form.querySelector("fieldset.on");if(!f)return;const i=f.querySelector("input:checked")||f.querySelector("input");if(i)i.focus({preventScroll:true});}
function avancer(){if(step<steps.length-1){step++;show();enVue();focusEtape();}else reveler();}
function reveler(){
  tool.classList.add("done"); affiche=0; render();
  const sh=$("sheet"); sh.classList.remove("reveal");
  if(!calme){void sh.offsetWidth;sh.classList.add("reveal");setTimeout(()=>sh.classList.remove("reveal"),1800);}
  // sur téléphone, le budget occupe tout l'écran : on va directement au résultat (le budget reste juste au-dessus)
  (innerWidth<=720?sh:tool).scrollIntoView({behavior:calme?"auto":"smooth",block:"start"});
  $("headline").focus({preventScroll:true});
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
prevB.onclick=()=>{if(step>0){step--;show();focusEtape();}};
$("restart").onclick=()=>{tool.classList.remove("done");step=0;show();enVue();};
$("recap").addEventListener("click",e=>{const b=e.target.closest(".rc");if(b){tool.classList.remove("done");step=+b.dataset.i;show();enVue();focusEtape();}});
// un clic (souris ou doigt) sur une carte fait avancer ; au clavier, les flèches changent le choix sans avancer
form.addEventListener("pointerup",e=>{if(!e.target.closest(".opt")||tool.classList.contains("done")||!AUTO.includes(steps[step]))return;
  const at=step;setTimeout(()=>{if(step===at&&!tool.classList.contains("done"))avancer();},calme?0:260);});

/* ---------- « Voir cette configuration » (tableaux sous l'outil) : réponses remplies, résultat affiché ---------- */
function ouvrir(profil,budget){
  const [a,b,c]=String(profil).split("|");
  if(a==="courant") form.fam.value="office";
  else if(a==="jeu"){form.fam.value="game";form.games.value=b;form.screen.value=c;}
  else{
    const fam=Object.keys(FAM).find(f=>FAM[f].includes(a)); if(!fam) return false;
    form.fam.value=fam; fillSofts(); form.soft.value=a; fillProjets(); form.projet.value=b;
    $("alsoGame").checked=c!=="-"; if(c!=="-") form.screen.value=c;
  }
  if(a==="courant"||a==="jeu") fillSofts();
  if(!D.profils[cle()]) return false;
  toggleSets(); setSteps(); step=steps.length-1; show(); setBudget(budget); reveler();
  return true;
}
document.addEventListener("click",e=>{const v=e.target.closest(".cfg-voir");if(v&&ouvrir(v.dataset.profil,+v.dataset.budget))e.preventDefault();});

/* ---------- Onglets des configurations par budget (sections écrites par le serveur sous l'outil) ---------- */
const barre=document.querySelector(".cfg-pc-seo .cfg-onglets");
if(barre){
  const ong=[...barre.querySelectorAll('[role="tab"]')], pan=ong.map(b=>document.getElementById(b.getAttribute("aria-controls")));
  const choisir=(i,focus)=>{ong.forEach((b,j)=>{b.setAttribute("aria-selected",String(i===j));b.tabIndex=i===j?0:-1;if(pan[j])pan[j].hidden=i!==j;});if(focus)ong[i].focus();};
  ong.forEach((b,i)=>{b.addEventListener("click",()=>choisir(i));
    b.addEventListener("keydown",e=>{const n=e.key==="ArrowRight"?i+1:e.key==="ArrowLeft"?i-1:e.key==="Home"?0:e.key==="End"?ong.length-1:null;
      if(n!==null){e.preventDefault();choisir((n+ong.length)%ong.length,true);}});});
  barre.hidden=false; barre.closest(".cfg-pc-seo").classList.add("avec-onglets"); choisir(0);
}

fillSofts(); setSteps(); render();
})();

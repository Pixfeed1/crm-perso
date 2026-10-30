<?php
/**
 * Configurateur PC : modèle de page « Configurateur PC » (ou shortcode [configurateur_pc]).
 *
 * À placer dans le thème JurojiNet (inc/configurateur.php) et à charger depuis functions.php :
 *     require_once get_stylesheet_directory() . '/inc/configurateur.php';
 *
 * Le shortcode imprime le bloc de l'outil et, juste après, les données publiées par l'agent
 * (wp-content/uploads/configurateur/configurateur-data.json) dans une balise <script type="application/json">.
 * La page ne fait aucun appel réseau : tout est dans le HTML, que WP Rocket met en cache.
 * L'agent vide le cache de la page après chaque publication (rocket_clean_post).
 */

defined( 'ABSPATH' ) || exit;

const JUROJIN_CFG_FICHIER = 'configurateur/configurateur-data.json';

function jurojin_cfg_chemin_donnees() {
	$up = wp_upload_dir( null, false );
	return trailingslashit( $up['basedir'] ) . JUROJIN_CFG_FICHIER;
}

const JUROJIN_CFG_MODELE = 'configurateur-pc';

/** Modèle de page « Configurateur PC » : à choisir dans l'éditeur (panneau Page, Modèle).
    Pas de fichier de gabarit : la page garde la mise en page normale du thème, et l'outil s'affiche
    sous le texte de la page. Le shortcode reste possible pour placer l'outil ailleurs dans le texte. */
add_filter( 'theme_page_templates', function ( $modeles ) {
	$modeles[ JUROJIN_CFG_MODELE ] = 'Configurateur PC';
	return $modeles;
} );

function jurojin_cfg_page_concernee( $post = null ) {
	$post = get_post( $post );
	if ( ! $post ) {
		return false;
	}
	return get_page_template_slug( $post ) === JUROJIN_CFG_MODELE || has_shortcode( $post->post_content, 'configurateur_pc' );
}

/** Page au modèle « Configurateur PC » sans shortcode dans son texte : l'outil est ajouté à la fin. */
add_filter( 'the_content', function ( $contenu ) {
	if ( ! is_singular( 'page' ) || ! in_the_loop() || ! is_main_query() ) {
		return $contenu;
	}
	$post = get_post();
	if ( ! $post || get_page_template_slug( $post ) !== JUROJIN_CFG_MODELE || has_shortcode( $post->post_content, 'configurateur_pc' ) ) {
		return $contenu;
	}
	return $contenu . do_shortcode( '[configurateur_pc]' );
}, 20 );

/** Styles et script seulement sur les pages du configurateur (modèle ou shortcode). */
add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_singular() || ! jurojin_cfg_page_concernee() ) {
		return;
	}
	$dir = get_stylesheet_directory() . '/configurateur/';
	$url = get_stylesheet_directory_uri() . '/configurateur/';
	wp_enqueue_style( 'jurojin-configurateur', $url . 'configurateur.css', array(), filemtime( $dir . 'configurateur.css' ) );
	wp_enqueue_script( 'jurojin-configurateur', $url . 'configurateur.js', array(), filemtime( $dir . 'configurateur.js' ),
		array( 'in_footer' => true, 'strategy' => 'defer' ) );
} );

/** Sans données : rien pour les visiteurs ; un avis pour les personnes qui peuvent modifier la page. */
function jurojin_cfg_absent( $message ) {
	if ( ! current_user_can( 'edit_pages' ) ) {
		return '<!-- configurateur : données absentes -->';
	}
	return '<p class="cfg-pc-absent" style="padding:14px 16px;border:1px dashed #c7c7d1;border-radius:8px;color:#555">'
		. esc_html( $message ) . ' <em>(visible seulement par les éditeurs)</em></p>';
}

add_shortcode( 'configurateur_pc', function () {
	$fichier = jurojin_cfg_chemin_donnees();
	if ( ! is_readable( $fichier ) ) {
		return jurojin_cfg_absent( 'Les données du configurateur ne sont pas encore publiées : lancez un premier relevé des prix.' );
	}
	$json = file_get_contents( $fichier );
	if ( null === json_decode( $json ) ) {
		return jurojin_cfg_absent( 'Le fichier de données du configurateur est illisible : relancez un relevé des prix.' );
	}
	$outil = file_get_contents( get_stylesheet_directory() . '/configurateur/outil.html' );
	// "</" échappé : le JSON ne peut pas fermer la balise script
	$donnees = '<script type="application/json" id="configurateur-data">' . str_replace( '</', '<\/', $json ) . '</script>';
	return $outil . $donnees . jurojin_cfg_logiciels() . jurojin_cfg_sections( json_decode( $json, true ) );
} );

/** Logo et adresse des fiches logiciel du site (type de contenu « logiciel », champ « URL du logo »).
    L'adresse sert aux liens « Notre fiche » du résultat ; le logo, seulement aux logiciels sans tracé officiel dans l'outil. */
function jurojin_cfg_logiciels() {
	if ( ! post_type_exists( 'logiciel' ) ) {
		return '';
	}
	// identifiant de l'outil => fiches possibles, dans l'ordre : [ nom affiché, adresses (slugs) essayées ]
	$fiches = array(
		'blender'     => array( array( 'Blender', array( 'blender' ) ) ),
		'maya'        => array( array( 'Maya', array( 'maya' ) ) ),
		'cinema4d'    => array( array( 'Cinema 4D', array( 'cinema-4d' ) ) ),
		'3dsmax'      => array( array( '3ds Max', array( '3ds-max' ) ) ),
		'houdini'     => array( array( 'Houdini', array( 'houdini' ) ) ),
		'substance'   => array( array( 'Substance 3D Painter', array( 'substance-painter' ) ) ),
		'unreal'      => array( array( 'Unreal Engine', array( 'unreal-engine' ) ), array( 'Unity', array( 'unity' ) ) ),
		'zbrush'      => array( array( 'ZBrush', array( 'zbrush' ) ) ),
		'daz'         => array( array( 'Daz Studio', array( 'daz-studio' ) ) ),
		'keyshot'     => array( array( 'KeyShot', array( 'keyshot' ) ) ),
		'premiere'    => array( array( 'Premiere Pro', array( 'adobe-premiere-pro', 'premiere-pro', 'premiere' ) ) ),
		'resolve'     => array( array( 'DaVinci Resolve', array( 'davinci-resolve', 'resolve' ) ) ),
		'ae'          => array( array( 'After Effects', array( 'adobe-after-effects', 'after-effects' ) ) ),
		'photoshop'   => array( array( 'Photoshop', array( 'photoshop', 'adobe-photoshop' ) ) ),
		'lightroom'   => array( array( 'Lightroom', array( 'adobe-lightroom', 'lightroom' ) ) ),
		'illustrator' => array( array( 'Illustrator', array( 'adobe-illustrator', 'illustrator' ) ) ),
		'clipstudio'  => array( array( 'Clip Studio Paint', array( 'clip-studio-paint' ) ) ),
		'figma'       => array( array( 'Figma', array( 'figma' ) ) ),
		'sketchup'    => array( array( 'SketchUp', array( 'sketchup' ) ) ),
		'rhino'       => array( array( 'Rhino', array( 'rhinoceros-3d', 'rhino' ) ) ),
		'fusion'      => array( array( 'Fusion 360', array( 'fusion-360' ) ) ),
		'autocad'     => array( array( 'AutoCAD', array( 'autocad' ) ) ),
	);
	$sur    = function ( $u ) {
		return is_string( $u ) && preg_match( '#^(https://|/(?!/))[^\s"\'<>`\\\\]*$#', $u ) ? $u : '';
	};
	$sortie = array();
	foreach ( $fiches as $id => $liste ) {
		foreach ( $liste as $f ) {
			foreach ( $f[1] as $slug ) {
				$post = get_page_by_path( $slug, OBJECT, 'logiciel' );
				if ( $post && 'publish' === $post->post_status ) {
					$sortie[ $id ][] = array(
						'nom'  => $f[0],
						'logo' => $sur( esc_url_raw( (string) get_post_meta( $post->ID, '_logiciel_logo_url', true ) ) ),
						'url'  => $sur( (string) get_permalink( $post ) ),
					);
					break;
				}
			}
		}
	}
	if ( ! $sortie ) {
		return '';
	}
	return '<script type="application/json" id="configurateur-logiciels">' . str_replace( '</', '<\/', wp_json_encode( $sortie ) ) . '</script>';
}

/* ---------- Sections en HTML sous l'outil ----------
   L'outil est dessiné par le script ; ces sections sont écrites par le serveur à partir des mêmes données,
   pour qu'un moteur de recherche (ou un visiteur sans JavaScript) lise les configurations, la méthode et les réponses.
   Elles se mettent à jour à chaque relevé, comme l'outil. */

/** Typographie française : espace insécable avant « ? », « ! », « : » et « ; ». */
function jurojin_cfg_nb( $t ) {
	return preg_replace( array( '/ ([?!;])/u', '/ :/u' ), array( "\u{202F}$1", "\u{00A0}:" ), $t );
}

function jurojin_cfg_euros( $n ) {
	return number_format( (float) $n, 0, ',', "\u{202F}" ) . "\u{00A0}€";
}

/** Palier retenu pour un budget : le dernier dont le budget ne dépasse pas celui demandé. */
function jurojin_cfg_palier( $profil, $budget ) {
	$retenu = null;
	foreach ( $profil['paliers'] as $p ) {
		if ( $p['budget'] > $budget ) {
			break;
		}
		$retenu = $p;
	}
	return $retenu;
}

/** Tableau d'un usage, au format du shortcode [jn_table_products] du thème (classes et style de css/tables.css) :
    une colonne par repère de budget avec son total en tête, une ligne par pièce, « Le bon équilibre » en recommandé.
    Une ligne « Total » en plus, affichée seulement sur mobile, où le thème masque l'en-tête (et donc les totaux). */
function jurojin_cfg_tableau( $d, $cle ) {
	if ( empty( $d['profils'][ $cle ]['budgets_conseilles'] ) ) {
		return '';
	}
	$profil = $d['profils'][ $cle ];
	$K      = $d['composants'];
	$cols   = array();
	foreach ( $profil['budgets_conseilles'] as $repere ) {
		$p = jurojin_cfg_palier( $profil, $repere['budget'] );
		if ( ! $p || empty( $d['configs'][ $p['config'] ] ) ) {
			continue;
		}
		$c     = $d['configs'][ $p['config'] ];
		$total = 0;
		foreach ( $c as $id ) {
			$total += isset( $K[ $id ]['prix'] ) ? (float) $K[ $id ]['prix'] : 0;
		}
		$cols[] = array( 'nom' => $repere['libelle'], 'budget' => $repere['budget'], 'config' => $c, 'total' => $total,
			'rec' => 0 === strpos( $repere['libelle'], 'Le bon équilibre' ) );
	}
	if ( ! $cols ) {
		return '';
	}
	$h = '<div class="jn-table-scroll"><table class="jn-table-products"><thead><tr><th></th>';
	foreach ( $cols as $col ) {
		$h .= '<th' . ( $col['rec'] ? ' class="highlight"' : '' ) . '><span class="product-name">' . esc_html( $col['nom'] ) . '</span>'
			. '<span class="product-price">' . esc_html( jurojin_cfg_euros( $col['total'] ) )
			. '<span class="product-period">pour un budget de ' . esc_html( jurojin_cfg_euros( $col['budget'] ) ) . '</span></span></th>';
	}
	$h .= '</tr></thead><tbody>';
	$pieces = array( 'gpu' => 'Carte graphique', 'cpu' => 'Processeur', 'ram' => 'Mémoire', 'ssd' => 'Stockage' );
	foreach ( $pieces as $k => $libelle ) {
		$h .= '<tr><td>' . esc_html( $libelle ) . '</td>';
		foreach ( $cols as $col ) {
			$id = $col['config'][ $k ];
			$h .= '<td' . ( $col['rec'] ? ' class="highlight"' : '' ) . ' data-label="' . esc_attr( $col['nom'] . ( $col['rec'] ? ' ★' : '' ) ) . '">'
				. ( isset( $K[ $id ]['puce'] ) ? esc_html( $K[ $id ]['puce'] ) : '' ) . '</td>';
		}
		$h .= '</tr>';
	}
	$h .= '<tr class="cfg-total"><td>Total estimé</td>';
	foreach ( $cols as $col ) {
		$h .= '<td' . ( $col['rec'] ? ' class="highlight"' : '' ) . ' data-label="' . esc_attr( $col['nom'] . ( $col['rec'] ? ' ★' : '' ) ) . '"><strong>'
			. esc_html( jurojin_cfg_euros( $col['total'] ) ) . '</strong></td>';
	}
	return $h . '</tr></tbody></table></div>';
}

function jurojin_cfg_sections( $d ) {
	if ( ! is_array( $d ) || empty( $d['profils'] ) || empty( $d['composants'] ) ) {
		return '';
	}
	$date   = ! empty( $d['prix_constates_le'] ) ? date_i18n( 'j F Y', strtotime( $d['prix_constates_le'] . ' 12:00:00' ) ) : '';
	$exemple = empty( $d['selection']['validee_le'] );
	$h       = '<section class="cfg-pc-seo" aria-label="Configurations conseillées et méthode">';

	// [ clé du profil, titre de la section, libellé court de l'onglet ]
	$usages = array(
		array( 'blender|lourd|-', 'Pour la 3D avec Blender (projets lourds)', 'Blender' ),
		array( 'premiere|lourd|-', 'Pour le montage vidéo avec Premiere Pro (projets lourds)', 'Premiere Pro' ),
		array( 'photoshop|lourd|-', 'Pour la photo et le graphisme avec Photoshop', 'Photoshop' ),
		array( 'jeu|solo|1440', 'Pour jouer en 1440p (grands jeux solo)', 'Jeu en 1440p' ),
		array( 'courant|-|-', 'Pour un usage courant (bureautique, web, études)', 'Usage courant' ),
	);
	$ram = '';
	// phrase seulement quand la mémoire est vraiment chère (au-delà de ces seuils, en euros)
	foreach ( array( 'ram-32' => 200, 'ram-16' => 120 ) as $id => $seuil ) {
		if ( ! $ram && ! empty( $d['composants'][ $id ]['prix'] ) && $d['composants'][ $id ]['prix'] > $seuil ) {
			$ram = ' La mémoire vive pèse lourd en ce moment : un kit de ' . esc_html( $d['composants'][ $id ]['puce'] ) . ' coûte '
				. esc_html( jurojin_cfg_euros( $d['composants'][ $id ]['prix'] ) ) . '.';
		}
	}
	$h .= '<h2>Configurations conseillées selon votre budget</h2>';
	$h .= '<p>Les machines conseillées par l\'outil pour les usages les plus courants, aux prix relevés'
		. ( $date ? ' le ' . esc_html( $date ) : '' ) . ' chez Cdiscount et à la Fnac' . ( $exemple ? ' (sélection d\'exemple)' : '' )
		. '. Le total comprend aussi la carte mère, le refroidissement, l\'alimentation et le boîtier, sans le système d\'exploitation.' . $ram . '</p>';
	// Onglets : un usage à la fois. Sans script, la barre reste cachée et tous les tableaux s'affichent à la suite,
	// avec leur titre : les moteurs de recherche lisent tout dans les deux cas.
	$onglets = '';
	$panneaux = '';
	foreach ( $usages as $i => $u ) {
		$t = jurojin_cfg_tableau( $d, $u[0] );
		if ( ! $t ) {
			continue;
		}
		$onglets  .= '<button type="button" role="tab" id="cfg-onglet-' . $i . '" aria-controls="cfg-usage-' . $i . '" aria-selected="false">' . esc_html( $u[2] ) . '</button>';
		$panneaux .= '<div class="cfg-usage" id="cfg-usage-' . $i . '" role="tabpanel" aria-labelledby="cfg-onglet-' . $i . '"><h3>' . esc_html( $u[1] ) . '</h3>' . $t . '</div>';
	}
	$h .= '<div class="cfg-onglets" role="tablist" aria-label="Usages" hidden>' . $onglets . '</div>' . $panneaux;

	$blender = ! empty( $d['sources'][0] ) ? $d['sources'][0] : null;
	$h .= '<h2>Comment le configurateur choisit</h2>';
	$h .= '<p>Les prix viennent des catalogues de Cdiscount et de la Fnac, relus chaque nuit : seuls les produits neufs et en stock sont retenus.</p>';
	$h .= '<p>Pour chaque usage, l\'outil assemble les machines compatibles (support du processeur, alimentation, place pour la carte graphique, refroidissement) '
		. 'et garde, à chaque budget, la plus efficace pour votre logiciel.</p>';
	if ( $blender ) {
		$h .= '<p>Les durées de rendu Blender viennent de ' . esc_html( $blender['nom'] ) . ' (version ' . esc_html( $blender['version'] )
			. '), la base publique des tests des utilisateurs. Sans mesure publiée, l\'outil n\'affiche aucun chiffre.</p>';
	}

	$q = array();
	$q[] = array( 'Les prix affichés sont-ils à jour ?',
		'Oui, ils ont été relevés' . ( $date ? ' le ' . $date : '' ) . ', mais le prix qui compte reste celui du marchand au moment de l\'achat.' );
	if ( ! empty( $d['systeme']['nom'] ) ) {
		$q[] = array( 'Windows est-il compris dans le total ?',
			'Non. Comptez ' . jurojin_cfg_euros( $d['systeme']['prix'] ) . ' pour une licence ' . $d['systeme']['nom']
			. '. Pour un usage courant, un système gratuit comme Linux suffit aussi.' );
	}
	if ( ! empty( $d['textes']['blender']['conseils'][0] ) ) {
		$q[] = array( 'Pour Blender, pourquoi la carte graphique passe-t-elle avant le processeur ?', $d['textes']['blender']['conseils'][0] );
	}
	$ram = array();
	foreach ( $d['composants'] as $c ) {
		if ( 'ram' === $c['categorie'] && ! empty( $c['prix'] ) ) {
			$ram[ (int) $c['caracteristiques']['go'] ] = $c['puce'] . ' : ' . jurojin_cfg_euros( $c['prix'] );
		}
	}
	if ( $ram ) {
		ksort( $ram );
		$q[] = array( 'Pourquoi la mémoire vive pèse-t-elle autant dans le budget ?',
			'Aux prix relevés' . ( $date ? ' le ' . $date : '' ) . ', les kits de mémoire coûtent cher : ' . implode( ', ', $ram )
			. '. L\'outil ne met donc l\'argent dans la mémoire que lorsque votre logiciel en profite vraiment.' );
	}
	$q[] = array( 'Le site touche-t-il une commission ?',
		'Oui. Les liens vers les marchands sont des liens affiliés : si vous achetez par leur biais, Jurojin touche une petite commission, sans surcoût pour vous. Elle ne change pas le choix des pièces : l\'outil retient le prix le plus bas en stock.' );

	// Même HTML que la FAQ des guides (single-guide.php), en <details> : s'ouvre sans script, et les réponses restent dans la page.
	$icone = '<svg class="faq-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
	$h .= '<div class="faq"><h2>Questions fréquentes</h2><div class="faq-list">';
	foreach ( $q as $i => $x ) {
		$h .= '<details class="faq-item"' . ( 0 === $i ? ' open' : '' ) . '><summary class="faq-item__question">' . jurojin_cfg_nb( esc_html( $x[0] ) ) . $icone . '</summary>'
			. '<div class="faq-item__answer"><p>' . jurojin_cfg_nb( esc_html( $x[1] ) ) . '</p></div></details>';
	}
	return $h . '</div></div></section>';
}

/** WP Rocket : ni retard ni regroupement pour le script de l'outil et son bloc de données,
    sinon l'outil reste vide jusqu'au premier geste du visiteur. */
add_filter( 'rocket_delay_js_exclusions', function ( $exclusions ) {
	$exclusions[] = 'configurateur-data';
	$exclusions[] = 'configurateur-logiciels';
	$exclusions[] = 'configurateur.js';
	return $exclusions;
} );
add_filter( 'rocket_exclude_defer_js', function ( $exclusions ) {
	$exclusions[] = 'configurateur-data';
	$exclusions[] = 'configurateur-logiciels';
	return $exclusions;
} );

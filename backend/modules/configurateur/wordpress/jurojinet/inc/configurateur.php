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
	return $outil . $donnees . jurojin_cfg_sections( json_decode( $json, true ) );
} );

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

	$usages = array(
		'blender|lourd|-'   => 'Pour la 3D avec Blender (projets lourds)',
		'premiere|lourd|-'  => 'Pour le montage vidéo avec Premiere Pro (projets lourds)',
		'photoshop|lourd|-' => 'Pour la photo et le graphisme avec Photoshop',
		'jeu|solo|1440'     => 'Pour jouer en 1440p (grands jeux solo)',
		'courant|-|-'       => 'Pour un usage courant (bureautique, web, études)',
	);
	$h .= '<h2>Configurations conseillées selon votre budget</h2>';
	$h .= '<p>Les machines conseillées par l\'outil pour les usages les plus courants, aux prix relevés'
		. ( $date ? ' le ' . esc_html( $date ) : '' ) . ' chez Cdiscount et à la Fnac' . ( $exemple ? ' (sélection d\'exemple)' : '' )
		. '. Le total comprend aussi la carte mère, le refroidissement, l\'alimentation et le boîtier, sans le système d\'exploitation.</p>';
	foreach ( $usages as $cle => $titre ) {
		$t = jurojin_cfg_tableau( $d, $cle );
		if ( $t ) {
			$h .= '<h3>' . esc_html( $titre ) . '</h3>' . $t;
		}
	}

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

	$h .= '<div class="faq"><h2>Questions fréquentes</h2>';
	foreach ( $q as $x ) {
		$h .= '<h3>' . jurojin_cfg_nb( esc_html( $x[0] ) ) . '</h3><p>' . jurojin_cfg_nb( esc_html( $x[1] ) ) . '</p>';
	}
	return $h . '</div></section>';
}

/** WP Rocket : ni retard ni regroupement pour le script de l'outil et son bloc de données,
    sinon l'outil reste vide jusqu'au premier geste du visiteur. */
add_filter( 'rocket_delay_js_exclusions', function ( $exclusions ) {
	$exclusions[] = 'configurateur-data';
	$exclusions[] = 'configurateur.js';
	return $exclusions;
} );
add_filter( 'rocket_exclude_defer_js', function ( $exclusions ) {
	$exclusions[] = 'configurateur-data';
	return $exclusions;
} );

<?php
/**
 * Plugin Name: Ressources du site (lecture)
 * Description: Route REST en lecture seule (GET /wp-json/outils-site/v1/ressources[?icones=a,b]), réservée aux utilisateurs connectés qui peuvent modifier des contenus : shortcodes déclarés avec leur origine, et icônes de [spec icon=""] (table de correspondance du thème, sprite, vérification de noms). Ne modifie rien. Supprimer ce fichier pour la retirer.
 */
defined( 'ABSPATH' ) || exit;

add_action( 'rest_api_init', function () {
	register_rest_route( 'outils-site/v1', '/ressources', array(
		'methods'             => 'GET',
		'permission_callback' => function () { return current_user_can( 'edit_posts' ); },
		'callback'            => 'outils_site_ressources',
	) );
} );

/** Origine d'un fichier : thème, extension, mu-plugin ou WordPress, avec son chemin relatif. */
function outils_site_origine( $fichier ) {
	$f = wp_normalize_path( (string) $fichier );
	if ( '' === $f ) {
		return array( 'origine' => 'inconnue' );
	}
	$racines = array(
		'theme'     => wp_normalize_path( get_theme_root() ),
		'extension' => wp_normalize_path( WP_PLUGIN_DIR ),
		'mu-plugin' => wp_normalize_path( WPMU_PLUGIN_DIR ),
	);
	foreach ( $racines as $type => $racine ) {
		if ( 0 === strpos( $f, $racine . '/' ) ) {
			$rel = substr( $f, strlen( $racine ) + 1 );
			return array( 'origine' => $type, 'nom' => strtok( $rel, '/' ), 'fichier' => $rel );
		}
	}
	if ( 0 === strpos( $f, wp_normalize_path( ABSPATH . WPINC ) ) ) {
		return array( 'origine' => 'wordpress' );
	}
	return array( 'origine' => 'autre', 'fichier' => str_replace( wp_normalize_path( ABSPATH ), '', $f ) );
}

/** Fichier et ligne où est défini un callback (fonction, méthode, closure, objet invocable). */
function outils_site_reflexion( $cb ) {
	try {
		if ( $cb instanceof Closure || ( is_string( $cb ) && false === strpos( $cb, '::' ) && function_exists( $cb ) ) ) {
			$r = new ReflectionFunction( $cb );
		} elseif ( is_string( $cb ) && false !== strpos( $cb, '::' ) ) {
			$r = new ReflectionMethod( $cb );
		} elseif ( is_array( $cb ) && 2 === count( $cb ) ) {
			$r = new ReflectionMethod( $cb[0], $cb[1] );
		} elseif ( is_object( $cb ) && method_exists( $cb, '__invoke' ) ) {
			$r = new ReflectionMethod( $cb, '__invoke' );
		} else {
			return null;
		}
		return array( 'fichier' => $r->getFileName(), 'ligne' => $r->getStartLine() );
	} catch ( Throwable $e ) {
		return null;
	}
}

/** Symboles d'un sprite SVG du thème (<symbol id="…">) : le plus gros fichier .svg qui en contient. */
function outils_site_sprite() {
	$meilleur = null;
	foreach ( array_unique( array( get_stylesheet_directory(), get_template_directory() ) ) as $dossier ) {
		if ( ! is_dir( $dossier ) ) {
			continue;
		}
		$it = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $dossier, FilesystemIterator::SKIP_DOTS ) );
		foreach ( $it as $f ) {
			$p = wp_normalize_path( $f->getPathname() );
			if ( ! preg_match( '/\.svg$/i', $p ) || $f->getSize() > 8000000 || false !== strpos( $p, '/node_modules/' ) ) {
				continue;
			}
			$c = @file_get_contents( $p );
			if ( false === $c || ! preg_match_all( '/<symbol[^>]*\sid=[\'"]([^\'"]+)[\'"]/i', $c, $m ) ) {
				continue;
			}
			if ( ! $meilleur || count( $m[1] ) > count( $meilleur['ids'] ) ) {
				$o        = outils_site_origine( $p );
				$meilleur = array( 'fichier' => isset( $o['fichier'] ) ? $o['fichier'] : basename( $p ), 'ids' => array_flip( $m[1] ) );
			}
		}
	}
	return $meilleur;
}

/** Premier identifiant de symbole utilisé (<use href="#…">) dans un rendu HTML. */
function outils_site_symbole( $html ) {
	return preg_match( '/<use[^>]+(?:xlink:)?href=[\'"]#([^\'"]+)[\'"]/i', (string) $html, $m ) ? $m[1] : null;
}

/**
 * Icônes de [spec icon=""] : suit le chemin réel du thème. Le shortcode [spec] range ses paramètres,
 * [specs] les affiche en passant l'icône à une fonction de rendu (repérée dans le même fichier) ;
 * sa table de correspondance est lue dans son code, et le comportement pour un nom inconnu est
 * constaté en l'appelant (la fonction ne fait que produire du SVG : aucune écriture).
 * $verifier : noms à tester ; chacun reçoit le symbole réellement affiché.
 */
function outils_site_icones( $ref_spec, $verifier ) {
	$res = array();
	if ( ! $ref_spec ) {
		return array( 'note' => 'shortcode [spec] non déclaré sur ce site' );
	}
	$res['shortcode_spec'] = outils_site_origine( $ref_spec['fichier'] ) + array( 'ligne' => $ref_spec['ligne'] );
	$source = @file_get_contents( $ref_spec['fichier'] );
	$fn     = ( $source && preg_match( '/([a-z_][a-z0-9_]*)\(\s*\$[a-z_][a-z0-9_]*\[\s*[\'"]icon[\'"]\s*\]\s*\)/i', $source, $m ) ) ? $m[1] : null;
	if ( ! $fn || ! function_exists( $fn ) ) {
		$res['note'] = "fonction de rendu de l'icône introuvable dans le fichier de [spec]";
		return $res;
	}
	$table = array();
	try {
		$r     = new ReflectionFunction( $fn );
		$lignes = file( $r->getFileName() );
		$code  = implode( '', array_slice( $lignes, $r->getStartLine() - 1, $r->getEndLine() - $r->getStartLine() + 1 ) );
		if ( preg_match_all( '/[\'"]([a-z0-9][a-z0-9_-]*)[\'"]\s*=>\s*[\'"]([a-z0-9][a-z0-9_-]*)[\'"]/i', $code, $mm, PREG_SET_ORDER ) ) {
			foreach ( $mm as $x ) {
				$table[ strtolower( $x[1] ) ] = $x[2];
			}
		}
		$o = outils_site_origine( $r->getFileName() );
		$res['rendu'] = array( 'fonction' => $fn, 'fichier' => isset( $o['fichier'] ) ? $o['fichier'] : '', 'ligne' => $r->getStartLine() );
	} catch ( Throwable $e ) {
		$res['rendu'] = array( 'fonction' => $fn );
	}
	$sprite = outils_site_sprite();
	$affiche = function ( $nom ) use ( $fn ) {
		try { return outils_site_symbole( call_user_func( $fn, $nom ) ); } catch ( Throwable $e ) { return null; }
	};
	$inconnu = $affiche( 'zz-icone-inexistante' );
	$res['nom_inconnu'] = ( 'zz-icone-inexistante' === $inconnu )
		? 'passé tel quel au sprite : tout symbole du sprite est accepté'
		: ( $inconnu ? "remplacé par l'icône par défaut « " . $inconnu . ' »' : 'aucune icône affichée' );
	$res['correspondances'] = $table;
	if ( $sprite ) {
		$res['sprite'] = array( 'fichier' => $sprite['fichier'], 'symboles' => count( $sprite['ids'] ) );
	}
	foreach ( $verifier as $nom ) {
		$sym = $affiche( $nom );
		$dans_table = isset( $table[ strtolower( $nom ) ] );
		if ( ! $sym ) {
			$etat = 'aucune icône affichée';
		} elseif ( ! $dans_table && $sym === $inconnu && 'zz-icone-inexistante' !== $inconnu ) {
			$etat = "inconnu de [spec] : remplacé par l'icône par défaut";
		} elseif ( $sprite && ! isset( $sprite['ids'][ $sym ] ) ) {
			$etat = 'symbole absent du sprite : rien ne s\'affiche';
		} else {
			$etat = 'affichée';
		}
		$res['verification'][] = array( 'icon' => $nom, 'symbole' => $sym, 'etat' => $etat, 'dans_la_table' => $dans_table, 'nom_dans_le_sprite' => $sprite ? isset( $sprite['ids'][ (string) $nom ] ) : null );
	}
	return $res;
}

function outils_site_ressources( $requete = null ) {
	global $shortcode_tags;
	$verifier = array();
	if ( $requete instanceof WP_REST_Request && $requete->get_param( 'icones' ) ) {
		foreach ( array_slice( explode( ',', (string) $requete->get_param( 'icones' ) ), 0, 50 ) as $n ) {
			$n = strtolower( preg_replace( '/[^a-z0-9_-]/i', '', $n ) );
			if ( '' !== $n ) {
				$verifier[] = $n;
			}
		}
	}
	$shortcodes = array();
	foreach ( (array) $shortcode_tags as $tag => $cb ) {
		$ref = outils_site_reflexion( $cb );
		$o   = $ref ? outils_site_origine( $ref['fichier'] ) : array( 'origine' => 'inconnue' );
		if ( $ref && isset( $o['fichier'] ) ) {
			$o['ligne'] = $ref['ligne'];
		}
		$shortcodes[] = array( 'tag' => $tag ) + $o;
	}
	usort( $shortcodes, function ( $a, $b ) { return strcmp( $a['tag'], $b['tag'] ); } );
	return array(
		'releve_le'  => gmdate( 'c' ),
		'theme'      => array( 'actif' => get_stylesheet(), 'parent' => get_template() ),
		'shortcodes' => $shortcodes,
		'icones'     => outils_site_icones( isset( $shortcode_tags['spec'] ) ? outils_site_reflexion( $shortcode_tags['spec'] ) : null, $verifier ),
	);
}

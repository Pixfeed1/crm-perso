<?php
/**
 * Plugin Name: Ressources du site (lecture)
 * Description: Route REST en lecture seule (GET /wp-json/outils-site/v1/ressources), réservée aux utilisateurs connectés qui peuvent modifier des contenus : shortcodes déclarés avec leur origine, et icônes disponibles pour [spec icon=""]. Ne modifie rien. Supprimer ce fichier pour la retirer.
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

/** Icônes : repère automatiquement où le thème les définit (tableau nom => <svg>, <symbol id>, dossier de .svg, classes CSS, switch du shortcode [spec]). */
function outils_site_icones( $ref_spec ) {
	$res     = array();
	$sources = array();
	if ( $ref_spec ) {
		$res['shortcode_spec'] = outils_site_origine( $ref_spec['fichier'] ) + array( 'ligne' => $ref_spec['ligne'] );
	} else {
		$res['note'] = 'shortcode [spec] non déclaré sur ce site';
	}
	$fichiers = array();
	foreach ( array_unique( array( get_stylesheet_directory(), get_template_directory() ) ) as $dossier ) {
		if ( ! is_dir( $dossier ) ) {
			continue;
		}
		$it = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $dossier, FilesystemIterator::SKIP_DOTS ) );
		foreach ( $it as $f ) {
			$p = wp_normalize_path( $f->getPathname() );
			if ( count( $fichiers ) >= 3000 || false !== strpos( $p, '/node_modules/' ) || false !== strpos( $p, '/vendor/' ) ) {
				continue;
			}
			if ( preg_match( '/\.(php|svg|css|js|json)$/i', $p ) && $f->getSize() < 1500000 ) {
				$fichiers[] = $p;
			}
		}
	}
	$spec_fichier = $ref_spec ? wp_normalize_path( $ref_spec['fichier'] ) : '';
	if ( $spec_fichier && is_readable( $spec_fichier ) && ! in_array( $spec_fichier, $fichiers, true ) ) {
		$fichiers[] = $spec_fichier;
	}
	$motifs = array(
		'tableau nom => <svg>' => '/[\'"]([a-z0-9][a-z0-9_-]{1,40})[\'"]\s*=>\s*(?:[\'"]|<<<[\'"]?\w+[\'"]?\s*)\s*<svg/i',
		'symbole <symbol id>'  => '/<symbol[^>]*\sid=[\'"](?:icon-|ico-|i-)?([a-z0-9][a-z0-9_-]{1,40})[\'"]/i',
		'classe CSS d\'icône'  => '/\.(?:icon|ico|jn-icon|spec-icon)-([a-z0-9][a-z0-9-]{1,40})(?:::?before|\s*\{)/i',
	);
	foreach ( $fichiers as $p ) {
		$o   = outils_site_origine( $p );
		$rel = isset( $o['fichier'] ) ? $o['fichier'] : basename( $p );
		if ( preg_match( '/\.svg$/i', $p ) ) {
			if ( preg_match( '#/(icons?|icones?|svg)/#i', $p ) ) {
				$sources[ 'fichiers .svg : ' . dirname( $rel ) ][] = strtolower( basename( $p, '.svg' ) );
			}
			continue;
		}
		$c = @file_get_contents( $p );
		if ( false === $c ) {
			continue;
		}
		foreach ( $motifs as $methode => $re ) {
			if ( preg_match_all( $re, $c, $m ) && count( $m[1] ) >= 2 ) {
				foreach ( $m[1] as $n ) {
					$sources[ $methode . ' : ' . $rel ][] = strtolower( $n );
				}
			}
		}
		if ( $p === $spec_fichier && preg_match_all( '/case\s+[\'"]([a-z0-9][a-z0-9_-]{1,40})[\'"]\s*:/i', $c, $m ) && count( $m[1] ) >= 2 ) {
			foreach ( $m[1] as $n ) {
				$sources[ 'switch du fichier de [spec] : ' . $rel ][] = strtolower( $n );
			}
		}
	}
	$noms = array();
	$res['sources'] = array();
	foreach ( $sources as $ou => $liste ) {
		$liste = array_values( array_unique( $liste ) );
		sort( $liste );
		$res['sources'][] = array( 'ou' => $ou, 'noms' => $liste );
		$noms = array_merge( $noms, $liste );
	}
	$noms = array_values( array_unique( $noms ) );
	sort( $noms );
	$res['noms'] = $noms;
	if ( ! $noms ) {
		$res['note'] = trim( ( isset( $res['note'] ) ? $res['note'] . ' ; ' : '' ) . "aucune définition d'icônes repérée automatiquement : voir le fichier du shortcode [spec]" );
	}
	return $res;
}

function outils_site_ressources() {
	global $shortcode_tags;
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
		'icones'     => outils_site_icones( isset( $shortcode_tags['spec'] ) ? outils_site_reflexion( $shortcode_tags['spec'] ) : null ),
	);
}

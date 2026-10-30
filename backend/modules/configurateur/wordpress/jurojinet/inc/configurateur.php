<?php
/**
 * Configurateur PC : shortcode [configurateur_pc].
 *
 * À placer dans le thème JurojiNet (inc/configurateur.php) et à charger depuis functions.php :
 *     require_once get_template_directory() . '/inc/configurateur.php';
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

/** Styles et script seulement sur les pages qui contiennent le shortcode. */
add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_singular() ) {
		return;
	}
	$post = get_post();
	if ( ! $post || ! has_shortcode( $post->post_content, 'configurateur_pc' ) ) {
		return;
	}
	$dir = get_template_directory() . '/configurateur/';
	$url = get_template_directory_uri() . '/configurateur/';
	wp_enqueue_style( 'jurojin-configurateur', $url . 'configurateur.css', array(), filemtime( $dir . 'configurateur.css' ) );
	wp_enqueue_script( 'jurojin-configurateur', $url . 'configurateur.js', array(), filemtime( $dir . 'configurateur.js' ),
		array( 'in_footer' => true, 'strategy' => 'defer' ) );
} );

add_shortcode( 'configurateur_pc', function () {
	$fichier = jurojin_cfg_chemin_donnees();
	if ( ! is_readable( $fichier ) ) {
		return '<!-- configurateur : données absentes -->';
	}
	$json = file_get_contents( $fichier );
	if ( null === json_decode( $json ) ) {
		return '<!-- configurateur : données illisibles -->';
	}
	$outil = file_get_contents( get_template_directory() . '/configurateur/outil.html' );
	// "</" échappé : le JSON ne peut pas fermer la balise script
	$donnees = '<script type="application/json" id="configurateur-data">' . str_replace( '</', '<\/', $json ) . '</script>';
	return $outil . $donnees;
} );

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

<?php
/**
 * Plugin Name: Retouches après publication
 * Description: Routes REST réservées aux utilisateurs qui peuvent modifier les contenus des autres : retrouver une adresse dans les contenus publiés, les métadonnées et les réglages ; résoudre des adresses en contenus ou médias ; poser ou retirer des étiquettes EXISTANTES sans réenregistrer le contenu ; vider le cache d'une page ; lire l'état de l'extension Redirection (surveillance des permaliens, redirections d'une adresse). Ne publie et ne supprime jamais rien. Supprimer ce fichier pour tout retirer.
 */
defined( 'ABSPATH' ) || exit;

add_action( 'rest_api_init', function () {
	$peut = function () { return current_user_can( 'edit_others_posts' ); };

	// État de Redirection (lecture) : surveillance des permaliens, groupes ; ?source=/chemin : redirections de cette adresse.
	register_rest_route( 'outils-site/v1', '/redirection', array(
		'methods'             => 'GET',
		'permission_callback' => $peut,
		'callback'            => 'outils_etat_redirection',
	) );
	// Contenus publiés, métadonnées et réglages qui contiennent un des motifs (texte brut).
	register_rest_route( 'outils-site/v1', '/chercher', array(
		'methods'             => 'POST',
		'permission_callback' => $peut,
		'callback'            => 'outils_chercher',
	) );
	// Adresses -> contenus (id, type, statut, étiquettes) ; adresses ou id -> médias.
	register_rest_route( 'outils-site/v1', '/resoudre', array(
		'methods'             => 'POST',
		'permission_callback' => $peut,
		'callback'            => 'outils_resoudre',
	) );
	// Pose / retrait d'étiquettes existantes, sans republier (la date de modification ne change pas).
	register_rest_route( 'outils-site/v1', '/etiquettes', array(
		'methods'             => 'POST',
		'permission_callback' => $peut,
		'callback'            => 'outils_etiquettes',
	) );
	// Vidage du cache de pages pour des adresses du site (LiteSpeed Cache s'il est là).
	register_rest_route( 'outils-site/v1', '/purger', array(
		'methods'             => 'POST',
		'permission_callback' => $peut,
		'callback'            => 'outils_purger',
	) );
} );

function outils_etat_redirection( $req ) {
	global $wpdb;
	$actif = defined( 'REDIRECTION_VERSION' ) || class_exists( 'Red_Item' ) || class_exists( '\Redirection\Redirect\Redirect' );
	if ( ! $actif ) {
		return array( 'active' => false );
	}
	$groupes = array();
	$tg      = $wpdb->prefix . 'redirection_groups';
	if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $tg ) ) === $tg ) {
		foreach ( (array) $wpdb->get_results( "SELECT id, name, module_id, status FROM $tg ORDER BY position, id" ) as $g ) {
			$groupes[ (int) $g->id ] = array( 'id' => (int) $g->id, 'nom' => $g->name, 'module' => (int) $g->module_id, 'actif' => 'enabled' === $g->status );
		}
	}
	$o      = get_option( 'redirection_options' );
	$o      = is_array( $o ) ? $o : array();
	$groupe = isset( $o['monitor_post'] ) ? (int) $o['monitor_post'] : 0;
	$types  = isset( $o['monitor_types'] ) ? array_values( (array) $o['monitor_types'] ) : array();
	if ( $groupe > 0 && ! $types ) {
		$types = array( 'post' );     // ancien réglage sans types : l'extension surveille les articles
	}
	$types = apply_filters( 'redirection_monitor_types', $types );
	$etat  = array(
		'active'       => true,
		'version'      => defined( 'REDIRECTION_VERSION' ) ? REDIRECTION_VERSION : null,
		'surveillance' => array(
			'active'          => $groupe > 0 && count( $types ) > 0 && (bool) get_option( 'permalink_structure' ),
			'groupe'          => $groupe ? ( isset( $groupes[ $groupe ] ) ? $groupes[ $groupe ] : array( 'id' => $groupe, 'nom' => '(groupe introuvable)' ) ) : null,
			'types'           => array_values( array_diff( $types, array( 'trash' ) ) ),
			'corbeille'       => in_array( 'trash', $types, true ),
			'associee'        => isset( $o['associated_redirect'] ) ? $o['associated_redirect'] : '',
			'permaliens'      => (string) get_option( 'permalink_structure' ),
		),
		'groupes'      => array_values( $groupes ),
	);
	$source = $req ? (string) $req->get_param( 'source' ) : '';
	if ( '' !== $source ) {
		$chemin = '/' . trim( (string) wp_parse_url( $source, PHP_URL_PATH ), '/' );
		$ti     = $wpdb->prefix . 'redirection_items';
		$rows   = $wpdb->get_results( $wpdb->prepare( "SELECT id, url, action_code, action_data, status, group_id, last_count, title FROM $ti WHERE url IN (%s, %s) OR match_url IN (%s, %s) ORDER BY id DESC LIMIT 20", $chemin, $chemin . '/', strtolower( $chemin ), strtolower( $chemin . '/' ) ) );
		$etat['redirections'] = array();
		foreach ( (array) $rows as $r ) {
			$cible = maybe_unserialize( $r->action_data );
			$etat['redirections'][] = array( 'id' => (int) $r->id, 'source' => $r->url, 'cible' => is_array( $cible ) ? ( isset( $cible['url'] ) ? $cible['url'] : '' ) : (string) $cible, 'code' => (int) $r->action_code, 'active' => 'enabled' === $r->status, 'groupe' => (int) $r->group_id, 'visites' => (int) $r->last_count, 'titre' => $r->title );
		}
	}
	return $etat;
}

function outils_motifs( $req ) {
	$m = array_filter( array_map( 'strval', (array) $req->get_param( 'motifs' ) ), function ( $x ) { return strlen( $x ) >= 4; } );
	return array_slice( array_values( array_unique( $m ) ), 0, 10 );
}

function outils_chercher( $req ) {
	global $wpdb;
	$motifs = outils_motifs( $req );
	if ( ! $motifs ) {
		return new WP_Error( 'outils_motif', 'Au moins un motif de 4 caractères.', array( 'status' => 400 ) );
	}
	$like = function ( $col ) use ( $wpdb, $motifs ) {
		return '(' . implode( ' OR ', array_map( function ( $m ) use ( $wpdb, $col ) { return $wpdb->prepare( "$col LIKE %s", '%' . $wpdb->esc_like( $m ) . '%' ); }, $motifs ) ) . ')';
	};
	$exclus = "'revision','attachment','nav_menu_item','customize_changeset','oembed_cache','user_request','wp_global_styles'";
	$rows   = $wpdb->get_results( "SELECT ID FROM {$wpdb->posts} WHERE post_status = 'publish' AND post_type NOT IN ($exclus) AND " . $like( 'post_content' ) . ' ORDER BY ID LIMIT 501' );
	$contenus = array();
	foreach ( array_slice( (array) $rows, 0, 500 ) as $r ) {
		$p = get_post( (int) $r->ID );
		if ( ! $p || ! current_user_can( 'edit_post', $p->ID ) ) {
			continue;
		}
		$t = get_post_type_object( $p->post_type );
		$contenus[] = array(
			'id'        => $p->ID,
			'type'      => $p->post_type,
			'rest_base' => $t && $t->show_in_rest ? ( $t->rest_base ? $t->rest_base : $p->post_type ) : null,
			'titre'     => get_the_title( $p ),
			'lien'      => get_permalink( $p ),
			'modifie'   => $p->post_modified_gmt,
			'contenu'   => $p->post_content,
		);
	}
	$metas = array();
	foreach ( (array) $wpdb->get_results( "SELECT m.post_id, m.meta_key, LEFT(m.meta_value, 400) AS v, p.post_type, p.post_status FROM {$wpdb->postmeta} m JOIN {$wpdb->posts} p ON p.ID = m.post_id WHERE p.post_type <> 'revision' AND " . $like( 'm.meta_value' ) . ' LIMIT 200' ) as $m ) {
		$metas[] = array( 'post_id' => (int) $m->post_id, 'type' => $m->post_type, 'statut' => $m->post_status, 'cle' => $m->meta_key, 'extrait' => $m->v );
	}
	$reglages = array();
	foreach ( (array) $wpdb->get_results( "SELECT option_name FROM {$wpdb->options} WHERE option_name NOT LIKE '\\_transient%' AND option_name NOT LIKE '\\_site\\_transient%' AND " . $like( 'option_value' ) . ' LIMIT 50' ) as $o ) {
		$reglages[] = $o->option_name;
	}
	$termes = array();
	foreach ( (array) $wpdb->get_results( "SELECT t.term_id, tt.taxonomy FROM {$wpdb->term_taxonomy} tt JOIN {$wpdb->terms} t ON t.term_id = tt.term_id WHERE " . $like( 'tt.description' ) . ' LIMIT 50' ) as $t ) {
		$termes[] = array( 'id' => (int) $t->term_id, 'taxonomie' => $t->taxonomy );
	}
	return array( 'motifs' => $motifs, 'contenus' => $contenus, 'tronque' => count( (array) $rows ) > 500, 'metas' => $metas, 'reglages' => $reglages, 'descriptions_de_termes' => $termes );
}

function outils_resoudre( $req ) {
	$contenus = array();
	foreach ( array_slice( (array) $req->get_param( 'urls' ), 0, 50 ) as $url ) {
		$url = (string) $url;
		$id  = url_to_postid( $url );
		if ( ! $id ) {
			$contenus[] = array( 'url' => $url, 'id' => null );
			continue;
		}
		$p = get_post( $id );
		$t = get_post_type_object( $p->post_type );
		$contenus[] = array(
			'url'                => $url,
			'id'                 => $p->ID,
			'type'               => $p->post_type,
			'statut'             => $p->post_status,
			'titre'              => get_the_title( $p ),
			'lien'               => get_permalink( $p ),
			'modifie'            => $p->post_modified_gmt,
			'accepte_etiquettes' => is_object_in_taxonomy( $p->post_type, 'post_tag' ),
			'etiquettes'         => is_object_in_taxonomy( $p->post_type, 'post_tag' ) ? array_map( 'intval', wp_get_object_terms( $p->ID, 'post_tag', array( 'fields' => 'ids' ) ) ) : array(),
			'modifiable'         => current_user_can( 'edit_post', $p->ID ),
			'rest_base'          => $t && $t->show_in_rest ? ( $t->rest_base ? $t->rest_base : $p->post_type ) : null,
		);
	}
	$medias = array();
	foreach ( array_slice( (array) $req->get_param( 'medias' ), 0, 20 ) as $m ) {
		$m  = (string) $m;
		$id = ctype_digit( $m ) ? (int) $m : attachment_url_to_postid( $m );
		if ( ! $id && ! ctype_digit( $m ) ) {   // adresse d'une taille générée (…-300x200.jpg) ou mise à l'échelle (…-scaled.jpg)
			$id = attachment_url_to_postid( preg_replace( '/-(\d+x\d+|scaled)(\.[a-z0-9]+)$/i', '$2', $m ) );
		}
		$a = $id ? get_post( $id ) : null;
		if ( ! $a || 'attachment' !== $a->post_type ) {
			$medias[] = array( 'media' => $m, 'id' => null );
			continue;
		}
		$fichier = get_post_meta( $a->ID, '_wp_attached_file', true );
		$medias[] = array( 'media' => $m, 'id' => $a->ID, 'url' => wp_get_attachment_url( $a->ID ), 'fichier' => $fichier, 'base' => preg_replace( '/(-scaled)?\.[a-z0-9]+$/i', '', wp_basename( $fichier ) ), 'modifiable' => current_user_can( 'edit_post', $a->ID ) );
	}
	return array( 'contenus' => $contenus, 'medias' => $medias );
}

function outils_etiquettes( $req ) {
	$id = absint( $req->get_param( 'id' ) );
	$p  = get_post( $id );
	if ( ! $p || 'publish' !== $p->post_status ) {
		return new WP_Error( 'outils_contenu', 'Contenu publié introuvable.', array( 'status' => 404 ) );
	}
	if ( ! is_object_in_taxonomy( $p->post_type, 'post_tag' ) ) {
		return new WP_Error( 'outils_taxonomie', "Ce type de contenu n'accepte pas les étiquettes.", array( 'status' => 400 ) );
	}
	$tx = get_taxonomy( 'post_tag' );
	if ( ! current_user_can( 'edit_post', $id ) || ! current_user_can( $tx->cap->assign_terms ) ) {
		return new WP_Error( 'outils_interdit', 'Pas le droit de modifier les étiquettes de ce contenu.', array( 'status' => 403 ) );
	}
	$ajouter = array_values( array_unique( array_map( 'absint', (array) $req->get_param( 'ajouter' ) ) ) );
	$retirer = array_values( array_unique( array_map( 'absint', (array) $req->get_param( 'retirer' ) ) ) );
	foreach ( array_merge( $ajouter, $retirer ) as $t ) {
		if ( ! $t || ! term_exists( $t, 'post_tag' ) ) {
			return new WP_Error( 'outils_etiquette', 'Étiquette inexistante : ' . $t . ' (aucune création ici).', array( 'status' => 400 ) );
		}
	}
	$avant = array_map( 'intval', wp_get_object_terms( $id, 'post_tag', array( 'fields' => 'ids' ) ) );
	$voulu = array_values( array_diff( array_unique( array_merge( $avant, $ajouter ) ), $retirer ) );
	$r     = wp_set_object_terms( $id, array_map( 'intval', $voulu ), 'post_tag', false );
	if ( is_wp_error( $r ) ) {
		return $r;
	}
	clean_post_cache( $id );
	do_action( 'litespeed_purge_post', $id );
	$apres = array_map( 'intval', wp_get_object_terms( $id, 'post_tag', array( 'fields' => 'ids' ) ) );
	return array( 'id' => $id, 'avant' => $avant, 'apres' => $apres, 'modifie' => get_post( $id )->post_modified_gmt );
}

function outils_purger( $req ) {
	$faits = array();
	$hote  = wp_parse_url( home_url(), PHP_URL_HOST );
	foreach ( array_slice( (array) $req->get_param( 'urls' ), 0, 50 ) as $u ) {
		$u = esc_url_raw( (string) $u );
		if ( ! $u || wp_parse_url( $u, PHP_URL_HOST ) !== $hote ) {
			continue;
		}
		$id = url_to_postid( $u );
		if ( $id ) {
			clean_post_cache( $id );
			do_action( 'litespeed_purge_post', $id );
		}
		do_action( 'litespeed_purge_url', $u );
		$faits[] = $u;
	}
	return array( 'purgees' => $faits, 'litespeed' => defined( 'LSCWP_V' ) );
}

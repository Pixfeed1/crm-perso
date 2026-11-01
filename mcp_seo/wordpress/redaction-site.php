<?php
/**
 * Plugin Name: Rédaction assistée (brouillons)
 * Description: Routes REST réservées aux utilisateurs connectés qui peuvent modifier des contenus : vérification d'un contenu en blocs (blocs, shortcodes, intégrations), médias retrouvés par empreinte SHA-256, inventaire du site (blocs, compositions, types, champs, fichiers acceptés), champs Yoast en écriture (liste fermée, edit_post), copie de travail pour mettre à jour un contenu publié sans toucher la version en ligne avant validation (« Remplacer l'original »). Ne publie jamais. Supprimer ce fichier pour tout retirer.
 */
defined( 'ABSPATH' ) || exit;

const OUTILS_NS = 'outils-site/v1';

/** Champs Yoast modifiables : nom exposé => clé de métadonnée Yoast. Rien d'autre n'est écrit. */
function outils_yoast_cles() {
	return array(
		'titre'          => '_yoast_wpseo_title',
		'meta'           => '_yoast_wpseo_metadesc',
		'phrase_cle'     => '_yoast_wpseo_focuskw',
		'canonique'      => '_yoast_wpseo_canonical',
		'noindex'        => '_yoast_wpseo_meta-robots-noindex',
		'og_titre'       => '_yoast_wpseo_opengraph-title',
		'og_description' => '_yoast_wpseo_opengraph-description',
		'og_image'       => '_yoast_wpseo_opengraph-image',
		'og_image_id'    => '_yoast_wpseo_opengraph-image-id',
		'x_titre'        => '_yoast_wpseo_twitter-title',
		'x_description'  => '_yoast_wpseo_twitter-description',
		'x_image'        => '_yoast_wpseo_twitter-image',
		'x_image_id'     => '_yoast_wpseo_twitter-image-id',
		'schema_page'    => '_yoast_wpseo_schema_page_type',
		'schema_article' => '_yoast_wpseo_schema_article_type',
		'fil_ariane'     => '_yoast_wpseo_bctitle',
		'pilier'         => '_yoast_wpseo_is_cornerstone',
	);
}

add_action( 'rest_api_init', function () {
	$peut_rediger = function () { return current_user_can( 'edit_posts' ); };

	// Empreinte SHA-256 des médias (pour ne jamais téléverser deux fois le même fichier).
	register_post_meta( 'attachment', 'outils_sha256', array(
		'type'          => 'string',
		'single'        => true,
		'show_in_rest'  => true,
		'auth_callback' => function ( $autorise, $cle, $post_id ) { return current_user_can( 'edit_post', $post_id ); },
	) );

	// Champs Yoast en lecture et en écriture, sur tous les types exposés à l'API.
	foreach ( get_post_types( array( 'show_in_rest' => true ), 'names' ) as $type ) {
		if ( 'attachment' === $type ) {
			continue;
		}
		register_rest_field( $type, 'outils_yoast', array(
			'get_callback'    => function ( $obj ) {
				if ( ! current_user_can( 'edit_post', $obj['id'] ) ) {
					return null;
				}
				$out = array();
				foreach ( outils_yoast_cles() as $nom => $cle ) {
					$v = get_post_meta( $obj['id'], $cle, true );
					if ( '' !== $v ) {
						$out[ $nom ] = $v;
					}
				}
				return $out;
			},
			'update_callback' => function ( $valeurs, $post ) {
				if ( ! is_array( $valeurs ) || ! current_user_can( 'edit_post', $post->ID ) ) {
					return new WP_Error( 'outils_interdit', 'Modification des champs Yoast refusée.', array( 'status' => 403 ) );
				}
				$cles = outils_yoast_cles();
				foreach ( $valeurs as $nom => $v ) {
					if ( ! isset( $cles[ $nom ] ) ) {
						return new WP_Error( 'outils_champ_inconnu', 'Champ Yoast inconnu : ' . $nom, array( 'status' => 400 ) );
					}
					if ( in_array( $nom, array( 'noindex', 'pilier' ), true ) ) {
						$v = $v ? '1' : '';
					} elseif ( in_array( $nom, array( 'og_image_id', 'x_image_id' ), true ) ) {
						$v = $v ? (string) absint( $v ) : '';
					} elseif ( in_array( $nom, array( 'canonique', 'og_image', 'x_image' ), true ) ) {
						$v = esc_url_raw( (string) $v );
					} else {
						$v = sanitize_text_field( (string) $v );
					}
					if ( '' === $v ) {
						delete_post_meta( $post->ID, $cles[ $nom ] );
					} else {
						update_post_meta( $post->ID, $cles[ $nom ], $v );
					}
				}
				return true;
			},
			'schema'          => array( 'type' => 'object', 'context' => array( 'edit' ) ),
		) );
	}

	// Vérification d'un contenu, sans rien écrire.
	register_rest_route( OUTILS_NS, '/verifier', array(
		'methods'             => 'POST',
		'permission_callback' => $peut_rediger,
		'callback'            => 'outils_verifier_contenu',
	) );
	// Média déjà présent, retrouvé par son empreinte.
	register_rest_route( OUTILS_NS, '/media-empreinte', array(
		'methods'             => 'GET',
		'permission_callback' => $peut_rediger,
		'callback'            => function ( $req ) {
			$sha = strtolower( preg_replace( '/[^a-f0-9]/i', '', (string) $req->get_param( 'sha' ) ) );
			if ( 64 !== strlen( $sha ) ) {
				return new WP_Error( 'outils_empreinte', 'Empreinte SHA-256 attendue.', array( 'status' => 400 ) );
			}
			$ids = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'any', 'fields' => 'ids', 'numberposts' => 1, 'meta_key' => 'outils_sha256', 'meta_value' => $sha ) );
			if ( ! $ids ) {
				return array( 'id' => null );
			}
			return array( 'id' => $ids[0], 'url' => wp_get_attachment_url( $ids[0] ) );
		},
	) );
	// Inventaire de ce qu'on peut écrire sur le site.
	register_rest_route( OUTILS_NS, '/inventaire', array(
		'methods'             => 'GET',
		'permission_callback' => $peut_rediger,
		'callback'            => 'outils_inventaire',
	) );
	// Copie de travail d'un contenu publié (mise à jour sans toucher la version en ligne).
	register_rest_route( OUTILS_NS, '/copie-de-travail', array(
		'methods'             => 'POST',
		'permission_callback' => $peut_rediger,
		'callback'            => 'outils_copie_de_travail',
	) );
} );

/** Blocs, shortcodes et intégrations d'un contenu : ce qui n'existe pas sur le site est signalé. */
function outils_verifier_contenu( $req ) {
	$contenu  = (string) $req->get_param( 'contenu' );
	$registre = WP_Block_Type_Registry::get_instance();
	$utilises = array();
	$inconnus = array();
	$embeds   = array();
	$images   = array();
	$parcourir = function ( $blocs ) use ( &$parcourir, $registre, &$utilises, &$inconnus, &$embeds, &$images ) {
		foreach ( $blocs as $b ) {
			if ( empty( $b['blockName'] ) ) {
				continue;
			}
			$n = $b['blockName'];
			$utilises[ $n ] = isset( $utilises[ $n ] ) ? $utilises[ $n ] + 1 : 1;
			if ( ! $registre->is_registered( $n ) ) {
				$inconnus[ $n ] = true;
			}
			if ( ( 'core/embed' === $n || 0 === strpos( $n, 'core-embed/' ) ) && ! empty( $b['attrs']['url'] ) ) {
				$url  = $b['attrs']['url'];
				$oe   = _wp_oembed_get_object();
				$four = $oe->get_provider( $url, array( 'discover' => false ) );
				$embeds[] = array( 'url' => $url, 'fournisseur' => $four ? wp_parse_url( $four, PHP_URL_HOST ) : null );
			}
			if ( 'core/image' === $n ) {
				$html = isset( $b['innerHTML'] ) ? $b['innerHTML'] : '';
				$alt  = preg_match( '/<img[^>]*\salt="([^"]*)"/i', $html, $m ) ? trim( $m[1] ) : '';
				$images[] = array( 'alt' => '' !== $alt, 'legende' => (bool) preg_match( '/<figcaption[^>]*>\s*\S/i', $html ), 'id' => isset( $b['attrs']['id'] ) ? $b['attrs']['id'] : null );
			}
			if ( ! empty( $b['innerBlocks'] ) ) {
				$parcourir( $b['innerBlocks'] );
			}
		}
	};
	$parcourir( parse_blocks( $contenu ) );
	// shortcodes : ceux employés qui ne sont déclarés ni par le thème ni par une extension
	global $shortcode_tags;
	$sc_utilises = array();
	$sc_inconnus = array();
	if ( preg_match_all( '/' . get_shortcode_regex() . '/s', $contenu, $m ) ) {
		$sc_utilises = array_values( array_unique( $m[2] ) );
	}
	if ( preg_match_all( '/\[([a-zA-Z][\w-]*)[\s\]\/]/', $contenu, $m2 ) ) {
		foreach ( array_unique( $m2[1] ) as $tag ) {
			if ( ! isset( $shortcode_tags[ $tag ] ) && ! in_array( $tag, array( 'caption' ), true ) ) {
				$sc_inconnus[] = $tag;
			}
		}
	}
	return array(
		'blocs'      => array( 'utilises' => $utilises, 'inconnus' => array_keys( $inconnus ) ),
		'shortcodes' => array( 'utilises' => $sc_utilises, 'inconnus' => array_values( array_unique( $sc_inconnus ) ) ),
		'embeds'     => $embeds,
		'images'     => $images,
	);
}

function outils_inventaire() {
	$blocs = array();
	foreach ( WP_Block_Type_Registry::get_instance()->get_all_registered() as $nom => $t ) {
		$blocs[] = array( 'nom' => $nom, 'titre' => $t->title, 'attributs' => array_keys( (array) $t->attributes ) );
	}
	$compositions = array();
	if ( class_exists( 'WP_Block_Patterns_Registry' ) ) {
		foreach ( WP_Block_Patterns_Registry::get_instance()->get_all_registered() as $p ) {
			$compositions[] = array( 'nom' => $p['name'], 'titre' => $p['title'], 'categories' => isset( $p['categories'] ) ? $p['categories'] : array() );
		}
	}
	$reutilisables = array();
	foreach ( get_posts( array( 'post_type' => 'wp_block', 'post_status' => 'publish', 'numberposts' => 200 ) ) as $b ) {
		$reutilisables[] = array( 'id' => $b->ID, 'titre' => $b->post_title );
	}
	$types = array();
	foreach ( get_post_types( array( 'show_in_rest' => true ), 'objects' ) as $t ) {
		if ( in_array( $t->name, array( 'attachment', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation', 'wp_global_styles', 'wp_font_family', 'wp_font_face', 'nav_menu_item' ), true ) ) {
			continue;
		}
		$acf = array();
		if ( function_exists( 'acf_get_field_groups' ) ) {
			foreach ( acf_get_field_groups( array( 'post_type' => $t->name ) ) as $g ) {
				foreach ( (array) acf_get_fields( $g ) as $f ) {
					$acf[] = array( 'nom' => $f['name'], 'type' => $f['type'], 'libelle' => $f['label'], 'groupe' => $g['title'], 'rest' => ! empty( $g['show_in_rest'] ) );
				}
			}
		}
		$types[] = array(
			'type'        => $t->name,
			'rest_base'   => $t->rest_base ? $t->rest_base : $t->name,
			'nom'         => $t->label,
			'hierarchique' => (bool) $t->hierarchical,
			'supports'    => array_keys( array_filter( get_all_post_type_supports( $t->name ) ) ),
			'taxonomies'  => array_values( array_filter( get_object_taxonomies( $t->name ), function ( $x ) { $tx = get_taxonomy( $x ); return $tx && $tx->show_in_rest; } ) ),
			'modeles'     => array_keys( wp_get_theme()->get_page_templates( null, $t->name ) ),
			'acf'         => $acf,
		);
	}
	$taxos = array();
	foreach ( get_taxonomies( array( 'show_in_rest' => true ), 'objects' ) as $tx ) {
		$taxos[] = array( 'taxonomie' => $tx->name, 'rest_base' => $tx->rest_base ? $tx->rest_base : $tx->name, 'nom' => $tx->label, 'hierarchique' => (bool) $tx->hierarchical, 'types' => $tx->object_type );
	}
	$auteurs = array();
	foreach ( get_users( array( 'capability' => 'edit_posts', 'fields' => array( 'ID', 'user_login', 'display_name' ), 'number' => 100 ) ) as $u ) {
		$auteurs[] = array( 'id' => (int) $u->ID, 'identifiant' => $u->user_login, 'nom' => $u->display_name );
	}
	$dp = class_exists( '\Yoast\WP\Duplicate_Post\Post_Duplicator' ) && method_exists( '\Yoast\WP\Duplicate_Post\Post_Duplicator', 'create_duplicate_for_rewrite_and_republish' );
	return array(
		'releve_le'        => gmdate( 'c' ),
		'blocs'            => $blocs,
		'compositions'     => $compositions,
		'reutilisables'    => $reutilisables,
		'types'            => $types,
		'taxonomies'       => $taxos,
		'auteurs'          => $auteurs,
		'types_fichiers'   => get_allowed_mime_types(),
		'limite_envoi'     => wp_max_upload_size(),
		'acf_actif'        => function_exists( 'acf_get_field_groups' ),
		'yoast_actif'      => defined( 'WPSEO_VERSION' ),
		'rewrite_republish' => $dp,
	);
}

/**
 * Copie de travail d'un contenu publié : Rewrite & Republish de Yoast Duplicate Post s'il est installé,
 * sinon une copie en brouillon (meta _outils_copie_de) remplacée par le bouton « Remplacer l'original ».
 * Une copie existante est réutilisée. Le slug voulu est gardé à part et appliqué à l'original à la validation.
 */
function outils_copie_de_travail( $req ) {
	$orig = get_post( absint( $req->get_param( 'original' ) ) );
	if ( ! $orig || 'publish' !== $orig->post_status ) {
		return new WP_Error( 'outils_original', 'Contenu publié introuvable.', array( 'status' => 404 ) );
	}
	if ( ! current_user_can( 'edit_post', $orig->ID ) ) {
		return new WP_Error( 'outils_interdit', "Pas le droit de modifier l'original.", array( 'status' => 403 ) );
	}
	$existante = get_posts( array( 'post_type' => $orig->post_type, 'post_status' => array( 'draft', 'pending', 'dp-rewrite-republish' ), 'fields' => 'ids', 'numberposts' => 1,
		'meta_query' => array( 'relation' => 'OR', array( 'key' => '_outils_copie_de', 'value' => $orig->ID ), array( 'key' => '_dp_original', 'value' => $orig->ID ) ) ) );
	if ( $existante ) {
		$id      = $existante[0];
		$methode = get_post_meta( $id, '_dp_is_rewrite_republish_copy', true ) ? 'rewrite_republish' : 'copie_outils';
	} elseif ( class_exists( '\Yoast\WP\Duplicate_Post\Post_Duplicator' ) && method_exists( '\Yoast\WP\Duplicate_Post\Post_Duplicator', 'create_duplicate_for_rewrite_and_republish' ) ) {
		try {
			$d  = new \Yoast\WP\Duplicate_Post\Post_Duplicator();
			$id = $d->create_duplicate_for_rewrite_and_republish( $orig );
		} catch ( Throwable $e ) {
			$id = new WP_Error( 'outils_copie', $e->getMessage() );
		}
		if ( is_wp_error( $id ) || ! $id ) {
			return new WP_Error( 'outils_copie', 'Rewrite & Republish a échoué.', array( 'status' => 500 ) );
		}
		$methode = 'rewrite_republish';
	} else {
		$id = wp_insert_post( array(
			'post_type'      => $orig->post_type,
			'post_status'    => 'draft',
			'post_title'     => $orig->post_title,
			'post_content'   => $orig->post_content,
			'post_excerpt'   => $orig->post_excerpt,
			'post_author'    => $orig->post_author,
			'post_parent'    => $orig->post_parent,
			'menu_order'     => $orig->menu_order,
			'comment_status' => $orig->comment_status,
			'post_name'      => '',
		), true );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		update_post_meta( $id, '_outils_copie_de', $orig->ID );
		foreach ( get_object_taxonomies( $orig->post_type ) as $tx ) {
			wp_set_object_terms( $id, wp_get_object_terms( $orig->ID, $tx, array( 'fields' => 'ids' ) ), $tx );
		}
		foreach ( outils_meta_copiables( $orig->ID ) as $cle => $valeurs ) {
			foreach ( $valeurs as $v ) {
				add_post_meta( $id, $cle, maybe_unserialize( $v ) );
			}
		}
		$methode = 'copie_outils';
	}
	if ( null !== $req->get_param( 'slug' ) ) {
		update_post_meta( $id, '_outils_slug', sanitize_title( (string) $req->get_param( 'slug' ) ) );
	}
	return array( 'id' => $id, 'original' => $orig->ID, 'methode' => $methode );
}

/** Métadonnées recopiées d'un contenu à l'autre (tout sauf les techniques). */
function outils_meta_copiables( $id ) {
	$out = array();
	foreach ( get_post_meta( $id ) as $cle => $valeurs ) {
		if ( in_array( $cle, array( '_edit_lock', '_edit_last', '_wp_old_slug', '_wp_old_date', '_outils_copie_de', '_outils_slug', '_dp_original', '_dp_is_rewrite_republish_copy', '_dp_has_rewrite_republish_copy', '_encloseme', '_pingme' ), true ) ) {
			continue;
		}
		$out[ $cle ] = $valeurs;
	}
	return $out;
}

/** Slug voulu appliqué à l'original au moment où Rewrite & Republish republie la copie. */
add_action( 'duplicate_post_after_rewriting', function ( $copie_id, $original_id ) {
	$slug = get_post_meta( $copie_id, '_outils_slug', true );
	if ( $slug && current_user_can( 'edit_post', $original_id ) ) {
		wp_update_post( array( 'ID' => $original_id, 'post_name' => $slug ) );   // WordPress garde l'ancien en _wp_old_slug
	}
}, 10, 2 );

// ---- Bouton « Remplacer l'original » sur une copie de travail (sans Rewrite & Republish) ----
add_action( 'add_meta_boxes', function ( $type, $post ) {
	if ( ! $post || ! get_post_meta( $post->ID, '_outils_copie_de', true ) ) {
		return;
	}
	add_meta_box( 'outils-copie', 'Copie de travail', function ( $post ) {
		$orig = get_post( (int) get_post_meta( $post->ID, '_outils_copie_de', true ) );
		$slug = get_post_meta( $post->ID, '_outils_slug', true );
		echo '<p>Copie de travail de <a href="' . esc_url( get_permalink( $orig ) ) . '" target="_blank">' . esc_html( $orig ? $orig->post_title : '?' ) . '</a>. La version en ligne ne change pas tant que vous ne remplacez pas l\'original.</p>';
		if ( $slug && $orig && $slug !== $orig->post_name ) {
			echo '<p>Nouvelle adresse à la validation : <code>' . esc_html( $slug ) . '</code> (l\'ancienne restera redirigée par WordPress).</p>';
		}
		$url = wp_nonce_url( admin_url( 'admin-post.php?action=outils_remplacer_original&copie=' . $post->ID ), 'outils_remplacer_' . $post->ID );
		echo '<p><a class="button button-primary" href="' . esc_url( $url ) . '" onclick="return confirm(\'Remplacer la version en ligne par cette copie ? Enregistrez d\\\'abord vos modifications.\')">Remplacer l\'original</a></p>';
	}, null, 'side', 'high' );
}, 10, 2 );

add_action( 'admin_post_outils_remplacer_original', function () {
	$copie_id = absint( isset( $_GET['copie'] ) ? $_GET['copie'] : 0 );
	check_admin_referer( 'outils_remplacer_' . $copie_id );
	$copie = get_post( $copie_id );
	$orig  = $copie ? get_post( (int) get_post_meta( $copie_id, '_outils_copie_de', true ) ) : null;
	if ( ! $copie || ! $orig || ! current_user_can( 'edit_post', $orig->ID ) || ! current_user_can( 'edit_post', $copie_id ) || ! current_user_can( 'publish_posts' ) ) {
		wp_die( 'Remplacement refusé.' );
	}
	$slug = get_post_meta( $copie_id, '_outils_slug', true );
	$maj  = array(
		'ID'             => $orig->ID,
		'post_title'     => $copie->post_title,
		'post_content'   => $copie->post_content,
		'post_excerpt'   => $copie->post_excerpt,
		'post_parent'    => $copie->post_parent,
		'menu_order'     => $copie->menu_order,
		'comment_status' => $copie->comment_status,
	);
	if ( $slug ) {
		$maj['post_name'] = $slug;      // WordPress garde l'ancien slug en _wp_old_slug (redirection)
	}
	wp_update_post( wp_slash( $maj ) );
	foreach ( get_object_taxonomies( $orig->post_type ) as $tx ) {
		wp_set_object_terms( $orig->ID, wp_get_object_terms( $copie_id, $tx, array( 'fields' => 'ids' ) ), $tx );
	}
	$copiables = outils_meta_copiables( $copie_id );
	foreach ( array_keys( outils_meta_copiables( $orig->ID ) ) as $cle ) {
		if ( ! isset( $copiables[ $cle ] ) ) {
			delete_post_meta( $orig->ID, $cle );
		}
	}
	foreach ( $copiables as $cle => $valeurs ) {
		delete_post_meta( $orig->ID, $cle );
		foreach ( $valeurs as $v ) {
			add_post_meta( $orig->ID, $cle, maybe_unserialize( $v ) );
		}
	}
	wp_delete_post( $copie_id, true );
	wp_safe_redirect( admin_url( 'post.php?post=' . $orig->ID . '&action=edit' ) );
	exit;
} );

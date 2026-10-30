<?php
/**
 * Configurateur PC : mise en page de la page au modèle « Configurateur PC ».
 *
 * Même construction que la visionneuse 3D (page-visionneuse-3d.php) : pas de boîte blanche d'article,
 * le contenu est posé sur le fond du site. Fil d'Ariane, titre de la page et badge, texte de la page
 * (l'introduction écrite dans l'éditeur), puis l'outil et ses sections.
 * Chargé par le filtre template_include de inc/configurateur.php.
 */

defined( 'ABSPATH' ) || exit;

get_header();

while ( have_posts() ) :
	the_post();
	// titre de la page, ou un titre par défaut si la page n'en a pas encore
	$titre = trim( get_the_title() ) !== '' ? get_the_title() : 'Configurateur PC';
	?>
<div id="primary" class="content-area cfg-content">
	<main id="main" class="site-main">

		<div class="cfg-page">

			<nav class="cfg-crumb" aria-label="Fil d'Ariane">
				<a href="<?php echo esc_url( home_url( '/' ) ); ?>">Accueil</a>
				<span aria-hidden="true">&rsaquo;</span>
				<b><?php echo esc_html( wp_strip_all_tags( $titre ) ); ?></b>
			</nav>

			<header class="cfg-head">
				<h1><?php echo esc_html( wp_strip_all_tags( $titre ) ); ?></h1>
				<span class="cfg-badge">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5Zm-1 15-4-4 1.4-1.4L11 13.2l5.6-5.6L18 9Z"/></svg>
					Prix vérifiés chaque jour
				</span>
			</header>

			<div class="cfg-intro">
				<?php
				// le texte de la page (introduction) ; l'outil est ajouté plus bas, pas par le filtre du contenu
				do_action( 'jurojin_cfg_gabarit' );
				// le shortcode éventuellement resté dans le texte est retiré : l'outil est placé une seule fois, plus bas
				$texte = apply_filters( 'the_content', preg_replace( '/\[configurateur_pc[^\]]*\]/', '', get_the_content() ) );
				echo trim( wp_strip_all_tags( $texte ) ) !== ''
					? $texte // déjà filtré par WordPress (the_content)
					: '<p>Dites ce que vous faites et votre budget : on vous propose la machine la plus adaptée, pièce par pièce, au prix du jour.</p>';
				?>
			</div>

			<?php echo do_shortcode( '[configurateur_pc]' ); ?>

			<script type="application/ld+json"><?php
			echo wp_json_encode( array(
				'@context'            => 'https://schema.org',
				'@type'               => 'WebApplication',
				'name'                => wp_strip_all_tags( $titre ),
				'url'                 => get_permalink(),
				'applicationCategory' => 'UtilitiesApplication',
				'operatingSystem'     => 'Web',
				'inLanguage'          => 'fr',
				'offers'              => array( '@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'EUR' ),
			), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
			?></script>

		</div>

	</main>
</div>
	<?php
endwhile;

get_footer();

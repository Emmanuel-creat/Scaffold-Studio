# Journal des versions

## 1.7.0 (novembre 2026)

Septième vague : analyses, rendu et qualité logicielle.

- Courbure de Gauss en carte sur la surface, part de surface en selle, surface accessible aux cellules.
- Surface d'anisotropie du module de Young en 3D à côté de la pièce, rapport Emax / Emin.
- Séquence « révélation par coupe » : le plan de coupe descend au coeur pendant que la caméra tourne.
- Rendu vidéo image par image en MP4 60 i/s, Full HD ou 4K, sans saccade.
- Grain de poudre partiellement fondue sur la surface en gros plan.
- Application installable, utilisable hors ligne ; Three.js, exports et rapport chargés séparément.
- Tests de non-régression sur des valeurs de référence, banc de performance et tests de bout en bout dans la CI.

## 1.6.0 (novembre 2026)

Sixième vague : nouvelles architectures et confort d'utilisation.

- Treillis de poutres cubique, BCC, FCC et octet, mousse de Voronoï trabéculaire.
- Transition progressive d'une surface à une autre le long du gradient.
- Gradient en profil multipoint selon la hauteur et carte de densité tirée d'une image.
- Formes ajoutées en plein ou retirées du réseau : plaque de fixation, canal, logement de vis.
- Retrait automatique des fragments solides détachés avant maillage.
- Cotes de la pièce affichées en 3D.
- Palette de commandes (Ctrl+K) qui atteint chaque réglage, visite guidée au premier lancement.
- Historique des versions en vignettes, retour direct à une version.
- Onglets Vue, Réglages et Mesures sur téléphone.
- Accessibilité : lien d'évitement, focus visible, annonces d'état, rotation coupée si le mouvement réduit est demandé.

## 1.5.0 (novembre 2026)

Cinquième vague : image et vidéo.

- Studio image et vidéo : formats 1:1, 4:5, 9:16 et 16:9 avec recadrage automatique de la caméra.
- Rendu réaliste (halo, vignettage, anticrénelage multi-échantillonné) et profondeur de champ.
- Titre, sous-titre et barre d'échelle incrustés dans les captures et les vidéos.
- Rendu 4K hors écran en PNG.
- Séquences de caméra enregistrées automatiquement : tour complet, grue, plongée, vues clés.
- Lignes de courant en tubes colorés par la vitesse.
- Thème clair pour l'interface et la scène.

## 1.4.0 (novembre 2026)

Quatrième vague : biologie et perfusion avancée.

- Solveur de perfusion sur carte graphique (WebGPU), identique au processeur à 0,004 % près, repli automatique.
- Condition de pression imposée sur l'éprouvette entière, validée à 0,5 % sur un canal plan.
- Fluides : milieu de culture, milieu avec sérum, sang (Carreau), viscosité apparente et corrections.
- Histogramme du cisaillement pariétal avec la plage stimulante de la littérature.
- Oxygène dissous en perfusion et en culture statique, profil selon la hauteur, parois hypoxiques, carte d'oxygène sur la surface.
- Ensemencement par perfusion animé : trajets des cellules, adhésion, efficacité et répartition selon la hauteur.
- Croissance du tissu pilotée par la courbure, maillage du tissu formé de J7 à J56 et courbe de remplissage.
- Correction des traînées de particules démesurées à la réapparition.

## 1.3.0 (novembre 2026)

Troisième vague : analyses, fabrication et exports.

- Histogrammes des pores et des struts, écart type.
- Diamètre de passage (percolation), tortuosité géométrique et hydraulique, porosimétrie simulée.
- Profil de porosité selon la hauteur, volumes de vide fermés et îlots solides détachés.
- Cartes de surface : épaisseur locale, taille de pore locale, courbure moyenne, surplombs.
- Comparaison d'une version figée avec la version courante.
- Aperçu des couches d'impression, plateau de fabrication, temps et coût estimés.
- Exports 3MF, VTK surface avec cartes, Abaqus (maillage voxel et essai de compression), champ de vitesse VTK.
- Rapport de conception HTML imprimable avec méthodes et références.

## 1.2.0 (novembre 2026)

Deuxième vague : mécanique.

- Éléments finis voxel : homogénéisation périodique, tenseur de rigidité, modules Ex, Ey, Ez, cisaillement, anisotropie.
- Carte de von Mises sur la surface du scaffold et concentration de contrainte, première plastification.
- Loi de Gibson-Ashby ajustée par éléments finis pour chaque surface, reprise dans les mesures.
- Module d'une éprouvette à gradient (Voigt par tranche, Reuss selon la hauteur).
- Courbe de compression modèle et grandeurs ISO 13314.
- Endurance en fatigue, élancement et flambement des struts.
- Résorption du magnésium, du zinc, du β-TCP, du PCL et du PLA sur 36 mois.
- Graphiques intégrés au panneau des mesures, nouvelles colonnes dans le rapport CSV.

## 1.1.0 (novembre 2026)

Première vague du plan des 100 améliorations : géométrie, perfusion validée et confort de travail.

- 4 nouvelles surfaces : Fischer-Koch S, F-RD, Split P, lidinoïde.
- Anisotropie et rotation de la cellule, ajustement aux cellules entières.
- Formes cage intersomatique, cupule acétabulaire, trou central de greffe, peau pleine, import STL.
- Gradients sphérique et depuis la surface, sur la porosité et la taille de cellule.
- Design inverse : porosité calculée pour un strut visé ou une rigidité visée.
- 4 nouveaux matériaux (CoCrMo, magnésium WE43, zinc, β-TCP) et un matériau personnalisé.
- Lissage de Taubin du maillage.
- Solveur de perfusion à collision TRT, validé sur un réseau de sphères (0,4 %), tenseur de perméabilité, perte de charge.
- Annuler et rétablir, projet enregistrable, lien partageable, aperçu rapide, calcul annulable, étapes affichées.
- Coupe selon X, Y ou Z, formules des mesures au survol, interface en anglais.
- Vidéo en MP4 quand le navigateur le permet, limite mémoire signalée.
- 5 nouveaux modèles de départ.

## 1.0.0 (octobre 2026)

Première version.

- 5 surfaces TPMS, modes réseau et feuillet, pavé ou cylindre, gradients axial et radial.
- Mesures morphologiques, mécaniques et contrôle de fabricabilité.
- Perfusion par Boltzmann sur réseau, perméabilité, particules et carte de cisaillement.
- Vue en coupe, transparence, mode vol, exports STL, CSV, PNG et vidéo.
- 6 modèles de départ, tests unitaires, publication automatique sur GitHub Pages.

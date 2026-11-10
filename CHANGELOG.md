# Journal des versions

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

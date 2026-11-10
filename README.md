# Scaffold Studio

Conception, mesure et perfusion simulée de scaffolds poreux pour l'ingénierie tissulaire osseuse.

Scaffold Studio génère des architectures poreuses à partir de surfaces minimales triplement périodiques (gyroïde, diamant, Schwarz P, I-WP, Neovius), calcule en direct leurs propriétés morphologiques et mécaniques, puis simule la circulation du milieu de culture à travers les pores. Le tout tourne dans le navigateur, en local, sans serveur de calcul.

**Démo en ligne :** https://emmanuel-creat.github.io/Scaffold-Studio/

![Interface](docs/captures/01-interface.png)

## Le problème

Concevoir un scaffold osseux, c'est arbitrer en permanence :

- assez de porosité et des pores assez larges (de l'ordre de 300 à 900 µm) pour que les cellules colonisent la structure et que les nutriments circulent ;
- assez de matière pour que la rigidité reste proche de celle de l'os et éviter le phénomène de stress shielding ;
- des parois assez épaisses pour être fabriquées par le procédé choisi ;
- un cisaillement du fluide sur les parois dans une fenêtre qui stimule les ostéoblastes sans les arracher.

Ces compromis se calculent d'habitude dans plusieurs logiciels lourds (CAO, maillage, mécanique des fluides). Scaffold Studio les réunit dans une seule vue, en temps réel.

## Fonctions

| Domaine | Ce que fait l'application |
| --- | --- |
| Géométrie | 9 surfaces TPMS (gyroïde, diamant, Schwarz P, I-WP, Neovius, Fischer-Koch S, F-RD, Split P, lidinoïde), mode réseau ou feuillet, anisotropie et rotation de la cellule, ajustement aux cellules entières |
| Forme de la pièce | Pavé, cylindre, cage intersomatique à angles arrondis, cupule acétabulaire, trou central de greffe, peau pleine, import d'une forme STL quelconque (défaut osseux segmenté, implant) |
| Gradients | Axial, radial, sphérique ou depuis la surface (coque dense et coeur poreux), sur la porosité et la taille de cellule |
| Design inverse | Porosité calculée pour obtenir une épaisseur de strut visée ou une rigidité visée |
| Morphologie | Porosité mesurée, diamètre de pore et épaisseur de strut par sphère inscrite, surface spécifique, interconnectivité |
| Mécanique | Module de Young et limite d'élasticité estimés (Gibson-Ashby) pour 10 matériaux et un matériau personnalisé, comparés aux plages de l'os, masse |
| Analyses avancées | Histogrammes des pores et des struts, diamètre de passage (percolation), tortuosité géométrique et hydraulique, porosimétrie simulée, profil de porosité selon la hauteur, volumes fermés et îlots détachés, part de surface concave |
| Cartes de surface | Épaisseur locale, taille de pore locale, courbure moyenne, surplombs à l'impression, cisaillement, von Mises |
| Comparaison | Version figée A comparée à la version courante, écarts en pourcentage |
| Éléments finis | Homogénéisation périodique de la cellule par éléments finis voxel : tenseur de rigidité, modules Ex, Ey, Ez, cisaillement, anisotropie de Zener, carte de von Mises sur la surface, concentration de contrainte, loi de Gibson-Ashby ajustée pour la surface choisie, module d'une éprouvette à gradient |
| Essais simulés | Courbe de compression modèle avec grandeurs de la norme ISO 13314 (plateau, densification, énergie absorbée), endurance en fatigue, élancement et flambement des struts |
| Résorption | Évolution de la masse et de la rigidité sur 36 mois pour le magnésium, le zinc, le β-TCP, le PCL et le PLA |
| Fabrication | Vérification de l'épaisseur minimale selon le procédé, lissage de Taubin, aperçu des couches d'impression, surplombs, plateau de fabrication avec le nombre de pièces, temps et coût estimés |
| Perfusion | Boltzmann sur réseau D3Q19 à collision TRT, perméabilité de Darcy, tenseur de perméabilité selon X, Y et Z, perte de charge, particules traçantes |
| Cisaillement | Carte de cisaillement pariétal, part de la surface dans la fenêtre cible, histogramme comparé à la plage de la littérature (0,05 à 25 mPa) |
| Solveur | Calcul sur carte graphique (WebGPU) avec repli automatique sur le processeur, pression imposée sur l'éprouvette entière, milieu de culture, sérum ou sang (Carreau) |
| Biologie | Oxygène dissous en perfusion et en culture statique (advection, diffusion, consommation de Michaelis-Menten aux parois), carte d'oxygène sur la surface, zones hypoxiques, ensemencement par perfusion animé avec efficacité et répartition en hauteur, croissance du tissu pilotée par la courbure jour par jour |
| Visualisation | Coupe selon X, Y ou Z, transparence, rotation, mode vol à travers les pores, lignes de courant, thème clair |
| Studio | Formats 1:1, 4:5, 9:16 et 16:9, rendu réaliste, profondeur de champ, titre et barre d'échelle incrustés, rendu 4K, séquences de caméra enregistrées (tour, grue, plongée, vues clés) |
| Projet | Annuler et rétablir, enregistrement et ouverture d'un projet, lien partageable, aperçu rapide puis résolution finale, interface en français ou en anglais |
| Exports | STL et 3MF pour l'impression, VTK surface avec les cartes (ParaView), maillage voxel Abaqus avec essai de compression, champ de vitesse VTK, mesures CSV, rapport de conception HTML imprimable en PDF, capture PNG, vidéo MP4 ou WebM |

![Carte de cisaillement en coupe](docs/captures/02-cisaillement-coupe.png)

![Perfusion du milieu de culture](docs/captures/03-perfusion-particules.png)

![Vol dans les pores](docs/captures/06-vol-dans-les-pores.png)

## Modèles fournis

- Gyroïde titane (cube 8 mm)
- Cage lombaire titane avec fenêtre de greffe
- Cage cylindrique titane, gradient radial
- Cupule acétabulaire poreuse
- Défaut segmentaire de fémur de rat (Ø 4 × 5 mm)
- Défaut de calvaria de rat (Ø 8 × 1,5 mm) en β-TCP
- Substitut osseux résorbable en PCL
- Os trabéculaire bio-inspiré avec gradient axial et cellule étirée
- Coque corticale et coeur spongieux en magnésium WE43
- Bouchon en tantale Schwarz P
- Implant PEEK Neovius

![Cage rachidienne](docs/captures/04-cage-gradient-radial.png)

## Lancer en local

Prérequis : [Node.js](https://nodejs.org) 18 ou plus.

Sous Windows, double-cliquer sur `Lancer-Scaffold-Studio.bat`. Sinon :

```bash
npm install
npm run dev
```

L'application s'ouvre sur http://localhost:5173. Une fois installée, elle fonctionne sans connexion.

Autres commandes :

```bash
npm test          # tests unitaires (maillage, mesures, solveur)
npm run build     # version de production dans dist/
```

## Raccourcis

| Touche | Action |
| --- | --- |
| F | Mode vol à travers les pores |
| H | Masquer l'interface (mode capture) |
| R | Démarrer ou arrêter l'enregistrement vidéo |
| P | Capture d'image |
| Espace | Lancer ou arrêter la perfusion |
| Échap | Quitter le mode vol |
| Ctrl+Z, Ctrl+Y | Annuler, rétablir |
| Ctrl+S | Enregistrer le projet |

## Tourner une vidéo

1. Lancer la perfusion et attendre « Écoulement établi ».
2. Régler l'opacité vers 20 % pour voir les particules, ou activer la carte de cisaillement.
3. Appuyer sur H pour masquer l'interface, puis R pour enregistrer.
4. Appuyer sur F pour le vol à travers les pores (environ 26 secondes de traversée).
5. R pour arrêter : la vidéo est téléchargée en MP4 si le navigateur sait l'encoder, sinon en WebM.

Le studio image et vidéo prépare directement un post LinkedIn :

- Format carré, portrait 4:5 pour le fil, vertical 9:16 pour une story ou un reel, paysage 16:9 ; la caméra se recadre seule.
- Rendu réaliste (halo et vignettage, anticrénelage conservé), profondeur de champ réglable.
- Titre et sous-titre incrustés, barre d'échelle en millimètres, présents dans l'image et la vidéo.
- Rendu 4K en PNG (grand côté de 3 840 px) hors écran.
- Séquences de caméra enregistrées seules : tour complet, grue montante, plongée vers le coeur, ou trajet libre passant par des vues clés.
- Lignes de courant en tubes colorés par la vitesse, thème clair pour les captures sur fond blanc.

## Méthodes et validation

Les méthodes sont détaillées dans le [cahier des charges](docs/CAHIER_DES_CHARGES.md). En résumé :

- **Géométrie :** le seuil de chaque surface est calculé par quantile sur une cellule unité pour atteindre exactement la porosité visée, puis l'isosurface est maillée par surface nets (maillage fermé et orienté).
- **Morphologie :** transformée de distance euclidienne exacte (Felzenszwalb et Huttenlocher), diamètres pris aux maxima locaux.
- **Mécanique :** loi de Gibson-Ashby, E = C · Es · ρ*ⁿ avec n = 2 en réseau et 1,5 en feuillet.
- **Éléments finis :** hexaèdres à 8 noeuds sur la cellule voxelisée (24³), conditions périodiques, six déformations unitaires, gradient conjugué préconditionné sans matrice assemblée. Le tenseur effectif donne les modules d'ingénierie ; la superposition des six cas donne la contrainte de von Mises pour une compression selon z. Quatre porosités supplémentaires fournissent l'ajustement E*/Es = C · ρⁿ.
- **Modèles d'essai :** courbe de compression élastique, plateau et densification (εD = 1 − 1,4 ρ), fatigue par loi de Basquin normalisée, flambement d'Euler des struts, résorption par érosion de surface appliquée à la transformée de distance du solide ou par hydrolyse en masse.
- **Perfusion :** Boltzmann sur réseau D3Q19, collision à deux temps de relaxation (TRT, paramètre magique 3/16) qui rend la perméabilité indépendante de la viscosité numérique, rebond à mi-chemin sur les parois, force volumique équivalente à un gradient de pression, perméabilité par la loi de Darcy. Sans gradient, le calcul porte sur une cellule périodique, ce qui donne la perméabilité du réseau infini. Le même schéma tourne sur carte graphique (WebGPU, un fil par noeud, propagation en lecture) ; la condition de pression imposée remet les tranches d'entrée et de sortie à l'équilibre à densité fixée.
- **Oxygène :** état stationnaire de D ∇²c − u · ∇c = consommation, avec D = 3 × 10⁻⁹ m²/s, consommation de Michaelis-Menten des cellules adhérentes sur chaque face de paroi, schéma amont pour l'advection, Gauss-Seidel sur-relaxé. La cellule périodique est répétée sur la hauteur de la pièce ; la culture statique reçoit le milieu par les deux faces.
- **Ensemencement :** cellules injectées à l'entrée, transportées par le champ de vitesse et sédimentant à 9 µm/s (loi de Stokes pour une cellule de 15 µm), adhésion au contact d'une paroi avec une probabilité réglable.
- **Croissance tissulaire :** modèle de croissance pilotée par la courbure (Rumpler 2008, Bidan 2012). Dans un pore de rayon local R, un point à la distance d de la paroi est comblé au temps d (2R − d) / (2λ).
- **Fluide non newtonien :** viscosité de Carreau du sang au taux de cisaillement caractéristique des pores, perte de charge et cisaillement corrigés au premier ordre.

Tests automatiques :

| Test | Résultat |
| --- | --- |
| Écoulement de Poiseuille entre deux plaques | écart inférieur à 1 % avec la solution analytique, indépendant de la viscosité |
| Réseau cubique de sphères (Sangani et Acrivos) | écart de 0,4 % sur la perméabilité |
| Pression imposée sur un canal plan | écart de 0,5 % avec la solution exacte |
| Solveur sur carte graphique | même perméabilité que le processeur à 0,004 % près, selon z et selon x |
| Oxygène | concentration constante sans consommation, bilan de masse à 0,3 %, perfusion mieux oxygénée que la culture statique |
| Croissance tissulaire | canal cylindrique à moitié comblé au temps prévu (0,58 pour 0,5) |
| Ensemencement | sédimentation sans écoulement, cellules emportées par un écoulement rapide |
| Viscosité du sang | Carreau, rhéofluidifiant entre μ0 et μ∞ |
| Studio | tailles 4K exactes par format, tour complet à distance constante, passage par les vues clés, lignes de courant droites dans un écoulement uniforme |
| 9 surfaces TPMS | porosité visée atteinte, anisotropie, rotation, formes et peau vérifiées |
| Import STL | volume d'un cube voxelisé à 8 % près |
| Projet | lien partageable aller-retour, annuler et rétablir |
| Éléments finis sur bloc plein | tenseur isotrope retrouvé à 10⁻⁶ près |
| Éléments finis sur stratifié de plaques | module égal à la fraction solide (borne de Voigt exacte) |
| Ajustement de Gibson-Ashby | coefficients retrouvés sur une loi puissance connue |
| Analyses | profil de porosité, absence de volume fermé sur un gyroïde, tortuosité, passage plus petit que le pore moyen, épaisseur locale cohérente avec le strut |
| Volume du maillage par rapport à la porosité visée | écart inférieur à 3 points sur les 10 combinaisons surface et mode |
| Transformée de distance | distances exactes sur un cas de référence |
| Interconnectivité d'un gyroïde | 100 % |

Les valeurs mécaniques et de cisaillement sont des estimations de conception. Elles orientent un choix d'architecture et doivent être confirmées par éléments finis et par essais.

## Structure du code

```
src/
  tpms.js          surfaces, seuils de porosité, champ implicite
  mesher.js        maillage surface nets, volume et aire
  metrics.js       mesures morphologiques et mécaniques, matériaux
  lbm.js           solveur de Boltzmann sur réseau D3Q19 (force ou pression)
  lbm.gpu.js       même solveur sur carte graphique (WebGPU)
  bio.js           oxygène, ensemencement, croissance tissulaire, fluide non newtonien
  bio.worker.js    calculs biologiques hors du fil principal
  geo.worker.js    calcul géométrie et mesures hors du fil principal
  flow.worker.js   calcul de perfusion hors du fil principal
  flow.js          particules, cisaillement, trajectoire de vol
  main.js          scène 3D, exports, raccourcis
  ui.js, panel.js  panneaux de paramètres et de mesures
  stl.js           import STL et distance signée
  fem.js           éléments finis voxel, homogénéisation, von Mises
  fem.worker.js    calcul éléments finis hors du fil principal
  mechanics.js     compression, fatigue, flambement, résorption
  charts.js        graphiques SVG du panneau
  analysis.js      percolation, tortuosité, porosimétrie, volumes fermés, cartes de surface
  fabrication.js   couches, temps, plateau, coût
  exporters.js     3MF, VTK, Abaqus, champ de vitesse
  report.js        rapport de conception HTML
  studio.js        formats, post-traitement, titres, rendu 4K, séquences de caméra
  project.js       projet, lien partageable, historique
  i18n.js          traduction français et anglais
tests/             tests unitaires (Vitest)
```

## Auteur

BAILLY emmanuel, étudiant en master Bioingénierie des tissus et des implants (Aix-Marseille Université).

Licence MIT.

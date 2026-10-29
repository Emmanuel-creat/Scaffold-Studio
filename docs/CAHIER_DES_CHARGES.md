# Cahier des charges : Scaffold Studio

Auteur : BAILLY emmanuel. Version 1.0, octobre 2026.

## 1. Contexte

En ingénierie tissulaire osseuse, un scaffold est une structure poreuse temporaire ou permanente qui sert de support à la colonisation cellulaire et à la formation d'os nouveau. Les architectures à base de surfaces minimales triplement périodiques (TPMS) se sont imposées avec la fabrication additive : elles sont continues, sans angles vifs, entièrement interconnectées et paramétrables.

Le concepteur doit concilier des exigences contradictoires :

| Exigence | Ordre de grandeur visé | Conséquence d'un mauvais réglage |
| --- | --- | --- |
| Porosité | 50 à 90 % (os spongieux) | Trop faible : colonisation et vascularisation limitées |
| Taille de pore | environ 300 à 900 µm | Trop petite : ostéoconduction réduite. Trop grande : surface d'adhésion faible |
| Rigidité | proche de l'os hôte (0,1 à 2 GPa spongieux, 7 à 30 GPa cortical) | Trop rigide : stress shielding et résorption |
| Perméabilité | 10⁻¹⁰ à 10⁻⁸ m² (os spongieux) | Trop faible : apport en nutriments insuffisant au coeur |
| Cisaillement pariétal en perfusion | de l'ordre de 0,1 à 10 mPa | Trop faible : pas de stimulation. Trop fort : détachement cellulaire |
| Épaisseur minimale | selon le procédé (0,15 à 0,4 mm) | Pièce non fabricable |

## 2. Objectif

Fournir un outil unique, local et interactif qui permet de concevoir une architecture, de lire immédiatement ses propriétés et de visualiser la perfusion du milieu de culture, puis d'exporter un fichier imprimable.

Objectif secondaire : produire des visuels et des vidéos de qualité (coupe, cartes de couleur, vol à travers les pores) pour communiquer sur le projet.

## 3. Utilisateurs

- Étudiants et ingénieurs R&D en biomatériaux et dispositifs implantables.
- Enseignants qui veulent illustrer le lien entre architecture et fonction.

## 4. Exigences fonctionnelles

| Réf. | Exigence | Statut V1 |
| --- | --- | --- |
| F1 | Choisir la surface (gyroïde, diamant, Schwarz P, I-WP, Neovius) et le mode (réseau ou feuillet) | Fait |
| F2 | Régler la taille de cellule et la porosité visée, la porosité réelle doit suivre la consigne à 3 points près | Fait |
| F3 | Choisir la forme et les dimensions de l'éprouvette (pavé, cylindre) | Fait |
| F4 | Appliquer un gradient de porosité axial ou radial | Fait |
| F5 | Mesurer porosité, diamètre de pore, épaisseur de strut, surface spécifique, interconnectivité | Fait |
| F6 | Estimer module de Young, limite d'élasticité et masse pour plusieurs matériaux | Fait |
| F7 | Vérifier la fabricabilité selon le procédé | Fait |
| F8 | Simuler la perfusion et calculer la perméabilité | Fait |
| F9 | Afficher le cisaillement pariétal et la part de surface dans une fenêtre cible réglable | Fait |
| F10 | Visualiser en coupe, en transparence et en vol à travers les pores | Fait |
| F11 | Exporter STL, rapport CSV, image et vidéo | Fait |
| F12 | Proposer des modèles de départ représentatifs | Fait (6 modèles) |

## 5. Exigences non fonctionnelles

- Fonctionnement local, sans serveur de calcul, sans compte, sans envoi de données.
- Calculs lourds hors du fil principal (Web Workers) pour garder une interface fluide.
- Géométrie et mesures en moins de 2 secondes en résolution standard sur un portable récent.
- Interface en français, sans dépendance réseau une fois installée.
- Code testé automatiquement (Vitest) et publié en continu (GitHub Actions, GitHub Pages).

## 6. Méthodes

### 6.1 Géométrie

Chaque surface est définie par une fonction implicite g(x, y, z) de période 2π, mise à l'échelle par la taille de cellule a (k = 2π / a). Le solide correspond à g < t en mode réseau et à |g| < t en mode feuillet.

Le seuil t est obtenu sans itération : on échantillonne g sur 40³ points d'une cellule unité, on trie les valeurs, et le quantile d'ordre (1 - porosité) donne t. Avec un gradient, t est recalculé localement à partir de la porosité locale.

La forme de l'éprouvette est imposée par intersection avec sa fonction distance signée. L'isosurface est maillée par surface nets : un sommet par cellule traversée, placé au barycentre des points de passage sur les arêtes, et deux triangles par arête traversée. Le maillage obtenu est fermé et orienté vers l'extérieur du solide.

### 6.2 Mesures morphologiques

- Porosité : 1 - volume du maillage / volume de l'éprouvette (volume par théorème de la divergence).
- Diamètre de pore et épaisseur de strut : transformée de distance euclidienne exacte sur la grille (algorithme de Felzenszwalb et Huttenlocher), diamètres pris aux maxima locaux, en excluant les sphères qui débordent de l'éprouvette.
- Interconnectivité : part du vide atteinte par remplissage depuis l'extérieur.

### 6.3 Mécanique

Loi de Gibson-Ashby : E* = C · Es · ρ*ⁿ et σ* = 0,3 · σs · ρ*^1,5, où ρ* = 1 - porosité. On prend n = 2 et C = 1 en réseau (flexion dominante), n = 1,5 et C = 0,6 en feuillet. Ce sont des estimations de premier ordre.

| Matériau | E (GPa) | Limite d'élasticité (MPa) | Masse volumique (g/cm³) |
| --- | --- | --- | --- |
| Ti-6Al-4V | 110 | 880 | 4,43 |
| Tantale | 186 | 170 | 16,6 |
| PEEK | 3,6 | 100 | 1,30 |
| PCL | 0,4 | 16 | 1,145 |
| PLA | 3,5 | 60 | 1,24 |
| Hydroxyapatite dense | 100 | 400 | 3,16 |

### 6.4 Perfusion

Écoulement de Stokes résolu par la méthode de Boltzmann sur réseau D3Q19, collision BGK (τ = 1), rebond à mi-chemin sur les parois solides, conditions périodiques et force volumique selon z. La perméabilité suit la loi de Darcy : k = ν · ⟨u⟩ / g, convertie en m² avec le pas du réseau.

- Sans gradient et en pavé : calcul sur une cellule unité périodique (32³ noeuds), ce qui correspond au réseau infini.
- Avec gradient ou en cylindre : calcul sur l'éprouvette entière (48 noeuds sur la plus grande dimension), la paroi du cylindre étant traitée comme une chambre de perfusion.

L'écoulement étant linéaire (régime de Stokes), le champ est mis à l'échelle de la vitesse d'entrée choisie (vitesse de Darcy en mm/s).

Le cisaillement pariétal est estimé par τ = μ · |u(d)| / d, avec u(d) la vitesse à une distance d d'un pas de réseau de la paroi, le long de la normale, et μ = 0,75 mPa·s (milieu de culture à 37 °C).

Validation : écoulement de Poiseuille entre deux plaques, perméabilité retrouvée à 0,3 % près.

## 7. Limites connues

- Les valeurs mécaniques sont des lois d'échelle, pas un calcul par éléments finis.
- Le cisaillement dépend de la résolution du réseau et reste une estimation.
- La perfusion en éprouvette entière est calculée à résolution modérée pour rester interactive.

## 8. Évolutions envisagées

- Calcul par éléments finis voxel de la rigidité effective dans les trois directions.
- Gradient de taille de cellule, en plus du gradient de porosité.
- Import d'une forme quelconque (STL d'un défaut osseux) à remplir par le réseau.
- Simulation simplifiée de colonisation cellulaire au cours du temps.
- Export 3MF avec unités et métadonnées.

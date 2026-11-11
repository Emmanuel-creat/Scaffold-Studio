# Validation

Auteur : BAILLY emmanuel. Novembre 2026.

Ce document rassemble les vérifications de Scaffold Studio : solutions analytiques (tests automatiques), comparaison entre solveurs, et comparaison avec une étude publiée. Les chiffres sont reproductibles avec `npm test` et `node scripts/validation.mjs`.

## 1. Solutions analytiques et cas de référence

| Cas | Grandeur | Écart |
| --- | --- | --- |
| Poiseuille entre deux plaques | perméabilité | < 1 %, indépendante de la viscosité numérique (TRT) |
| Réseau cubique de sphères (Sangani et Acrivos 1982) | perméabilité | 0,4 % |
| Canal plan à pression imposée | débit | 0,5 % |
| Carte graphique contre processeur | perméabilité selon z et x | 0,004 % |
| Bloc plein (éléments finis) | tenseur isotrope | 10⁻⁶ |
| Stratifié de plaques (éléments finis) | module parallèle | borne de Voigt exacte |
| Canal cylindrique (croissance tissulaire) | temps de demi-remplissage | 0,58 prévu pour 0,5 mesuré |
| Oxygène sans consommation | concentration | constante, bilan de masse à 0,3 % |

## 2. Comparaison avec Castro et al. 2019

Castro A. P. G., Pires T., Santos J. E., Gouveia B. P., Fernandes P. R. Permeability versus Design in TPMS Scaffolds. *Materials* 12(8):1313, 2019. doi:10.3390/ma12081313.

L'étude compare trois TPMS à 70 % de porosité (Schwarz D, gyroïde, Schwarz P), cellule de 3,25 mm, cubes de 13 mm imprimés en résine, perméabilité mesurée par la loi de Darcy à l'eau, et module calculé par éléments finis. Le texte de l'article donne :

- les écarts moyens de perméabilité mesurée : 27 % entre gyroïde et Schwarz P, 49 % entre gyroïde et Schwarz D ;
- les modules calculés : Schwarz D 171,37 MPa, gyroïde 145,05 MPa, Schwarz P 103,54 MPa.

Les valeurs absolues de perméabilité ne figurent que sur un graphique, non repris ici. La comparaison porte donc sur les rapports entre architectures, à porosité et cellule identiques.

Scaffold Studio, cellule périodique 32³ (perméabilité) et 24³ (éléments finis), même porosité et même cellule :

| Surface | Mode | Perméabilité (m²) | E*/Es |
| --- | --- | --- | --- |
| Gyroïde | réseau | 6,45 × 10⁻⁸ | 0,063 |
| Gyroïde | feuillet | 1,81 × 10⁻⁸ | 0,106 |
| Diamant (Schwarz D) | réseau | 4,29 × 10⁻⁸ | 0,069 |
| Diamant (Schwarz D) | feuillet | 1,03 × 10⁻⁸ | 0,138 |
| Schwarz P | réseau | 1,10 × 10⁻⁷ | 0,121 |
| Schwarz P | feuillet | 1,69 × 10⁻⁸ | 0,083 |

Rapports de module, rapportés au gyroïde :

| | Castro 2019 | Scaffold Studio, feuillet | Scaffold Studio, réseau |
| --- | --- | --- | --- |
| Schwarz D / gyroïde | 1,18 | 1,29 | 1,09 |
| Schwarz P / gyroïde | 0,71 | 0,78 | 1,91 |

Écarts de perméabilité, rapportés au gyroïde :

| | Castro 2019 (mesure) | Scaffold Studio, feuillet | Scaffold Studio, réseau |
| --- | --- | --- | --- |
| gyroïde et Schwarz D | 49 % | 43 % | 33 % |
| gyroïde et Schwarz P | 27 % | 7 % | 71 % |

Lecture :

- En mode feuillet, l'ordre des rigidités est le même que dans l'étude (Schwarz D, puis gyroïde, puis Schwarz P) et les rapports sont proches (1,29 contre 1,18 ; 0,78 contre 0,71). Le mode réseau donne un Schwarz P bien plus rigide selon l'axe de la cellule, ce qui ne correspond pas à l'étude : les architectures de l'étude se comportent comme des feuillets.
- Pour la perméabilité, l'écart gyroïde et Schwarz D est retrouvé (43 % contre 49 %). L'écart gyroïde et Schwarz P est sous-estimé en feuillet (7 % contre 27 %). Plusieurs causes possibles : épaisseur de paroi imprimée différente de la consigne, rugosité de la résine, effets de bord d'un cube de quatre cellules seulement, débits de 20 à 100 mL/min hors du régime de Stokes supposé par le solveur.
- Le sens de l'écart (lequel des deux est le plus perméable) se lit sur le graphique de l'article et n'est pas vérifié ici.

## 3. Ce qui reste à faire

- Reprendre les valeurs absolues du graphique de Castro 2019 pour une comparaison en m².
- Comparer la rigidité à des essais de compression publiés sur des gyroïdes en Ti-6Al-4V imprimés par fusion laser.
- Mesurer la perméabilité d'éprouvettes exportées depuis l'application, pour boucler la validation.

Les valeurs de l'application restent des estimations de conception, à confirmer par essais.

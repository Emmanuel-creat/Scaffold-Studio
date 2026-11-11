# Scaffold Studio : un banc d'essai numérique pour la conception de scaffolds osseux dans le navigateur

BAILLY emmanuel. Master Bioingénierie des tissus et des implants, Aix-Marseille Université. Note technique, novembre 2026.

## Résumé

La conception d'un scaffold pour l'ingénierie tissulaire osseuse impose de concilier porosité, taille de pore, rigidité, perméabilité, cisaillement pariétal et fabricabilité. Ces grandeurs sont d'ordinaire calculées dans plusieurs logiciels distincts. Scaffold Studio les réunit dans une application web locale, sans serveur de calcul : génération de surfaces minimales triplement périodiques, de treillis et de mousses de Voronoï ; mesures morphologiques par transformée de distance exacte ; homogénéisation par éléments finis voxel ; perfusion par Boltzmann sur réseau D3Q19 à deux temps de relaxation, sur processeur ou carte graphique ; transport d'oxygène, ensemencement et croissance tissulaire pilotée par la courbure. Les solveurs sont vérifiés sur des solutions analytiques (Poiseuille à moins de 1 %, réseau de sphères de Sangani et Acrivos à 0,4 %, borne de Voigt exacte) et comparés à une étude publiée sur trois TPMS à 70 % de porosité. L'outil sert à la conception, à l'enseignement et à la communication scientifique.

**Mots clés :** scaffold osseux, TPMS, perméabilité, Boltzmann sur réseau, homogénéisation, fabrication additive.

## 1. Introduction

Les architectures TPMS (gyroïde, diamant, Schwarz P) se sont imposées avec la fabrication additive des implants poreux : continues, entièrement interconnectées et décrites par une seule équation. Le concepteur doit choisir la surface, le mode (réseau ou feuillet), la cellule et la porosité de façon à :

- offrir des pores d'au moins 100 µm, idéalement 300 à 900 µm, pour la colonisation osseuse ;
- garder un module proche de l'os hôte pour limiter le stress shielding ;
- assurer une perméabilité et un cisaillement compatibles avec la culture en bioréacteur ;
- rester fabricable par le procédé visé.

Les outils existants traitent ces aspects séparément (CAO, maillage, éléments finis, mécanique des fluides). L'objectif est un outil unique, interactif, ouvert et vérifié.

## 2. Méthodes

Les méthodes sont détaillées dans [METHODES.md](METHODES.md). En bref :

- **Géométrie :** seuil par quantile pour atteindre la porosité visée sans itération ; surface nets et lissage de Taubin ; gradients, transitions entre surfaces, opérations booléennes, import STL.
- **Morphologie :** transformée de distance exacte (Felzenszwalb et Huttenlocher), diamètre de passage, tortuosité, courbures moyenne et de Gauss.
- **Mécanique :** éléments finis hexaédriques sur la cellule périodique (24³), gradient conjugué sans assemblage, tenseur effectif, surface d'anisotropie, loi de Gibson-Ashby ajustée.
- **Perfusion :** D3Q19 TRT, Λ = 3/16, rebond à mi-chemin, force volumique ou pression imposée, perméabilité de Darcy ; implémentation WebGPU identique au processeur à 0,004 %.
- **Biologie :** advection-diffusion de l'oxygène avec consommation de Michaelis-Menten, ensemencement par advection et sédimentation, croissance t = d (2R − d) / (2λ).

## 3. Résultats

### 3.1 Vérification

| Cas | Écart |
| --- | --- |
| Poiseuille entre plaques | < 1 % |
| Réseau cubique de sphères | 0,4 % |
| Pression imposée, canal plan | 0,5 % |
| GPU contre processeur | 0,004 % |
| Stratifié, borne de Voigt | exact |

### 3.2 Comparaison de trois TPMS à 70 % de porosité

Mêmes architectures que Castro et al. (2019) : cellule de 3,25 mm, porosité 70 %.

| Surface | Mode | k (m²) | E*/Es |
| --- | --- | --- | --- |
| Gyroïde | feuillet | 1,81 × 10⁻⁸ | 0,106 |
| Schwarz D | feuillet | 1,03 × 10⁻⁸ | 0,138 |
| Schwarz P | feuillet | 1,69 × 10⁻⁸ | 0,083 |

L'ordre des rigidités (Schwarz D, gyroïde, Schwarz P) et leurs rapports (1,29 et 0,78, contre 1,18 et 0,71 dans l'étude) concordent. L'écart de perméabilité entre gyroïde et Schwarz D est retrouvé (43 % contre 49 % mesurés) ; celui entre gyroïde et Schwarz P est sous-estimé (7 % contre 27 %). Détails dans [VALIDATION.md](VALIDATION.md).

### 3.3 Oxygénation

Pour un gyroïde titane de 8 mm à 70 % de porosité, la concentration minimale d'oxygène reste à 196 µM sous perfusion, contre 4,5 µM en culture statique, où un tiers des parois est hypoxique. L'outil illustre ainsi directement l'intérêt d'un bioréacteur à perfusion pour une pièce de cette épaisseur.

### 3.4 Performances

Sur la machine de développement (processeur seul) : champ implicite 96³ en 0,13 s, maillage en 0,2 s, mesures en 0,4 s ; 200 pas de Boltzmann sur 32³ noeuds en 1,2 s sur processeur ; homogénéisation 16³ en 0,2 s par cas. Le suivi est automatisé dans la CI.

## 4. Discussion

**Apports.** Un seul outil, sans installation, relie l'architecture à la mécanique, à l'écoulement et à une biologie simplifiée ; les résultats sont reproductibles (tests automatiques, valeurs de référence, jeu de données ouvert).

**Limites.** Matériau dense idéal (sans rugosité ni défaut d'impression), régime de Stokes, modèles biologiques qualitatifs, comparaison expérimentale limitée aux rapports entre architectures.

**Perspectives.** Valeurs absolues de perméabilité sur éprouvettes imprimées, essais de compression ISO 13314 sur gyroïdes Ti-6Al-4V, intégration de la rugosité mesurée dans les modèles.

## 5. Disponibilité

Code source sous licence MIT : https://github.com/Emmanuel-creat/Scaffold-Studio. Application : https://emmanuel-creat.github.io/Scaffold-Studio/. Jeu de données : `node scripts/dataset.mjs`.

## Références

Voir la liste vérifiée (DOI) dans [METHODES.md](METHODES.md), notamment Castro et al. 2019 (doi:10.3390/ma12081313), Rumpler et al. 2008 (doi:10.1098/rsif.2008.0064), Bidan et al. 2012 (doi:10.1371/journal.pone.0036336), Karageorgiou et Kaplan 2005 (doi:10.1016/j.biomaterials.2005.02.002), Sangani et Acrivos 1982 (doi:10.1016/0301-9322(82)90047-7).

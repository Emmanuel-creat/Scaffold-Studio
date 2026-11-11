# Méthodes

Auteur : BAILLY emmanuel. Version 1.7, novembre 2026. [English version](METHODS.md). Une version illustrée et interactive est intégrée à l'application : bouton Aide, puis « Méthodes illustrées » (fichier `public/methodes.html`).

Chaque section renvoie aux références numérotées en fin de document. Les DOI ont été vérifiés dans Crossref.

## 1. Géométrie

**Surfaces TPMS.** Chaque surface est une fonction implicite g(x, y, z) de période 2π, mise à l'échelle par la taille de cellule a. Le solide est g < t en mode réseau et |g| < t en mode feuillet. Le seuil t est le quantile d'ordre (1 − porosité) des valeurs de g sur une cellule échantillonnée : la porosité visée est atteinte sans itération. Avec un gradient, t est recalculé en chaque point à partir de la porosité locale.

**Treillis et Voronoï.** Pour les treillis (cubique, BCC, FCC, octet), g est la distance au plus proche axe de poutre, calculée après repli de la cellule dans l'octant [0, ½]³ par symétrie. Le seuil donne directement le rayon des poutres. La mousse de Voronoï utilise F3 − F1 (écart entre le premier et le troisième germe le plus proche) sur huit germes perturbés et périodiques : il s'annule le long des arêtes de Voronoï, où trois cellules se rencontrent. Le quantile est pris sur un échantillonnage décalé (suite R3) pour ne pas sous-échantillonner les poutres fines.

**Forme, opérations et transitions.** La forme de la pièce est imposée par intersection avec sa fonction distance signée (maximum des deux champs). Une forme ajoutée est une union (minimum), une forme retirée une différence (maximum avec l'opposé). La transition entre deux surfaces est un mélange des deux champs normalisés, pondéré par le paramètre du gradient.

**Maillage.** L'isosurface est maillée par surface nets : un sommet par cellule de grille traversée, au barycentre des points de passage, deux triangles par arête traversée. Le maillage est fermé et orienté. Un lissage de Taubin [8] (alternance λ, μ) enlève l'effet d'escalier sans rétrécir la pièce. Avant le maillage, les fragments solides détachés du corps principal (bouts de poutres coupés au bord) sont repérés par composantes connexes et vidés.

## 2. Morphologie

- **Porosité :** 1 − volume du maillage / volume de l'éprouvette, volume par le théorème de la divergence.
- **Pores et struts :** transformée de distance euclidienne exacte [2], diamètres aux maxima locaux. L'épaisseur locale sur la surface suit l'idée de Hildebrand et Rüegsegger (plus grande sphère inscrite contenant le point).
- **Interconnectivité :** part du vide atteinte par remplissage depuis l'extérieur.
- **Diamètre de passage :** plus grand diamètre de sphère qui traverse la pièce de bas en haut, par propagation sur la transformée de distance du vide.
- **Courbures :** courbure moyenne H et de Gauss K tirées du gradient et de la hessienne du champ implicite [7]. Une surface minimale a H = 0 et K ≤ 0 ; la part de surface en selle (K < 0) mesure l'écart à ce modèle.
- **Surface accessible aux cellules :** part de la surface qui borde un pore d'au moins 100 µm, seuil souvent cité pour la colonisation osseuse [4].

## 3. Mécanique

**Lois d'échelle.** Gibson-Ashby [1] : E* = C · Es · ρⁿ, σ* = 0,3 · σs · ρ^1,5, avec ρ la densité relative. Valeurs génériques n = 2, C = 1 en réseau (flexion dominante) ; n = 1,5, C = 0,6 en feuillet.

**Éléments finis.** La cellule unité est voxelisée (24³), chaque voxel solide est un hexaèdre à 8 noeuds. Conditions périodiques, six déformations macroscopiques unitaires, gradient conjugué préconditionné (Jacobi) sans assemblage de matrice. Le tenseur effectif C donne les constantes d'ingénierie par inversion (S = C⁻¹). Quatre porosités supplémentaires donnent l'ajustement E*/Es = C · ρⁿ propre à la surface.

**Anisotropie.** Le module dans une direction n est 1/E(n) = a · S · a, a = (n1², n2², n3², n2n3, n1n3, n1n2) en notation de Voigt. La surface d'anisotropie trace E(n) dans toutes les directions ; le rapport Emax / Emin vaut 1 pour un matériau isotrope.

**Essais simulés.** Courbe de compression élastique, plateau et densification (εD = 1 − 1,4 ρ) avec les grandeurs de l'ISO 13314 ; endurance par une loi de Basquin normalisée ; flambement d'Euler des poutres ; résorption par érosion de surface ou hydrolyse en masse.

## 4. Perfusion

Boltzmann sur réseau D3Q19 à deux temps de relaxation (TRT), paramètre magique Λ = 3/16, qui rend la position des parois et donc la perméabilité indépendantes de la viscosité numérique. Rebond à mi-chemin sur les parois. Entraînement par force volumique (équivalente à un gradient de pression) ou par pression imposée en entrée et en sortie. Perméabilité de Darcy k = ν ⟨u⟩ / g convertie en m².

Sans gradient ni forme particulière, le calcul porte sur une cellule périodique (réseau infini). Sinon, toute l'éprouvette est simulée. Le même schéma tourne sur carte graphique (WebGPU, un fil par noeud, propagation en lecture). Validation : Poiseuille (< 1 %), réseau cubique de sphères [5] (0,4 %).

**Cisaillement pariétal :** τ = μ |u(d)| / d à une distance d de la paroi le long de la normale. Plage stimulante issue de la revue [10].

**Fluide non newtonien :** viscosité de Carreau du sang au taux de cisaillement caractéristique des pores [11].

## 5. Biologie

**Oxygène.** État stationnaire de D ∇²c − u · ∇c = q, D = 3 × 10⁻⁹ m²/s, consommation de Michaelis-Menten des cellules adhérentes sur chaque face de paroi, schéma amont, Gauss-Seidel sur-relaxé puis non relaxé près de la convergence. La culture statique reçoit le milieu par ses deux faces.

**Ensemencement.** Cellules injectées à l'entrée, transportées par le champ de vitesse, sédimentation de Stokes à 9 µm/s (cellule de 15 µm), adhésion à la paroi avec une probabilité réglable.

**Croissance tissulaire.** Croissance pilotée par la courbure [3, 6] : dans un pore de rayon local R, un point à distance d de la paroi est comblé au temps d (2R − d) / (2λ), λ étant la vitesse de dépôt.

## 6. Limites

- Les lois d'échelle et l'homogénéisation supposent un matériau dense idéal ; la rugosité et les défauts d'impression baissent la rigidité réelle.
- La perfusion suppose un régime de Stokes ; aux forts débits, l'inertie augmente la perte de charge.
- Les modèles biologiques sont qualitatifs : ils servent à comparer des architectures, pas à prédire une culture.

La comparaison avec des mesures publiées est dans [VALIDATION.md](VALIDATION.md).

## Références

1. Gibson L. J., Ashby M. F. *Cellular Solids: Structure and Properties*, 2e éd. Cambridge University Press, 1997. doi:10.1017/CBO9781139878326
2. Felzenszwalb P. F., Huttenlocher D. P. Distance transforms of sampled functions. *Theory of Computing* 8:415, 2012. doi:10.4086/toc.2012.v008a019
3. Rumpler M. et al. The effect of geometry on three-dimensional tissue growth. *Journal of the Royal Society Interface* 5:1173, 2008. doi:10.1098/rsif.2008.0064
4. Karageorgiou V., Kaplan D. Porosity of 3D biomaterial scaffolds and osteogenesis. *Biomaterials* 26:5474, 2005. doi:10.1016/j.biomaterials.2005.02.002
5. Sangani A. S., Acrivos A. Slow flow through a periodic array of spheres. *International Journal of Multiphase Flow* 8:343, 1982. doi:10.1016/0301-9322(82)90047-7
6. Bidan C. M. et al. How linear tension converts to curvature: geometric control of bone tissue growth. *PLoS ONE* 7:e36336, 2012. doi:10.1371/journal.pone.0036336
7. Goldman R. Curvature formulas for implicit curves and surfaces. *Computer Aided Geometric Design* 22:632, 2005. doi:10.1016/j.cagd.2005.06.005
8. Taubin G. A signal processing approach to fair surface design. *SIGGRAPH 95*, p. 351, 1995. doi:10.1145/218380.218473
9. Castro A. P. G. et al. Permeability versus design in TPMS scaffolds. *Materials* 12:1313, 2019. doi:10.3390/ma12081313
10. McCoy R. J., O'Brien F. J. Influence of shear stress in perfusion bioreactor cultures for the development of three-dimensional bone tissue constructs: a review. *Tissue Engineering Part B* 16:587, 2010. doi:10.1089/ten.teb.2010.0370
11. Cho Y. I., Kensey K. R. Effects of the non-Newtonian viscosity of blood on flows in a diseased arterial vessel. *Biorheology* 28, 1991.
12. Ginzburg I., Verhaeghe F., d'Humières D. Two-relaxation-time lattice Boltzmann scheme. *Communications in Computational Physics* 3, 2008.
13. Hildebrand T., Rüegsegger P. A new method for the model-independent assessment of thickness in three-dimensional images. *Journal of Microscopy* 185, 1997.
14. ISO 13314:2011. Essais mécaniques des métaux, ductilité, essai de compression des métaux poreux et cellulaires.

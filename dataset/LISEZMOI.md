# Jeu de données Scaffold Studio

39 designs générés par `node scripts/dataset.mjs` (Scaffold Studio 1.8.0), auteur BAILLY emmanuel, licence CC BY 4.0.

- `designs.csv` : une ligne par design (8 architectures, mode réseau et feuillet pour les TPMS, porosités 60, 70 et 80 %, cellule de 1,5 mm). Porosité et diamètres mesurés sur un cube de 4,5 mm, soit trois cellules (grille 80³). E relatif = Ez / Es par éléments finis périodiques (20³). Anisotropie de Zener 2 C44 / (C11 − C12). Perméabilité selon z par Boltzmann sur réseau sur la cellule périodique (24³), en m².
- `stl/` : maillages en millimètres, non versionnés (environ 500 Mo) : `node scripts/dataset.mjs` les régénère dans `dataset/stl/`.

Méthodes : [docs/METHODES.md](../docs/METHODES.md). Le dépôt est prêt pour l'archivage Zenodo (`.zenodo.json`), qui attribuera un DOI au jeu de données avec chaque version publiée.

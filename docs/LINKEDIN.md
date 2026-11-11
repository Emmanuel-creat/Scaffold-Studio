# Diffusion : post LinkedIn et vidéo de démonstration

Auteur : BAILLY emmanuel. Rédigé sans emoji, sans tiret long, ton factuel.

## Plan de la vidéo (45 secondes, format 4:5, 1080 × 1350)

Tout se tourne dans l'application, section Studio : format « Portrait 4:5 », rendu réaliste, « Rendu image par image » coché, définition Full HD.

| Temps | Plan | Réglages | Titre incrusté |
| --- | --- | --- | --- |
| 0 à 5 s | Tour complet d'un gyroïde titane, grain de poudre | Modèle « Gyroïde titane », mouvement Tour complet, 5 s | Scaffold Studio |
| 5 à 12 s | Révélation par coupe, carte d'épaisseur locale | Carte « Épaisseur locale », mouvement Révélation par coupe, 7 s | Concevoir un scaffold osseux |
| 12 à 20 s | Perfusion : particules et lignes de courant | Perfusion lancée, lignes de courant, opacité 30 %, Grue montante | Perméabilité calculée en direct |
| 20 à 27 s | Carte d'oxygène, perfusion contre statique | Biologie : Calculer l'oxygène, carte Oxygène dissous | Oxygène au coeur de la pièce |
| 27 à 35 s | Croissance du tissu de J7 à J56 | Biologie : croissance, curseur de jour enregistré en direct | Croissance tissulaire |
| 35 à 41 s | Surface d'anisotropie et carte de von Mises | Éléments finis, surface d'anisotropie, Tour complet | Rigidité par éléments finis |
| 41 à 45 s | Vol à travers les pores | Touche F, puis R | Lien en commentaire |

Montage : enchaîner les sept fichiers MP4 dans n'importe quel éditeur, fondu de 0,3 s, sans musique ou avec une piste libre de droits très discrète. Sous-titres incrustés : les titres suffisent, la vidéo doit se comprendre sans le son.

Image de couverture : rendu 4K au format 4:5, gyroïde titane en coupe avec carte d'épaisseur, titre « Scaffold Studio » et barre d'échelle.

## Post (version française)

J'ai conçu Scaffold Studio, un banc d'essai numérique pour les scaffolds osseux qui tourne entièrement dans le navigateur.

Le problème : pour concevoir un implant poreux, il faut arbitrer entre porosité, taille de pore, rigidité, perméabilité et fabricabilité. D'habitude, cela demande quatre logiciels différents.

Ce que fait l'outil :
- génère gyroïdes, diamants, treillis octet ou mousses de Voronoï, avec gradients et formes d'implants (cage lombaire, cupule, défaut osseux en STL) ;
- calcule la rigidité par éléments finis et la compare à l'os ;
- simule la perfusion du milieu de culture (Boltzmann sur réseau, sur carte graphique) ;
- estime l'oxygène au coeur de la pièce et la croissance du tissu jour après jour ;
- exporte STL, 3MF, Abaqus et un rapport de conception.

Les solveurs sont vérifiés sur des cas analytiques (moins de 1 % d'écart) et comparés à une étude publiée sur trois TPMS.

Projet personnel mené pendant mon master Bioingénierie des tissus et des implants à Aix-Marseille Université. Code ouvert, démo en ligne : lien en commentaire.

Je cherche un poste d'ingénieur R&D en dispositifs médicaux : ravi d'échanger avec les équipes implants, fabrication additive ou biomatériaux.

#ingénierietissulaire #biomatériaux #fabricationadditive #dispositifsmédicaux #medtech

## Post (English version)

I built Scaffold Studio, a digital test bench for bone scaffolds that runs entirely in the browser.

The problem: designing a porous implant means trading off porosity, pore size, stiffness, permeability and printability, usually across four different software tools.

What it does:
- generates gyroids, diamonds, octet lattices or Voronoi foams, with gradients and implant shapes (lumbar cage, acetabular cup, STL bone defect);
- computes stiffness with finite elements and compares it with bone;
- simulates culture medium perfusion (lattice Boltzmann on the GPU);
- estimates oxygen in the core and tissue growth day by day;
- exports STL, 3MF, Abaqus and a design report.

Solvers are checked against analytical cases (under 1 % error) and compared with a published study on three TPMS.

Personal project during my master in Bioengineering of Tissues and Implants at Aix-Marseille Université. Open source, live demo in the comments.

I am looking for an R&D engineer position in medical devices and would be glad to talk with implant, additive manufacturing or biomaterials teams.

#tissueengineering #biomaterials #additivemanufacturing #medicaldevices #medtech

## Premier commentaire

Démo : https://emmanuel-creat.github.io/Scaffold-Studio/
Code : https://github.com/Emmanuel-creat/Scaffold-Studio
Méthodes et validation : https://github.com/Emmanuel-creat/Scaffold-Studio/blob/main/docs/VALIDATION.md

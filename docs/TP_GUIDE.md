# Travaux pratiques : concevoir un scaffold osseux

Public : master de bioingénierie (biomatériaux, implants, ingénierie tissulaire). Durée : 3 heures. Outil : Scaffold Studio dans un navigateur récent, https://emmanuel-creat.github.io/Scaffold-Studio/

Auteur : BAILLY emmanuel.

## Objectifs

À la fin de la séance, l'étudiant sait :

1. relier porosité, taille de pore, rigidité et perméabilité d'une architecture poreuse ;
2. lire une loi de Gibson-Ashby et la comparer à un calcul par éléments finis ;
3. expliquer pourquoi la perfusion améliore l'oxygénation d'un scaffold épais ;
4. justifier un choix d'architecture pour un cahier des charges d'implant donné.

## Rendu attendu

Un compte rendu de 4 pages au plus, avec les tableaux remplis, les captures demandées et la réponse argumentée de la partie 5. Exporter le rapport de conception (bouton Rapport) de la solution finale et le joindre.

## Partie 1. Prise en main (20 min)

1. Ouvrir l'application, suivre la visite guidée (bouton Aide, puis Visite guidée).
2. Charger le modèle « Gyroïde titane (cube 8 mm) ».
3. Ouvrir la palette de commandes (Ctrl+K) et chercher « porosité ». Noter les réglages trouvés.

Question 1.1. Quelle est la différence entre la porosité visée et la porosité mesurée ? D'où vient l'écart ?

## Partie 2. Porosité, pores et rigidité (40 min)

Gyroïde, mode réseau, cellule 1,5 mm, Ti-6Al-4V. Faire varier la porosité visée et remplir le tableau.

| Porosité visée | Porosité mesurée | Pore moyen (µm) | Strut moyen (µm) | E estimé (GPa) |
| --- | --- | --- | --- | --- |
| 50 % | | | | |
| 60 % | | | | |
| 70 % | | | | |
| 80 % | | | | |
| 90 % | | | | |

Question 2.1. Tracer E en fonction de la densité relative ρ = 1 − porosité en échelle log-log. Quelle pente obtient-on ? La comparer à l'exposant n de Gibson-Ashby utilisé par l'application.

Question 2.2. À 70 %, lancer « Calculer par éléments finis ». Comparer le module Ez calculé à l'estimation. Noter l'ajustement E*/Es = C · ρⁿ proposé. Pourquoi les coefficients diffèrent-ils de la loi générique ?

Question 2.3. Afficher la surface d'anisotropie en 3D et noter le rapport Emax / Emin. Le gyroïde est-il isotrope ? Refaire le calcul avec Schwarz P et commenter.

Question 2.4. Dans quelle plage de porosité le module reste-t-il dans celle de l'os spongieux ? Que se passe-t-il pour l'os voisin si l'implant est beaucoup plus rigide (stress shielding) ?

## Partie 3. Perfusion et cisaillement (40 min)

1. Revenir au gyroïde 70 %, lancer la perfusion (barre d'espace) et attendre « Écoulement établi ».
2. Activer la carte de cisaillement et la carte de couleurs en coupe.

| Surface | Mode | Perméabilité (m²) | Perte de charge (Pa) | Surface dans la fenêtre de cisaillement (%) |
| --- | --- | --- | --- | --- |
| Gyroïde | réseau | | | |
| Gyroïde | feuillet | | | |
| Diamant | réseau | | | |
| Schwarz P | réseau | | | |
| Treillis octet | réseau | | | |

Question 3.1. Classer les architectures par perméabilité. Relier ce classement à la taille de pore et au diamètre de passage (Analyses avancées).

Question 3.2. Pourquoi un cisaillement trop fort est-il néfaste ? Trop faible ? Quelle vitesse d'entrée met le plus de surface dans la fenêtre ?

Question 3.3. Comparer vos valeurs aux plages de l'os spongieux (10⁻¹⁰ à 10⁻⁸ m²). Lire `docs/VALIDATION.md` : quelles sont les limites de la comparaison avec des mesures ?

## Partie 4. Oxygène, ensemencement et tissu (40 min)

1. Après la perfusion, ouvrir la section Biologie et lancer « Calculer l'oxygène ».
2. Comparer le profil en perfusion et en culture statique.

Question 4.1. Quelle concentration minimale obtient-on dans chaque cas ? Quelle part des parois est hypoxique en culture statique ? Conclure sur l'intérêt d'un bioréacteur à perfusion.

Question 4.2. Lancer l'ensemencement. Quelle efficacité obtient-on ? Comment varie-t-elle si la probabilité d'adhésion double ?

Question 4.3. Lancer la croissance du tissu et noter le jour où la moitié du volume poreux est comblée. Refaire avec une cellule de 2,5 mm. Expliquer par le modèle de croissance pilotée par la courbure (Rumpler 2008, Bidan 2012).

## Partie 5. Cas de conception (40 min)

Cahier des charges : cage intersomatique lombaire en Ti-6Al-4V imprimée par fusion laser.

- Module apparent entre 1 et 3 GPa.
- Pores d'au moins 400 µm, interconnectivité 100 %.
- Épaisseur minimale compatible avec le procédé.
- Perméabilité supérieure à 10⁻⁹ m².
- Fenêtre centrale pour la greffe osseuse.

Partir du modèle « Cage lombaire ». Utiliser « Viser cette rigidité », les gradients et les formes ajoutées si besoin.

Question 5.1. Donner l'architecture retenue (surface, mode, cellule, porosité, gradient) et le tableau des grandeurs obtenues face au cahier des charges.

Question 5.2. Vérifier la fabricabilité (surplombs, fragments détachés, épaisseur minimale) et commenter l'aperçu des couches.

Question 5.3. Quels essais proposeriez-vous pour valider cette conception (ISO 13314, perméabilité, culture cellulaire) ?

## Pour aller plus loin

- Exporter le maillage voxel Abaqus et refaire l'essai de compression dans un code d'éléments finis.
- Exporter le champ de vitesse VTK et l'ouvrir dans ParaView.
- Tourner une séquence « révélation par coupe » au format 4:5 et la présenter en 30 secondes.

## Éléments de correction pour l'enseignant

- Partie 2 : la pente log-log est proche de 2 en réseau, de 1,5 en feuillet ; l'ajustement par éléments finis donne en général un exposant un peu supérieur à 2 pour le gyroïde réseau (environ 2,1) et un coefficient C inférieur à 1.
- Partie 3 : à porosité égale, le Schwarz P réseau est le plus perméable selon l'axe de sa cellule, les feuillets le sont moins que les réseaux (canaux plus étroits).
- Partie 4 : la culture statique laisse le coeur hypoxique dès quelques millimètres d'épaisseur ; la perfusion maintient une concentration proche de l'entrée.
- Partie 5 : plusieurs solutions sont acceptables ; la justification compte plus que le choix.

# Methods

Author: BAILLY emmanuel. Version 1.7, November 2026. [Version française](METHODES.md). An illustrated, interactive version ships with the application: Help button, then "Méthodes illustrées" (`public/methodes.html`).

Reference numbers point to the list in [METHODES.md](METHODES.md); all DOIs there were checked in Crossref.

## 1. Geometry

**TPMS.** Each surface is an implicit function g(x, y, z) of period 2π scaled by the cell size a. The solid is g < t in network mode and |g| < t in sheet mode. The threshold t is the (1 − porosity) quantile of g sampled over a unit cell, so the target porosity is reached without iteration. With a gradient, t is recomputed at every point from the local porosity.

**Lattices and Voronoi.** For strut lattices (cubic, BCC, FCC, octet), g is the distance to the nearest strut axis after folding the cell into the octant [0, ½]³ by symmetry; the threshold sets the strut radius. The Voronoi foam uses F3 − F1 on eight jittered periodic seeds; it vanishes along Voronoi edges where three cells meet. The quantile uses an R3 low discrepancy offset to avoid aliasing on thin struts.

**Shape, booleans, blends.** The part shape is intersected through its signed distance (maximum). Added shapes are unions (minimum), removed shapes differences. A blend between two surfaces mixes the normalised fields with the gradient parameter.

**Meshing.** Surface nets: one vertex per crossed grid cell, two triangles per crossed edge, giving a closed oriented mesh. Taubin smoothing [8]. Detached solid fragments are found by connected components and removed before meshing.

## 2. Morphology

Porosity from the divergence theorem volume; pore and strut diameters from the exact Euclidean distance transform [2]; interconnectivity by flood fill from outside; throat diameter by propagation on the void distance map; mean and Gaussian curvature from the gradient and Hessian of the implicit field [7]; cell accessible surface bordering pores of at least 100 µm [4].

## 3. Mechanics

Gibson-Ashby scaling [1]. Periodic voxel finite elements on the unit cell (24³, 8 node hexahedra, six unit strains, matrix free Jacobi preconditioned conjugate gradient), giving the effective tensor C and S = C⁻¹. Directional modulus 1/E(n) = a · S · a with a = (n1², n2², n3², n2n3, n1n3, n1n2). Model compression curve with ISO 13314 quantities, Basquin fatigue, Euler buckling, resorption.

## 4. Perfusion

D3Q19 two relaxation time lattice Boltzmann (magic parameter 3/16, viscosity independent permeability) [12], halfway bounce back, body force or imposed pressure, Darcy permeability. Periodic unit cell when possible, whole specimen otherwise, on GPU (WebGPU) or CPU. Validated on Poiseuille flow (< 1 %) and the cubic sphere array [5] (0.4 %). Wall shear τ = μ |u(d)| / d, stimulating range from [10]; Carreau blood viscosity [11].

## 5. Biology

Steady advection diffusion of oxygen with Michaelis-Menten consumption at the walls (D = 3 × 10⁻⁹ m²/s). Seeding by advection and Stokes settling at 9 µm/s with an attachment probability. Curvature driven tissue growth [3, 6]: a point at distance d from the wall of a pore of local radius R fills at time d (2R − d) / (2λ).

## 6. Limits

Scaling laws and homogenisation assume an ideal dense material; roughness and print defects lower the real stiffness. Perfusion assumes Stokes flow. Biological models are qualitative and meant to compare architectures. See [VALIDATION.md](VALIDATION.md).

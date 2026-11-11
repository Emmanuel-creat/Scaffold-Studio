# Specification: Scaffold Studio

Author: BAILLY emmanuel. Version 1.7, November 2026. [Cahier des charges en français](CAHIER_DES_CHARGES.md) (original V1 document).

## 1. Context

In bone tissue engineering, a scaffold is a temporary or permanent porous structure that supports cell colonisation and new bone formation. Triply periodic minimal surface (TPMS) architectures became standard with additive manufacturing: they are continuous, free of sharp corners, fully interconnected and easy to parametrise.

The designer has to reconcile conflicting requirements:

| Requirement | Target range | Consequence of a poor setting |
| --- | --- | --- |
| Porosity | 50 to 90 % (trabecular bone) | Too low: limited colonisation and vascularisation |
| Pore size | about 300 to 900 µm | Too small: poor osteoconduction. Too large: little adhesion surface |
| Stiffness | close to host bone (0.1 to 2 GPa trabecular, 7 to 30 GPa cortical) | Too stiff: stress shielding and bone resorption |
| Permeability | 10⁻¹⁰ to 10⁻⁸ m² (trabecular bone) | Too low: poor nutrient supply to the core |
| Wall shear stress under perfusion | about 0.1 to 10 mPa | Too low: no stimulation. Too high: cell detachment |
| Minimum feature | process dependent (0.15 to 0.4 mm) | Part cannot be manufactured |

## 2. Goal

A single local interactive tool to design an architecture, read its properties immediately, simulate perfusion and biology, then export a printable file. Secondary goal: produce high quality images and videos to communicate on the project.

## 3. Users

- Students and R&D engineers in biomaterials and implantable devices.
- Teachers illustrating the link between architecture and function (see [TP_GUIDE.md](TP_GUIDE.md)).

## 4. Functional requirements

| Ref. | Requirement | Status |
| --- | --- | --- |
| F1 | Choose the architecture: 9 TPMS, network or sheet, strut lattices, Voronoi | Done (1.6) |
| F2 | Set cell size and target porosity; measured porosity within 3 points | Done |
| F3 | Choose the part shape (block, cylinder, cage, cup, STL) | Done (1.1) |
| F4 | Porosity and cell size gradients (axial, radial, spherical, surface, profile, image) | Done (1.6) |
| F5 | Morphology: porosity, pores, struts, specific surface, interconnectivity, throat, tortuosity, curvatures | Done (1.7) |
| F6 | Stiffness by Gibson-Ashby and periodic finite elements, anisotropy | Done (1.7) |
| F7 | Printability check, layers, overhangs, build plate, cost | Done (1.3) |
| F8 | Perfusion, permeability tensor, GPU solver | Done (1.4) |
| F9 | Wall shear map and share of surface in the target window | Done |
| F10 | Oxygen, seeding and tissue growth | Done (1.4) |
| F11 | Exports: STL, 3MF, VTK, Abaqus, CSV, report, PNG, MP4 | Done (1.7) |
| F12 | Representative starting models | Done (11 models) |
| F13 | Project save, shareable link, undo, version history | Done (1.6) |
| F14 | Studio: formats, 4K stills, camera shots, frame by frame MP4 | Done (1.7) |

## 5. Non functional requirements

- Runs locally, no compute server, no account, no data upload; installable and usable offline.
- Heavy computations in Web Workers to keep the interface fluid; GPU used when available.
- Geometry and measurements under 2 seconds at standard resolution on a recent laptop.
- French and English interface, keyboard and screen reader friendly, phone layout.
- Automatic tests (unit, regression, end to end), benchmark and type checking in continuous integration; continuous deployment to GitHub Pages.

## 6. Methods

See [METHODS.md](METHODS.md) and [METHODES.md](METHODES.md) (with verified references).

## 7. Known limits

- Ideal dense material: roughness and print defects are not modelled in mechanics.
- Stokes flow assumed in perfusion.
- Biological models are qualitative.
- Comparison with experiments limited to ratios between architectures (see [VALIDATION.md](VALIDATION.md)).

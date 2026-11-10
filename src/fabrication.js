// Devis preliminaire : couches, temps de fabrication, pieces par plateau, cout (points 52, 54, 60).
import { materialOf, PROCESSES } from './metrics.js';
import { specimenBox } from './tpms.js';

export function buildEstimate(params, m, { gap = 3 } = {}) {
  const proc = PROCESSES[params.process];
  const mat = materialOf(params);
  const [X, Y, Z] = specimenBox(params.shape);
  const layers = Math.ceil(Z / proc.layer);
  const [W, D] = proc.plate || [200, 200];
  const perRow = Math.max(1, Math.floor((W + gap) / (X + gap))), perCol = Math.max(1, Math.floor((D + gap) / (Y + gap)));
  const perPlate = perRow * perCol;
  const areaPerLayer = m.solidVolume / Z; // aire solide moyenne d'une couche (mm2)
  const tLayer = (n) => proc.recoat + (n * areaPerLayer) / proc.scan; // s
  const hoursOne = (layers * tLayer(1)) / 3600;
  const hoursPlate = (layers * tLayer(perPlate)) / 3600;
  const materialCost = (m.mass / 1000) * mat.price; // euros
  const costOne = materialCost + hoursOne * proc.machine;
  const costPlate = materialCost + (hoursPlate * proc.machine) / perPlate;
  return { layers, layer: proc.layer, perPlate, perRow, perCol, plate: [W, D], hoursOne, hoursPlate, materialCost, costOne, costPlate, gap };
}

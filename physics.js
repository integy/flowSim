// Representative constant properties near 20 °C; oil is a generic illustrative light oil.
export const MEDIA = Object.freeze({
  air: Object.freeze({ name: 'Air', density: 1.204, viscosity: 0.0000181, color: '#78e5c5', note: 'Dry air · 20 °C' }),
  water: Object.freeze({ name: 'Water', density: 998, viscosity: 0.001002, color: '#66bcff', note: 'Fresh water · 20 °C · fully submerged' }),
  oil: Object.freeze({ name: 'Oil', density: 850, viscosity: 0.085, color: '#efc27c', note: 'Illustrative light oil · constant properties' }),
});
export function physicalMetrics(medium, speed, length) {
  const { density, viscosity } = MEDIA[medium] || MEDIA.air;
  return { density, viscosity, kinematic: viscosity / density, reynolds: density * speed * length / viscosity };
}
export function simulationParameters(medium, speed) {
  const { kinematic } = physicalMetrics(medium, speed, 1);
  // Log compression deliberately makes differences visible on an affordable grid.
  // This is NOT Reynolds similarity: report SI Re separately from this display model.
  return { inlet: 0.35 + Math.max(0, Math.min(8, speed)) * 0.16,
    viscosity: 0.000035 + 0.00032 * Math.log10(1 + kinematic / 0.000001) };
}

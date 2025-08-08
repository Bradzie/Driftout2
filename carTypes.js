const CAR_TYPES = {
  Speedster: {
    displayName: 'Speedster',
    maxHealth: 10,
    acceleration: 2.4,
    regen: 0.5,
    color: { fill: [20, 20, 200], stroke: [100, 100, 255] },
    shape: 'polygon',
    vertices: [
      { x: 15, y: 0 },
      { x: -10, y: 10 },
      { x: -10, y: -10 }
    ]
  },
  Heavy: {
    displayName: 'Heavy',
    maxHealth: 20,
    acceleration: 0.18,
    regen: 0.25,
    color: { fill: [50, 255, 150], stroke: [0, 150, 50] },
    shape: 'circle',
    radius: 15
  }
}

if (typeof module !== 'undefined') module.exports = CAR_TYPES
if (typeof window !== 'undefined') window.CAR_TYPES = CAR_TYPES
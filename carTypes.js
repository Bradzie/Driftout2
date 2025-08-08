const CAR_TYPES = {
  Speedster: {
    displayName: 'Speedster',
    maxHealth: 10,
    acceleration: 0.015,
    regen: 0.5,
    color: { fill: [20, 20, 200], stroke: [100, 100, 255] },
    shape: 'polygon',
    vertices: [
      { x: 15, y: 0 },
      { x: -10, y: 10 },
      { x: -10, y: -10 }
    ],
    bodyOptions: {
      friction: 0.6,
      restitution: 0.3,
      frictionAir: 0.005,
      density: 0.3
    }
  },
  Heavy: {
    displayName: 'Heavy',
    maxHealth: 20,
    acceleration: 0.12,
    regen: 0.25,
    color: { fill: [50, 255, 150], stroke: [0, 150, 50] },
    shape: 'circle',
    radius: 15,
    bodyOptions: {
      friction: 0.3,
      restitution: 0.9,
      frictionAir: 0.05,
      density: 0.6
    }
  }
}

if (typeof module !== 'undefined') module.exports = CAR_TYPES
if (typeof window !== 'undefined') window.CAR_TYPES = CAR_TYPES
const CAR_TYPES = {
  Speedster: {
    displayName: 'Speedster',
    maxHealth: 10,
    acceleration: 0.015,
    regen: 0.5,
    color: { fill: [47, 152, 206], stroke: [28, 89, 121], strokeWidth: 4 },
    shape: {
      vertices: [
        { x: 15, y: 0 },
        { x: -10, y: 10 },
        { x: -10, y: -10 }
      ],
    },
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
    color: { fill: [157, 230, 160], stroke: [99, 145, 101], strokeWidth: 4 },
    shape: {
      vertices: circleToPolygon(10)
    },
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

function circleToPolygon(radius, segments = 20) {
  const verts = []
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI
    verts.push({
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    })
  }
  return verts
}

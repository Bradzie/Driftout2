const CAR_TYPES = {
  Racer: {
    displayName: 'Racer',
    displaySpeed: 75,
    displayHealth: 30,
    displayHandling: 50,
    maxHealth: 10,
    acceleration: 0.015,
    regen: 0.1,
    ability: 'dash',
    abilityName: 'Dash',
    abilityCooldown: 3000,
    color: { fill: [47, 152, 206], stroke: [28, 89, 121], strokeWidth: 4 },
    shape: {
      vertices: [
        { x: 15, y: 0 },
        { x: -10, y: 10 },
        { x: -10, y: -10 }
      ],
    },
    bodyOptions: {
      friction: 0.3,
      restitution: 0.3,
      frictionAir: 0.005,
      density: 0.3
    }
  },
  Tank: {
    displayName: 'Tank',
    displaySpeed: 30,
    displayHealth: 80,
    displayHandling: 70,
    maxHealth: 20,
    acceleration: 0.12,
    regen: 0.1,
    ability: 'spike_trap',
    abilityName: 'Spike Trap',
    abilityCooldown: 8000,
    color: { fill: [157, 230, 160], stroke: [99, 145, 101], strokeWidth: 4 },
    shape: {
      vertices: circleToPolygon(15, 16)
    },
    bodyOptions: {
      friction: 0.6,
      restitution: 0.9,
      frictionAir: 0.025,
      density: 0.6
    }
  },
  Balanced: {
    displayName: 'Bullet',
    displaySpeed: 85,
    displayHealth: 50,
    displayHandling: 20,
    maxHealth: 16,
    acceleration: 0.01,
    regen: 0.1,
    ability: 'dash',
    abilityName: 'Dash',
    abilityCooldown: 3000,
    color: { fill: [255, 165, 0], stroke: [204, 132, 0], strokeWidth: 4 },
    shape: {
      vertices: [
        { x: 12, y: 3 },
        { x: 12, y: -3 },
        { x: 8, y: -6 },
        { x: -12, y: -6 },
        { x: -12, y: 6 },
        { x: 8, y: 6 }
      ]
    },
    bodyOptions: {
      friction: 0.6,
      restitution: 1,
      frictionAir: 0.005,
      density: 0.5
    }
  }
}

if (typeof module !== 'undefined') module.exports = CAR_TYPES
if (typeof window !== 'undefined') window.CAR_TYPES = CAR_TYPES

function circleToPolygon(radius, segments = 16) {
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

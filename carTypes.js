const CAR_TYPES = {
  Slipstream: {
    displayName: 'Slipstream',
    displaySpeed: 75,
    displayHealth: 25,
    displayHandling: 40,
    maxHealth: 8,
    acceleration: 0.015,
    regen: 0.05,
    color: { fill: [47, 152, 206], stroke: [28, 89, 121], strokeWidth: 4 },
    shape: {
      vertices: [
        { x: 15, y: 0 },
        { x: -15, y: 9 },
        { x: -15, y: -9 }
      ],
    },
    bodyOptions: {
      friction: 0.3,
      restitution: 0.3,
      frictionAir: 0.004,
      density: 0.3
    },
    upgrades: {
      maxHealth: {
        name: 'Health',
        amount: 2.25,
        maxUpgrades: 6,
        color: '#ef4444' // red
      },
      acceleration: {
        name: 'Speed',
        amount: 0.003,
        maxUpgrades: 8,
        color: '#3b82f6' // blue
      },
      regen: {
        name: 'Regen',
        amount: 0.05,
        maxUpgrades: 6,
        color: '#10b981' // green
      }
    }
  },
  Tank: {
    displayName: 'Tank',
    displaySpeed: 30,
    displayHealth: 80,
    displayHandling: 70,
    maxHealth: 20,
    acceleration: 0.12,
    regen: 0.05,
    color: { fill: [157, 230, 160], stroke: [99, 145, 101], strokeWidth: 4 },
    shape: {
      vertices: circleToPolygon(15, 16)
    },
    bodyOptions: {
      friction: 0.6,
      restitution: 0.9,
      frictionAir: 0.025,
      density: 0.6
    },
    upgrades: {
      maxHealth: {
        name: 'Health',
        amount: 2,
        maxUpgrades: 8,
        color: '#ef4444' // red
      },
      density: {
        name: 'Size',
        amount: 0.15,
        maxUpgrades: 6,
        color: '#8b5cf6' // purple
      },
      regen: {
        name: 'Regen',
        amount: 0.1,
        maxUpgrades: 4,
        color: '#10b981' // green
      }
    }
  },
  Bullet: {
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
    },
    upgrades: {
      acceleration: {
        name: 'Speed',
        amount: 10,
        maxUpgrades: 4,
        color: '#3b82f6' // blue
      },
      regen: {
        name: 'Regen',
        amount: 0.1,
        maxUpgrades: 2,
        color: '#10b981' // green
      },
      abilityCooldown: {
        name: 'Dash',
        amount: -500,
        maxUpgrades: 3,
        color: '#f59e0b' // orange
      }
    }
  },
  Prankster: {
    displayName: 'Prankster',
    displaySpeed: 45,
    displayHealth: 35,
    displayHandling: 60,
    maxHealth: 12,
    acceleration: 0.04,
    regen: 0.1,
    ability: 'spike_trap',
    abilityName: 'Trap',
    abilityCooldown: 8000,
    color: { fill: [183, 100, 255], stroke: [138, 2, 255], strokeWidth: 2 },
    shape: {
      vertices: [
        { x: 10, y: 10 },
        { x: -10, y: 10 },
        { x: -10, y: -10 },
        { x: -6, y: -10 },
        { x: -6, y: -16 },
        { x: 6, y: -16 },
        { x: 6, y: -10 },
        { x: 10, y: -10 }
      ]
    },
    bodyOptions: {
      friction: 0.8,
      restitution: 0.3,
      frictionAir: 0.02,
      density: 0.3
    },
    upgrades: {
      maxHealth: {
        name: 'Health',
        amount: 2,
        maxUpgrades: 4,
        color: '#ef4444' // red
      },
      acceleration: {
        name: 'Speed',
        amount: 6,
        maxUpgrades: 3,
        color: '#3b82f6' // blue
      },
      abilityCooldown: {
        name: 'Trap',
        amount: -1000,
        maxUpgrades: 2,
        color: '#ec4899' // pink
      }
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

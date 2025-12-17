const CAR_TYPES = {
  Racer: {
    displayName: 'Racer',
    displaySpeed: 50,
    displayHealth: 40,
    displayHandling: 50,
    maxHealth: 10,
    acceleration: 0.012,
    boost: 50,
    regen: 0.05,
    color: { fill: [255, 95, 95], stroke: [153, 57, 57], strokeWidth: 4 },
    shapes: [
      {
        vertices: [
          { x: 12, y: 0 },
          { x: -12, y: 11 },
          { x: -12, y: -11 }
        ],
        bodyOptions: {
          friction: 0.5,
          restitution: 0.5,
          density: 0.45
        }
      }
    ],
    bodyOptions: {
      frictionAir: 0.0014
    },
    upgrades: {
      maxHealth: {
        name: 'Health',
        amount: 2,
        maxUpgrades: 6,
        color: '#ef4444' // red
      },
      acceleration: {
        name: 'Speed',
        amount: 0.00175,
        maxUpgrades: 8,
        color: '#3b82f6' // blue
      },
      regen: {
        name: 'Regen',
        amount: 0.04,
        maxUpgrades: 6,
        color: '#10b981' // green
      }
    }
  },
  Sprint: {
    displayName: 'Sprint',
    displaySpeed: 75,
    displayHealth: 25,
    displayHandling: 40,
    maxHealth: 6,
    acceleration: 0.012,
    boost: 60,
    regen: 0.05,
    color: { fill: [47, 152, 206], stroke: [28, 89, 121], strokeWidth: 4 },
    shapes: [
      {
        vertices: [
          { x: 15, y: 0 },
          { x: -15, y: 9 },
          { x: -15, y: -9 }
        ],
        bodyOptions: {
          friction: 0.6,
          restitution: 0.3,
          density: 0.3
        }
      }
    ],
    bodyOptions: {
      frictionAir: 0.0001
    },
    upgrades: {
      maxHealth: {
        name: 'Health',
        amount: 1.75,
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
    maxHealth: 16,
    acceleration: 0.025,
    boost: 40,
    regen: 0.05,
    color: { fill: [157, 230, 160], stroke: [99, 145, 101], strokeWidth: 4 },
    shapes: [
      {
        vertices: circleToPolygon(15, 8),
        bodyOptions: {
          friction: 0.6,
          restitution: 0.9,
          density: 0.6
        }
      }
    ],
    bodyOptions: {
      frictionAir: 0.0008
    },
    upgrades: {
      maxHealth: {
        name: 'Health',
        amount: 2,
        maxUpgrades: 8,
        color: '#ef4444' // red
      },
      size: {
        name: 'Size',
        amount: 0.07,
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
    maxHealth: 12,
    acceleration: 0.01,
    boost: 75,
    regen: 0.1,
    ability: 'dash',
    abilityName: 'Dash',
    abilityCooldown: 6000,
    color: { fill: [255, 165, 0], stroke: [204, 132, 0], strokeWidth: 4 },
    shapes: [
      {
        vertices: [
          { x: 12, y: 3 },
          { x: 12, y: -3 },
          { x: 8, y: -6 },
          { x: -12, y: -6 },
          { x: -12, y: 6 },
          { x: 8, y: 6 }
        ],
        bodyOptions: {
          friction: 0.6,
          restitution: 1,
          density: 0.5
        }
      }
    ],
    bodyOptions: {
      frictionAir: 0.005
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
    maxHealth: 8,
    acceleration: 0.04,
    boost: 50,
    regen: 0.1,
    ability: 'spike_trap',
    abilityName: 'Trap',
    abilityCooldown: 8000,
    color: { fill: [183, 100, 255], stroke: [138, 2, 255], strokeWidth: 2 },
    shapes: [
      {
        vertices: [
          { x: 10, y: 10 },
          { x: -10, y: 10 },
          { x: -10, y: -10 },
          { x: -6, y: -10 },
          { x: -6, y: -16 },
          { x: 6, y: -16 },
          { x: 6, y: -10 },
          { x: 10, y: -10 }
        ],
        bodyOptions: {
          friction: 0.8,
          restitution: 0.3,
          density: 0.3
        }
      }
    ],
    bodyOptions: {
      frictionAir: 0.02
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
  },
  Hammer: {
    displayName: 'Hammer',
    displaySpeed: 35,
    displayHealth: 40,
    displayHandling: 55,
    maxHealth: 8,
    acceleration: 0.02,
    boost: 50,
    regen: 0.05,
    color: { fill: [150, 150, 150], stroke: [100, 100, 100], strokeWidth: 4 },
    shapes: [
      {
        vertices: [
          { x: 12, y: 30 },
          { x: 20, y: 30 },
          { x: 20, y: -30 },
          { x: 12, y: -30 }
        ],
        bodyOptions: {
          friction: 0.1,
          restitution: 2,
          density: 0.8
        },
        color: { fill: [200, 200, 200], stroke: [120, 120, 120], strokeWidth: 4 }
      },
      {
        vertices: [
          { x: 12, y: -5 },
          { x: 12, y: 5 },
          { x: -8, y: 5 },
          { x: -8, y: -5 }
        ],
        bodyOptions: {
          friction: 0.8,
          restitution: 0.2,
          density: 0.2
        },
        color: { fill: [150, 150, 150], stroke: [100, 100, 100], strokeWidth: 4 }
      }
    ],
    bodyOptions: {
      frictionAir: 0.012
    },
    upgrades: {
      maxHealth: {
        name: 'Health',
        amount: 2,
        maxUpgrades: 6,
        color: '#ef4444'
      },
      acceleration: {
        name: 'Speed',
        amount: 0.00175,
        maxUpgrades: 8,
        color: '#3b82f6'
      },
      regen: {
        name: 'Regen',
        amount: 0.04,
        maxUpgrades: 6,
        color: '#10b981'
      }
    }
  },
  Boomer: {
    displayName: 'Boomer',
    displaySpeed: 35,
    displayHealth: 30,
    displayHandling: 45,
    maxHealth: 8,
    acceleration: 0.02,
    boost: 45,
    regen: 0.05,
    ability: 'cannon',
    abilityName: 'Cannon',
    abilityCooldown: 4000,
    color: { fill: [80, 80, 120], stroke: [50, 50, 80], strokeWidth: 4 },
    shapes: [
      {
        vertices: [
          { x: 11, y: -9 },
          { x: 11, y: 9 },
          { x: -11, y: 6 },
          { x: -11, y: -6 }
        ],
        bodyOptions: {
          friction: 0.6,
          restitution: 0.4,
          density: 0.5,
        }
      }
    ],
    bodyOptions: {
      frictionAir: 0.01
    },
    upgrades: {
      regen: {
        name: 'Regen',
        amount: 0.05,
        maxUpgrades: 5,
        color: '#10b981'
      },
      acceleration: {
        name: 'Speed',
        amount: 0.003,
        maxUpgrades: 5,
        color: '#6e60e7ff'
      },
      projectileSpeed: {
        name: 'Projectile Speed',
        amount: 0.15,
        maxUpgrades: 5,
        color: '#0e3c85ff'
      },
      abilityCooldown: {
        name: 'Fire Rate',
        amount: -400,
        maxUpgrades: 4,
        color: '#f59e0b'
      },
      projectileDensity: {
        name: 'Power',
        amount: 0.05,
        maxUpgrades: 5,
        color: '#8b5cf6'
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

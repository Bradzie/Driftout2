const Ability = require('./Ability');
const Matter = require('matter-js');
const { v4: uuidv4 } = require('uuid');

class SpikeTrapAbility extends Ability {
  constructor() {
    super({
      id: 'spike_trap',
      name: 'Spike Trap',
      cooldown: 8000, // 8 seconds
      duration: 30000 // 30 seconds trap lifetime
    });
    
    this.damage = 5;
    this.trapRadius = 12;
    this.maxTrapsPerPlayer = 3;
  }

  activate(car, world, gameState) {
    const currentTime = Date.now();
    
    if (!this.canUse(car, currentTime)) {
      return { 
        success: false, 
        reason: 'cooldown',
        remainingCooldown: this.getRemainingCooldown(currentTime)
      };
    }
    const playerTraps = gameState.abilityObjects.filter(obj => 
      obj.type === 'spike_trap' && obj.createdBy === car.id
    );
    
    if (playerTraps.length >= this.maxTrapsPerPlayer) {
      const oldestTrap = playerTraps.sort((a, b) => a.createdAt - b.createdAt)[0];
      Matter.World.remove(world, oldestTrap.body);
      const index = gameState.abilityObjects.indexOf(oldestTrap);
      if (index > -1) {
        gameState.abilityObjects.splice(index, 1);
      }
    }

    const backwardOffset = 20;
    const position = {
      x: car.body.position.x - Math.cos(car.body.angle) * backwardOffset,
      y: car.body.position.y - Math.sin(car.body.angle) * backwardOffset
    };
    const spikeBody = this.createSpikeTrap(position, world, car.id);
    
    const throwForce = 0.6;
    const backwardForce = {
      x: -Math.cos(car.body.angle) * throwForce,
      y: -Math.sin(car.body.angle) * throwForce
    };
    Matter.Body.applyForce(spikeBody, spikeBody.position, backwardForce);
    
    const trapObject = {
      id: uuidv4(),
      type: 'spike_trap',
      body: spikeBody,
      abilityId: this.id,
      createdBy: car.id,
      createdAt: currentTime,
      expiresAt: currentTime + this.duration,
      damage: this.damage,
      position: position,
      radius: this.trapRadius
    };
    
    gameState.abilityObjects.push(trapObject);

    this.lastUsed = currentTime;

    return { 
      success: true, 
      type: 'spike_trap',
      position: position,
      trapId: trapObject.id,
      duration: this.duration,
      serverTime: currentTime
    };
  }

  createSpikeTrap(position, world, ownerId) {
    const radius = this.trapRadius;
    const innerRadius = radius * 0.4;
    const vertices = [];
    
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      vertices.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
      const innerAngle = angle + Math.PI / 3;
      vertices.push({
        x: Math.cos(innerAngle) * innerRadius,
        y: Math.sin(innerAngle) * innerRadius
      });
    }

    const spikeBody = Matter.Bodies.fromVertices(
      position.x, 
      position.y, 
      [vertices],
      {
        isSensor: false,
        isStatic: false,
        label: 'spike-trap',
        ownerId: ownerId,
        render: {
          fillStyle: '#B764FF',
          strokeStyle: '#fc4848ff',
          lineWidth: 3
        },
        friction: 0,
        frictionAir: 0.01,
        restitution: 0.1,
        density: 0.6,
      },
      true
    );
    
    Matter.World.add(world, spikeBody);
    return spikeBody;
  }

  static handleCollision(trap, car) {
    if (trap.createdBy === car.id) {
      return false;
    }

    if (car.isGhost || car.godMode) {
      return false;
    }

    const now = Date.now();
    if (!car.trapDamageHistory) {
      car.trapDamageHistory = new Map();
    }
    
    const lastDamage = car.trapDamageHistory.get(trap.id);
    const damageCooldown = 1000;
    
    if (lastDamage && (now - lastDamage) < damageCooldown) {
      return false;
    }

    car.currentHealth -= trap.damage;
    car.trapDamageHistory.set(trap.id, now);
    if (car.currentHealth <= 0)
      car.justCrashed = true;
    
    return true;
  }


}

module.exports = SpikeTrapAbility;
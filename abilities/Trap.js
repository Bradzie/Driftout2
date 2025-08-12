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

    const position = { x: car.body.position.x, y: car.body.position.y };
    const spikeBody = this.createSpikeTrap(position, world, car.id);
    
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
      duration: this.duration
    };
  }

  createSpikeTrap(position, world, ownerId) {
    const spikeBody = Matter.Bodies.circle(
      position.x, 
      position.y, 
      this.trapRadius, 
      {
        isSensor: true,
        isStatic: true,
        label: 'spike-trap',
        ownerId: ownerId,
        render: {
          fillStyle: '#ff4757',
          strokeStyle: '#2f3542',
          lineWidth: 2
        }
      }
    );
    
    Matter.World.add(world, spikeBody);
    return spikeBody;
  }

  static handleCollision(trap, car) {
    if (trap.createdBy === car.id) {
      console.log(`Blocked damage to trap owner: ${car.id}`);
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
    
    console.log(`Applying spike damage to car ${car.id} from trap ${trap.id} (owner: ${trap.createdBy})`);

    car.currentHealth -= trap.damage;
    car.trapDamageHistory.set(trap.id, now);
    
    
    return true;
  }


}

module.exports = SpikeTrapAbility;
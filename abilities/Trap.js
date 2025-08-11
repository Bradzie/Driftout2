const Ability = require('./Ability');
const Matter = require('matter-js');
const { v4: uuidv4 } = require('uuid');

class SpikeTrapAbility extends Ability {
  constructor() {
    super({
      id: 'spike_trap',
      name: 'Spike Trap',
      cooldown: 8000, // 8 seconds
      duration: 15000 // 15 seconds trap lifetime
    });
    
    this.damage = 15;
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
    
    car.spikeHitEffect = {
      active: true,
      startTime: now,
      duration: 200,
      trapId: trap.id
    };
    
    return true;
  }

  update(car, world, gameState, dt) {
    if (car.spikeHitEffect && car.spikeHitEffect.active) {
      const elapsed = Date.now() - car.spikeHitEffect.startTime;
      if (elapsed > car.spikeHitEffect.duration) {
        car.spikeHitEffect.active = false;
      }
    }
  }

  render(ctx, abilityObject, scale, centerX, centerY, me) {
    if (!abilityObject || abilityObject.type !== 'spike_trap') return;

    const dx = abilityObject.position.x - (me ? me.x : 0);
    const dy = abilityObject.position.y - (me ? me.y : 0);
    const screenX = centerX + dx * scale;
    const screenY = centerY - dy * scale;
    const radius = abilityObject.radius * scale;

    const now = Date.now();
    const age = now - abilityObject.createdAt;
    const lifetime = abilityObject.expiresAt - abilityObject.createdAt;
    const ageProgress = age / lifetime;

    const pulseScale = 1 + Math.sin(now * 0.01) * 0.1;
    const alpha = Math.max(0.3, 1 - ageProgress * 0.5);

    ctx.save();
    ctx.globalAlpha = alpha;
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius * pulseScale, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4757';
    ctx.fill();
    ctx.strokeStyle = '#2f3542';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
    
    const spikes = 8;
    for (let i = 0; i < spikes; i++) {
      const angle = (i / spikes) * Math.PI * 2;
      const innerRadius = radius * 0.3;
      const outerRadius = radius * 0.8 * pulseScale;
      
      const innerX = screenX + Math.cos(angle) * innerRadius;
      const innerY = screenY + Math.sin(angle) * innerRadius;
      const outerX = screenX + Math.cos(angle) * outerRadius;
      const outerY = screenY + Math.sin(angle) * outerRadius;
      
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(outerX, outerY);
      ctx.strokeStyle = '#2f3542';
      ctx.lineWidth = 3 * scale;
      ctx.stroke();
    }
    
    ctx.restore();
  }

  static renderHitEffect(ctx, car, scale, centerX, centerY, me) {
    if (!car.spikeHitEffect || !car.spikeHitEffect.active) return;

    const dx = car.x - (me ? me.x : 0);
    const dy = car.y - (me ? me.y : 0);
    const screenX = centerX + dx * scale;
    const screenY = centerY - dy * scale;

    const elapsed = Date.now() - car.spikeHitEffect.startTime;
    const progress = elapsed / car.spikeHitEffect.duration;
    const alpha = 1 - progress;

    ctx.save();
    ctx.globalAlpha = alpha;
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, 25 * scale * (1 + progress), 0, Math.PI * 2);
    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 4 * scale;
    ctx.stroke();
    
    ctx.restore();
  }
}

module.exports = SpikeTrapAbility;
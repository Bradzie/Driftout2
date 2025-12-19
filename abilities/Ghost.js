const Ability = require('./Ability');
const Matter = require('matter-js');

class GhostModeAbility extends Ability {
  constructor() {
    super({
      id: 'ghost_mode',
      name: 'Ghost Mode',
      cooldown: 15000,
      duration: 3000 // 3 seconds of ghost mode
    });
    
    this.ghostAlpha = 0.5; // transparency when ghosted
    this.originalCollisionMask = null; // og collision settings
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

    if (car.isGhost) {
      return {
        success: false,
        reason: 'already_active'
      };
    }

    this.originalCollisionMask = car.body.collisionFilter.mask;
    
    car.isGhost = true;
    car.ghostStartTime = currentTime;
    car.ghostExpiresAt = currentTime + this.duration;

    car.body.collisionFilter = {
      ...car.body.collisionFilter,
      mask: car.body.collisionFilter.mask & ~0x0002 // remove wall collision
    };


    this.lastUsed = currentTime;

    return { 
      success: true, 
      type: 'ghost_mode',
      duration: this.duration,
      expiresAt: car.ghostExpiresAt,
      serverTime: currentTime
    };
  }

  update(car, world, gameState, dt) {
    if (!car.isGhost) return;

    const currentTime = Date.now();

    if (currentTime >= car.ghostExpiresAt) {
      this.deactivate(car, world, gameState);
      return;
    }
  }

  deactivate(car, world, gameState) {
    if (!car.isGhost) return;

    if (this.originalCollisionMask !== null) {
      car.body.collisionFilter = {
        ...car.body.collisionFilter,
        mask: this.originalCollisionMask
      };
    }

    car.isGhost = false;
    car.ghostStartTime = undefined;
    car.ghostExpiresAt = undefined;
  }


  static canPhaseThrough(car, otherBody) {
    if (!car.isGhost) return false;
    return otherBody.isStatic || otherBody.label.includes('wall');
  }
}

module.exports = GhostModeAbility;
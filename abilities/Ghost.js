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

    car.ghostEffect = {
      active: true,
      startTime: currentTime,
      duration: this.duration,
      pulsePhase: 0
    };

    this.lastUsed = currentTime;

    return { 
      success: true, 
      type: 'ghost_mode',
      duration: this.duration,
      expiresAt: car.ghostExpiresAt
    };
  }

  update(car, world, gameState, dt) {
    if (!car.isGhost) return;

    const currentTime = Date.now();

    if (currentTime >= car.ghostExpiresAt) {
      this.deactivate(car, world, gameState);
      return;
    }

    if (car.ghostEffect) {
      car.ghostEffect.pulsePhase += dt * 8;

      const remaining = car.ghostExpiresAt - currentTime;
      if (remaining < 1000) {
        car.ghostEffect.warning = true;
        car.ghostEffect.warningIntensity = 1 - (remaining / 1000);
      }
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

    if (car.ghostEffect) {
      car.ghostEffect.active = false;
      car.ghostEffect.fadeOut = {
        startTime: Date.now(),
        duration: 200
      };
    }

    console.log(`Car ${car.id} exited ghost mode`);
  }

  render(ctx, car, scale, centerX, centerY, me) {
    if (car.ghostEffect && car.ghostEffect.fadeOut) {
      const elapsed = Date.now() - car.ghostEffect.fadeOut.startTime;
      if (elapsed > car.ghostEffect.fadeOut.duration) {
        car.ghostEffect = undefined;
        return;
      }
    }

    if (!car.ghostEffect) return;

    const dx = car.x - (me ? me.x : 0);
    const dy = car.y - (me ? me.y : 0);
    const screenX = centerX + dx * scale;
    const screenY = centerY - dy * scale;

    const currentTime = Date.now();
    
    ctx.save();

    let alpha = this.ghostAlpha;
    
    if (car.ghostEffect.fadeOut) {
      const fadeProgress = (currentTime - car.ghostEffect.fadeOut.startTime) / car.ghostEffect.fadeOut.duration;
      alpha *= (1 - fadeProgress);
    } else if (car.ghostEffect.active) {
      const pulse = Math.sin(car.ghostEffect.pulsePhase) * 0.2 + 0.8;
      alpha *= pulse;
      
      if (car.ghostEffect.warning) {
        const flashSpeed = 10 + car.ghostEffect.warningIntensity * 20;
        const flash = Math.sin(currentTime * flashSpeed * 0.01) * 0.3 + 0.7;
        alpha *= flash;
      }
    }

    const auraRadius = 30 * scale;
    const gradient = ctx.createRadialGradient(
      screenX, screenY, 0,
      screenX, screenY, auraRadius
    );
    
    const ghostColor = car.ghostEffect.warning ? '100, 200, 255' : '150, 200, 255';
    gradient.addColorStop(0, `rgba(${ghostColor}, ${alpha * 0.3})`);
    gradient.addColorStop(0.7, `rgba(${ghostColor}, ${alpha * 0.1})`);
    gradient.addColorStop(1, `rgba(${ghostColor}, 0)`);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, auraRadius, 0, Math.PI * 2);
    ctx.fill();

    const particleCount = 6;
    for (let i = 0; i < particleCount; i++) {
      const angle = (car.ghostEffect.pulsePhase + i * Math.PI * 2 / particleCount) % (Math.PI * 2);
      const distance = 20 * scale + Math.sin(car.ghostEffect.pulsePhase + i) * 5 * scale;
      const particleX = screenX + Math.cos(angle) * distance;
      const particleY = screenY + Math.sin(angle) * distance;
      const particleSize = (2 + Math.sin(car.ghostEffect.pulsePhase * 2 + i) * 1) * scale;
      
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = `rgba(${ghostColor}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
      ctx.fill();
    }

    if (car.ghostEffect.warning && car === me) {
      ctx.globalAlpha = car.ghostEffect.warningIntensity;
      ctx.fillStyle = '#ff6b6b';
      ctx.font = `${16 * Math.min(scale, 1)}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('GHOST MODE ENDING!', screenX, screenY - 40 * scale);
    }

    ctx.restore();
  }

  static canPhaseThrough(car, otherBody) {
    if (!car.isGhost) return false;
    return otherBody.isStatic || otherBody.label.includes('wall');
  }
}

module.exports = GhostModeAbility;
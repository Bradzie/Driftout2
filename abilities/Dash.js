const Ability = require('./Ability');
const Matter = require('matter-js');

class DashAbility extends Ability {
  constructor() {
    super({
      id: 'dash',
      name: 'Dash',
      cooldown: 6000,
    });
    
    this.dashPower = 0.5;
    this.minSpeed = 0.1;
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

    const angle = car.body.angle;
    const velocity = car.body.velocity;
    const currentSpeed = Math.hypot(velocity.x, velocity.y);
    
    const dashForce = {
      x: Math.cos(angle) * this.dashPower,
      y: Math.sin(angle) * this.dashPower
    };

    Matter.Body.applyForce(car.body, car.body.position, dashForce);
    
    car.dashEffect = {
      active: true,
      startTime: currentTime,
      duration: 300
    };

    this.lastUsed = currentTime;

    return { 
      success: true, 
      type: 'dash',
      force: dashForce,
      position: { x: car.body.position.x, y: car.body.position.y },
      angle: angle
    };
  }

  update(car, world, gameState, dt) {
    if (car.dashEffect && car.dashEffect.active) {
      const elapsed = Date.now() - car.dashEffect.startTime;
      if (elapsed > car.dashEffect.duration) {
        car.dashEffect.active = false;
      }
    }
  }

  render(ctx, car, scale, centerX, centerY, me) {
    if (!car.dashEffect || !car.dashEffect.active) return;

    const dx = car.x - (me ? me.x : 0);
    const dy = car.y - (me ? me.y : 0);
    const screenX = centerX + dx * scale;
    const screenY = centerY - dy * scale;

    const elapsed = Date.now() - car.dashEffect.startTime;
    const progress = Math.min(elapsed / car.dashEffect.duration, 1);
    const alpha = 1 - progress;

    ctx.save();
    ctx.globalAlpha = alpha * 0.7;

    for (let i = 0; i < 3; i++) {
      const offset = (i + 1) * 15 * scale;
      const trailX = screenX - Math.cos(car.angle) * offset;
      const trailY = screenY + Math.sin(car.angle) * offset;
      
      ctx.beginPath();
      ctx.arc(trailX, trailY, (8 - i * 2) * scale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 200, 255, ${alpha * (1 - i * 0.3)})`;
      ctx.fill();
    }
    
    ctx.restore();
  }

  getClientData() {
    return {
      ...super.getClientData(),
      dashPower: this.dashPower
    };
  }
}

module.exports = DashAbility;
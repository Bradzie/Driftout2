const Ability = require('./Ability');
const Matter = require('matter-js');

class DashAbility extends Ability {
  constructor() {
    super({
      id: 'dash',
      name: 'Dash',
      cooldown: 6000,
    });
    
    this.dashPower = 2;
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

    this.lastUsed = currentTime;

    return { 
      success: true, 
      type: 'dash',
      force: dashForce,
      position: { x: car.body.position.x, y: car.body.position.y },
      angle: angle
    };
  }


  getClientData() {
    return {
      ...super.getClientData(),
      dashPower: this.dashPower
    };
  }
}

module.exports = DashAbility;
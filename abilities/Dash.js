const Ability = require('./Ability');
const Matter = require('matter-js');

class DashAbility extends Ability {
  constructor() {
    super({
      id: 'dash',
      name: 'Dash',
      cooldown: 6000,
      usesChargeSystem: true,
      maxCharge: 100,
      baseRegenRate: 7,
      minChargeToUse: 25,
      maxChargeToUse: 80,
      chargeTime: 1200
    });

    this.baseDashPower = 1.5;
    this.minSpeed = 0.1;
  }

  activate(car, world, gameState) {
    const currentTime = Date.now();

    const chargeUsed = this.calculateChargeUsage(car, currentTime);

    if (!car.chargeState || car.chargeState.current < chargeUsed) {
      return {
        success: false,
        reason: 'low_charge',
        currentCharge: car.chargeState ? car.chargeState.current : 0,
        requiredCharge: chargeUsed
      };
    }

    car.chargeState.current -= chargeUsed;

    const chargeScale = this.getChargeScale(chargeUsed);

    const dashPower = this.baseDashPower * (0.3 + (chargeScale * 0.5) + (chargeScale * chargeScale * 1.2));

    const angle = car.body.angle;

    const dashForce = {
      x: Math.cos(angle) * dashPower,
      y: Math.sin(angle) * dashPower
    };

    Matter.Body.applyForce(car.body, car.body.position, dashForce);

    this.lastUsed = currentTime;

    return {
      success: true,
      type: 'dash',
      force: dashForce,
      position: { x: car.body.position.x, y: car.body.position.y },
      serverTime: currentTime,
      angle: angle,
      chargeUsed: chargeUsed
    };
  }

  update(car, world, gameState, dt) {
    super.update(car, world, gameState, dt);
  }

  getClientData() {
    return {
      ...super.getClientData(),
      dashPower: this.dashPower
    };
  }
}

module.exports = DashAbility;
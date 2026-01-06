const Ability = require('./Ability');
const Matter = require('matter-js');

class DashAbility extends Ability {
  constructor() {
    super({
      id: 'dash',
      name: 'Dash',
      cooldown: 6000, // Not actively used for charge-based

      // Charge system configuration
      usesChargeSystem: true,
      maxCharge: 100,
      baseRegenRate: 7, // Charge per second (higher than cannon for mobility)
      minChargeToUse: 25, // Minimum for quick repositioning
      maxChargeToUse: 80, // Maximum usable charge
      chargeTime: 1200 // Time in ms to reach max charge (1.2 seconds)
    });

    this.baseDashPower = 2; // Base dash force
    this.minSpeed = 0.1;
  }

  activate(car, world, gameState) {
    const currentTime = Date.now();

    // Calculate charge usage using base class helper
    const chargeUsed = this.calculateChargeUsage(car, currentTime);

    // Check if we have enough charge
    if (!car.chargeState || car.chargeState.current < chargeUsed) {
      return {
        success: false,
        reason: 'low_charge',
        currentCharge: car.chargeState ? car.chargeState.current : 0,
        requiredCharge: chargeUsed
      };
    }

    // Consume charge
    car.chargeState.current -= chargeUsed;

    // Get charge scale for force scaling using base class helper
    const chargeScale = this.getChargeScale(chargeUsed);

    // Super-linear force scaling - held dashes are MORE efficient than tap spam
    // Formula: base * (0.3 + (scale * 0.5) + (scale² * 1.2))
    // This gives 48.7% MORE force efficiency for full holds vs equivalent taps
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
    // Call base class update to handle charge regeneration
    super.update(car, world, gameState, dt);
    // No additional ongoing effects for dash ability
  }

  getClientData() {
    return {
      ...super.getClientData(),
      dashPower: this.dashPower
    };
  }
}

module.exports = DashAbility;
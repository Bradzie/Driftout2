const Ability = require('./Ability');

class RepairAbility extends Ability {
  constructor() {
    super({
      id: 'repair',
      name: 'Repair',
      cooldown: 8000,
      usesChargeSystem: true,
      maxCharge: 100,
      baseRegenRate: 5,
      minChargeToUse: 20,
      maxChargeToUse: 100,
      chargeTime: 2000
    });

    this.baseHealAmount = 1;
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
    const healAmount = this.baseHealAmount * (0.4 + (chargeScale * 0.6 * 1.5));
    const oldHealth = car.currentHealth;
    car.currentHealth = Math.min(car.stats.maxHealth, car.currentHealth + healAmount);
    const actualHeal = car.currentHealth - oldHealth;

    this.lastUsed = currentTime;

    return {
      success: true,
      type: 'repair',
      healedAmount: actualHeal,
      position: { x: car.body.position.x, y: car.body.position.y },
      serverTime: currentTime,
      chargeUsed: chargeUsed
    };
  }

  update(car, world, gameState, dt) {
    super.update(car, world, gameState, dt);
  }

  getClientData() {
    return {
      ...super.getClientData(),
      baseHealAmount: this.baseHealAmount
    };
  }
}

module.exports = RepairAbility;

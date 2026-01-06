class Ability {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.cooldown = config.cooldown; // milliseconds
    this.duration = config.duration || 0; // for temporary effects
    this.lastUsed = 0;

    // optional charge system
    this.usesChargeSystem = config.usesChargeSystem || false;
    this.maxCharge = config.maxCharge || 100;
    this.baseRegenRate = config.baseRegenRate || 10;
    this.minChargeToUse = config.minChargeToUse || 0;
    this.maxChargeToUse = config.maxChargeToUse || 100;
    this.chargeTime = config.chargeTime || 2000;
  }

  canUse(car, currentTime) {
    const effectiveCooldown = this.getEffectiveCooldown(car);
    return (currentTime - this.lastUsed) >= effectiveCooldown;
  }

  getEffectiveCooldown(car) {
    const reduction = car.abilityCooldownReduction || 0;
    return Math.max(500, this.cooldown - reduction); // minimum 500ms cooldown
  }

  getRemainingCooldown(car, currentTime) {
    const elapsed = currentTime - this.lastUsed;
    const effectiveCooldown = this.getEffectiveCooldown(car);
    return Math.max(0, effectiveCooldown - elapsed);
  }

  getCooldownProgress(car, currentTime) {
    const remaining = this.getRemainingCooldown(car, currentTime);
    const effectiveCooldown = this.getEffectiveCooldown(car);
    return ((effectiveCooldown - remaining) / effectiveCooldown) * 100;
  }

  initializeChargeState(car) {
    if (this.usesChargeSystem) {
      car.chargeState = {
        current: this.maxCharge,
        max: this.maxCharge,
        regenRate: this.baseRegenRate,
        isCharging: false,
        chargeStartTime: 0
      };
    }
  }

  calculateChargeUsage(car, currentTime) {
    if (!this.usesChargeSystem || !car.chargeState) return 0;

    const holdDuration = Math.min(
      currentTime - (car.chargeState.chargeStartTime || currentTime),
      this.chargeTime
    );

    const isTap = holdDuration < 200;

    if (isTap) {
      return this.minChargeToUse;
    } else {
      const progress = holdDuration / this.chargeTime;
      const chargeRange = this.maxChargeToUse - this.minChargeToUse;
      return this.minChargeToUse + (progress * chargeRange);
    }
  }

  getChargeScale(chargeUsed) {
    return chargeUsed / this.maxChargeToUse;
  }

  // Template methods - subclasses must/can override these

  activate(car, world, gameState) {
    throw new Error(`Ability ${this.id} must implement activate() method`);
  }

  update(car, world, gameState, dt) {
    if (this.usesChargeSystem && car.chargeState) {
      if (car.chargeState.current < car.chargeState.max) {
        car.chargeState.current = Math.min(
          car.chargeState.max,
          car.chargeState.current + (car.chargeState.regenRate * dt)
        );
      }
    }
  }

  deactivate(car, world, gameState) {
    // default
  }

  render(ctx, car, scale, centerX, centerY, me) {
    // default
  }

  getClientData() {
    return {
      id: this.id,
      name: this.name,
      cooldown: this.cooldown,
      duration: this.duration,
      lastUsed: this.lastUsed
    };
  }
}

module.exports = Ability;
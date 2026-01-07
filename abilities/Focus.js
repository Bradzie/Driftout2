const Ability = require('./Ability');

class FocusAbility extends Ability {
  constructor() {
    super({
      id: 'focus',
      name: 'Focus',
      cooldown: 0,
      usesChargeSystem: true,
      maxCharge: 100,
      baseRegenRate: 8,
      minChargeToUse: 20,
      maxChargeToUse: 100,
      chargeTime: 0
    });

    this.drainRate = 10;
    this.targetFrictionAir = 0.05;
    this.accelerationMultiplier = 6.0;
  }

  activate(car, world, gameState) {
    const currentTime = Date.now();
    if (!car.chargeState || car.chargeState.current < this.minChargeToUse) {
      return {
        success: false,
        reason: 'low_charge',
        currentCharge: car.chargeState ? car.chargeState.current : 0,
        requiredCharge: this.minChargeToUse
      };
    }

    car.chargeState.current -= this.minChargeToUse;

    if (!car.isFocused) {
      car.originalFrictionAir = car._originalBodyProps.frictionAir;
      car.originalAcceleration = car._originalBodyProps.acceleration;
    }

    car._originalBodyProps.frictionAir = this.targetFrictionAir;
    car._originalBodyProps.acceleration = car.originalAcceleration * this.accelerationMultiplier;

    car.isFocused = true;
    car.focusStartTime = currentTime;

    this.lastUsed = currentTime;

    return {
      success: true,
      type: 'focus',
      position: { x: car.body.position.x, y: car.body.position.y },
      serverTime: currentTime,
      chargeUsed: this.minChargeToUse
    };
  }

  update(car, world, gameState, dt) {
    const currentTime = Date.now();

    if (car.isFocused) {
      if (car.chargeState && car.chargeState.isCharging) {
        car.chargeState.current -= this.drainRate * dt;

        car._originalBodyProps.frictionAir = this.targetFrictionAir;
        car._originalBodyProps.acceleration = car.originalAcceleration * this.accelerationMultiplier;

        if (car.chargeState.current <= 0) {
          car.chargeState.current = 0;
          this.deactivate(car, world, gameState);
        }
      } else {
        this.deactivate(car, world, gameState);
      }
    } else {
      if (this.usesChargeSystem && car.chargeState) {
        if (car.chargeState.current < car.chargeState.max) {
          car.chargeState.current = Math.min(
            car.chargeState.max,
            car.chargeState.current + (car.chargeState.regenRate * dt)
          );
        }
      }
    }
  }

  deactivate(car, world, gameState) {
    if (car.originalFrictionAir !== null) {
      car._originalBodyProps.frictionAir = car.originalFrictionAir;
    }
    if (car.originalAcceleration !== null) {
      car._originalBodyProps.acceleration = car.originalAcceleration;
    }

    car.isFocused = false;
    car.originalFrictionAir = null;
    car.originalAcceleration = null;

    if (car.chargeState) {
      car.chargeState.isCharging = false;
    }
  }

  getClientData() {
    return {
      ...super.getClientData(),
      drainRate: this.drainRate,
      targetFrictionAir: this.targetFrictionAir,
      accelerationMultiplier: this.accelerationMultiplier
    };
  }
}

module.exports = FocusAbility;

const Ability = require('./Ability');
const Matter = require('matter-js');

class AnchorAbility extends Ability {
  constructor() {
    super({
      id: 'anchor',
      name: 'Anchor',
      cooldown: 0,
      usesChargeSystem: true,
      maxCharge: 100,
      baseRegenRate: 8,
      minChargeToUse: 20,
      maxChargeToUse: 100,
      chargeTime: 0
    });

    this.drainRate = 12; // 12 / sec
    this.minResistance = 0.10;
    this.maxResistance = 0.30;
    this.resistanceRampTime = 3000;
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
    car.isAnchored = true;
    car.anchorStartTime = currentTime;
    car.anchorResistance = this.minResistance;
    Matter.Body.setVelocity(car.body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(car.body, 0);

    this.lastUsed = currentTime;

    return {
      success: true,
      type: 'anchor',
      position: { x: car.body.position.x, y: car.body.position.y },
      serverTime: currentTime,
      chargeUsed: this.minChargeToUse
    };
  }

  update(car, world, gameState, dt) {
    const currentTime = Date.now();

    if (car.isAnchored) {
      if (car.chargeState && car.chargeState.isCharging) {
        car.chargeState.current -= this.drainRate * dt;

        // stop momentum | todo add massive airfriction instead, smoother, unspamable and allows small movement
        Matter.Body.setVelocity(car.body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(car.body, 0);

        const elapsed = currentTime - car.anchorStartTime;
        const progress = Math.min(1, elapsed / this.resistanceRampTime);
        car.anchorResistance = this.minResistance +
          (progress * (this.maxResistance - this.minResistance));

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
    car.isAnchored = false;
    car.anchorResistance = 0;
    if (car.chargeState) {
      car.chargeState.isCharging = false;
    }
  }

  getClientData() {
    return {
      ...super.getClientData(),
      drainRate: this.drainRate,
      minResistance: this.minResistance,
      maxResistance: this.maxResistance
    };
  }
}

module.exports = AnchorAbility;

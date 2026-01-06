const Ability = require('./Ability');
const Matter = require('matter-js');
const { v4: uuidv4 } = require('uuid');

class CannonAbility extends Ability {
  constructor() {
    super({
      id: 'cannon',
      name: 'Cannon',
      cooldown: 5000, // 5 seconds base cooldown
      duration: 4000  // 4 seconds projectile lifetime
    });

    this.baseDamage = 4;
    this.projectileRadius = 6;
    this.baseProjectileForce = 0.5;
    this.baseRecoilForce = 1;
    this.baseProjectileDensity = 0.2;
  }

  activate(car, world, gameState) {
    const currentTime = Date.now();

    // max hold time
    const holdDuration = Math.min(currentTime - (car.cannonChargeStartTime || currentTime), 2000);

    // anything less than 200ms is a 'tap fire'
    const isTap = holdDuration < 200;

    const chargeUsed = isTap ? 30 : Math.min(30 + (holdDuration / 1500) * 45, 80);

    if ((car.cannonCharge || 0) < chargeUsed) {
      return {
        success: false,
        reason: 'low_charge',
        currentCharge: car.cannonCharge || 0,
        requiredCharge: chargeUsed
      };
    }

    car.cannonCharge -= chargeUsed;
    const chargeScale = chargeUsed / 75;

    const baseProjectileSpeed = this.baseProjectileForce + (car.projectileSpeed || 0) + (car.projectileDensity * 10 || 0);
    const baseProjectileDensity = this.baseProjectileDensity + (car.projectileDensity * 3 || 0);
    const baseProjectileSize = this.projectileRadius + (car.projectileDensity * 20 || 0);
    const baseProjectileDamage = this.baseDamage + ((car.projectileDensity * 10 || 0) + (car.projectileSpeed * 2 || 0));
    const baseRecoilForce = this.baseRecoilForce + (((car.projectileSpeed || 0) + (car.projectileDensity * 5 || 0)) * 0.5);

    const projectileSpeed = baseProjectileSpeed * (0.5 + ((chargeScale * 0.6) * 1.2));
    const projectileDensity = baseProjectileDensity * (0.7 + (chargeScale * 0.3));
    const projectileSize = baseProjectileSize * (0.6 + ((chargeScale * 0.3) * 2));
    const projectileDamage = baseProjectileDamage * (0.5 + ((chargeScale * 0.3) * 2));
    const recoilForce = baseRecoilForce * (0.5 + ((chargeScale * 0.3) * 5));

    const forwardOffset = 20 + projectileSize;
    const position = {
      x: car.body.position.x + Math.cos(car.body.angle) * forwardOffset,
      y: car.body.position.y + Math.sin(car.body.angle) * forwardOffset
    };

    const cannonballBody = this.createCannonball(position, world, car.id, projectileDensity, projectileSize);

    // ball forward force
    const projectileForce = {
      x: Math.cos(car.body.angle) * projectileSpeed,
      y: Math.sin(car.body.angle) * projectileSpeed
    };
    Matter.Body.applyForce(cannonballBody, cannonballBody.position, projectileForce);

    // recoil force
    const recoilVector = {
      x: -Math.cos(car.body.angle) * recoilForce,
      y: -Math.sin(car.body.angle) * recoilForce
    };
    Matter.Body.applyForce(car.body, car.body.position, recoilVector);

    const cannonballObject = {
      id: uuidv4(),
      type: 'cannonball',
      body: cannonballBody,
      abilityId: this.id,
      createdBy: car.id,
      createdAt: currentTime,
      expiresAt: currentTime + this.duration,
      damage: projectileDamage,
      position: position,
      radius: projectileSize,
    };

    gameState.abilityObjects.push(cannonballObject);

    this.lastUsed = currentTime;

    return {
      success: true,
      type: 'cannonball',
      position: position,
      projectileId: cannonballObject.id,
      duration: this.duration,
      serverTime: currentTime,
      chargeUsed: chargeUsed,
      isTap: isTap
    };
  }

  update(car, world, gameState, dt) {
    // Regenerate charge over time (dt is in seconds)
    if (car.cannonCharge < car.cannonMaxCharge) {
      car.cannonCharge = Math.min(
        car.cannonMaxCharge,
        car.cannonCharge + (car.cannonRegenRate * dt)
      );
    }
  }

  createCannonball(position, world, ownerId, density, projectileSize) {
    const radius = projectileSize;
    const sides = 8;
    const vertices = [];

    for (let i = 0; i < sides; i++) {
      const angle = (i * Math.PI * 2) / sides;
      vertices.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }

    const cannonballBody = Matter.Bodies.fromVertices(
      position.x,
      position.y,
      [vertices],
      {
        isSensor: false,
        isStatic: false,
        label: 'cannonball',
        ownerId: ownerId,
        render: {
          fillStyle: '#2c3e50',
          strokeStyle: '#34495e',
          lineWidth: 4
        },
        friction: 0.3,
        frictionAir: 0.008,
        restitution: 0.9,
        density: density,
      },
      true
    );

    Matter.World.add(world, cannonballBody);

    return cannonballBody;
  }

  static handleCollision(projectile, car) {
    // no damage to self
    if (projectile.createdBy === car.id) {
      return false;
    }

    // no damage to ghost or god mode cars
    if (car.isGhost || car.godMode) {
      return false;
    }

    // only one hiy per projectile, but kinda redundant since it has a cooldown
    const now = Date.now();
    if (!car.cannonballDamageHistory) {
      car.cannonballDamageHistory = new Map();
    }

    const lastDamage = car.cannonballDamageHistory.get(projectile.id);
    const damageCooldown = 1000; // 1 sec between hits

    if (lastDamage && (now - lastDamage) < damageCooldown) {
      return false;
    }

    car.currentHealth -= projectile.damage;
    car.cannonballDamageHistory.set(projectile.id, now);

    if (!car.damageTagHistory) {
      car.damageTagHistory = [];
    }
    car.damageTagHistory.push({
      attackerId: projectile.createdBy,
      timestamp: now
    });

    if (car.currentHealth <= 0) {
      car.justCrashed = true;
    }

    return true;
  }
}

module.exports = CannonAbility;

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

    this.baseDamage = 5;
    this.projectileRadius = 8;
    this.baseProjectileForce = 1;
    this.baseRecoilForce = 2.2;
    this.baseProjectileDensity = 0.2;
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

    // vals with upgrades
    const projectileSpeed = this.baseProjectileForce + (car.projectileSpeed || 0);
    const projectileDensity = this.baseProjectileDensity + (car.projectileDensity || 0);
    const recoilForce = this.baseRecoilForce + ((car.projectileSpeed || 0) * 0.3);

    // spawn 25px in front
    const forwardOffset = 25;
    const position = {
      x: car.body.position.x + Math.cos(car.body.angle) * forwardOffset,
      y: car.body.position.y + Math.sin(car.body.angle) * forwardOffset
    };

    const cannonballBody = this.createCannonball(position, world, car.id, projectileDensity);

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
      damage: this.baseDamage,
      position: position,
      radius: this.projectileRadius
    };

    gameState.abilityObjects.push(cannonballObject);

    this.lastUsed = currentTime;

    return {
      success: true,
      type: 'cannonball',
      position: position,
      projectileId: cannonballObject.id,
      duration: this.duration,
      serverTime: currentTime
    };
  }

  createCannonball(position, world, ownerId, density) {
    const radius = this.projectileRadius;
    const sides = 10;
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

    if (car.currentHealth <= 0) {
      car.justCrashed = true;
    }

    return true;
  }
}

module.exports = CannonAbility;

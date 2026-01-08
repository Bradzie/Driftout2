const Ability = require('./Ability');
const Matter = require('matter-js');
const { v4: uuidv4 } = require('uuid');

class PortalAbility extends Ability {
  constructor() {
    super({
      id: 'portal',
      name: 'Portal',
      cooldown: 0,
      duration: 15000,
      usesChargeSystem: true,
      maxCharge: 100,
      baseRegenRate: 6,
      minChargeToUse: 20,
      maxChargeToUse: 50,
      chargeTime: 1000
    });

    this.projectileRadius = 6;
    this.projectileSpeed = 0.3;
    this.projectileDensity = 0.15;
    this.explosionRadius = 75;
    this.explosionDamage = 2;
    this.explosionForce = 0.8;
    this.portalRadius = 20;
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
    const isTapShot = chargeUsed <= this.minChargeToUse + 5;

    const forwardOffset = 20 + this.projectileRadius;
    const position = {
      x: car.body.position.x + Math.cos(car.body.angle) * forwardOffset,
      y: car.body.position.y + Math.sin(car.body.angle) * forwardOffset
    };

    let projectileBody, projectileObject;

    if (isTapShot) {
      projectileBody = this.createPortalProjectile(position, world, car.id);

      const projectileForce = {
        x: Math.cos(car.body.angle) * this.projectileSpeed,
        y: Math.sin(car.body.angle) * this.projectileSpeed
      };
      Matter.Body.applyForce(projectileBody, projectileBody.position, projectileForce);

      projectileObject = {
        id: uuidv4(),
        type: 'portal-projectile',
        body: projectileBody,
        abilityId: this.id,
        createdBy: car.id,
        createdAt: currentTime,
        expiresAt: currentTime + 5000, // 5 sec expiry
        position: position,
        radius: this.projectileRadius,
        damage: 0, // no damage
      };
    } else {
      const explosionSize = this.projectileRadius * 1.2 * (0.8 + chargeScale * 0.4);
      projectileBody = this.createExplosionProjectile(position, world, car.id, explosionSize);

      const projectileForce = {
        x: Math.cos(car.body.angle) * this.projectileSpeed * 1.5,
        y: Math.sin(car.body.angle) * this.projectileSpeed * 1.5
      };
      Matter.Body.applyForce(projectileBody, projectileBody.position, projectileForce);

      const explosionRadius = this.explosionRadius + (car.explosionRadius || 0);

      projectileObject = {
        id: uuidv4(),
        type: 'explosion-projectile',
        body: projectileBody,
        abilityId: this.id,
        createdBy: car.id,
        createdAt: currentTime,
        expiresAt: currentTime + 5000,
        position: position,
        radius: explosionSize,
        explosionRadius: explosionRadius,
        explosionDamage: this.explosionDamage,
        explosionForce: this.explosionForce,
      };
    }

    gameState.abilityObjects.push(projectileObject);

    this.lastUsed = currentTime;

    return {
      success: true,
      type: isTapShot ? 'portal-projectile' : 'explosion-projectile',
      position: position,
      projectileId: projectileObject.id,
      serverTime: currentTime,
      chargeUsed: chargeUsed,
      explosionRadius: isTapShot ? 0 : projectileObject.explosionRadius,
    };
  }

  update(car, world, gameState, dt) {
    super.update(car, world, gameState, dt);
  }

  createPortalProjectile(position, world, ownerId) {
    const radius = this.projectileRadius;
    const sides = 8;
    const vertices = [];

    for (let i = 0; i < sides; i++) {
      const angle = (i * Math.PI * 2) / sides;
      vertices.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }

    const projectileBody = Matter.Bodies.fromVertices(
      position.x,
      position.y,
      [vertices],
      {
        isSensor: false,
        isStatic: false,
        label: 'portal-projectile',
        ownerId: ownerId,
        render: {
          fillStyle: '#0088ff',
          strokeStyle: '#64b4ff',
          lineWidth: 3
        },
        friction: 0.3,
        frictionAir: 0.01,
        restitution: 0.6,
        density: this.projectileDensity,
      },
      true
    );

    Matter.World.add(world, projectileBody);

    return projectileBody;
  }

  createExplosionProjectile(position, world, ownerId, size) {
    const radius = size;
    const sides = 12;
    const vertices = [];

    for (let i = 0; i < sides; i++) {
      const angle = (i * Math.PI * 2) / sides;
      vertices.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }

    const projectileBody = Matter.Bodies.fromVertices(
      position.x,
      position.y,
      [vertices],
      {
        isSensor: false,
        isStatic: false,
        label: 'explosion-projectile',
        ownerId: ownerId,
        render: {
          fillStyle: 'rgba(255, 136, 0, 0.4)',  // Portal 2 orange, transparent
          strokeStyle: '#ff8800',
          lineWidth: 3
        },
        friction: 0.3,
        frictionAir: 0.01,
        restitution: 0.6,
        density: this.projectileDensity * 1.2,
      },
      true
    );

    Matter.World.add(world, projectileBody);

    return projectileBody;
  }

  createPortal(type, position, world, ownerId, gameState, currentTime, portalDuration) {
    const radius = this.portalRadius;
    const sides = 16;
    const vertices = [];

    for (let i = 0; i < sides; i++) {
      const angle = (i * Math.PI * 2) / sides;
      vertices.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }

    const isOrange = type === 'portal_orange';
    const portalBody = Matter.Bodies.fromVertices(
      position.x,
      position.y,
      [vertices],
      {
        isSensor: true,
        isStatic: true,
        label: type,
        ownerId: ownerId,
        render: {
          fillStyle: isOrange ? '#ff8800' : '#0088ff',
          strokeStyle: isOrange ? '#ffaa44' : '#64b4ff',
          lineWidth: 4
        },
      },
      true
    );

    Matter.World.add(world, portalBody);

    const portal = {
      id: uuidv4(),
      type: type,
      body: portalBody,
      abilityId: this.id,
      createdBy: ownerId,
      createdAt: currentTime,
      expiresAt: currentTime + portalDuration,
      position: position,
      radius: radius,
      linkedPortalId: null,
    };

    gameState.abilityObjects.push(portal);

    return portal;
  }

  static handlePortalProjectileCollision(projectile, otherBody, world, gameState, room) {
    const currentTime = Date.now();
    const portalRadius = 20;
    const baseDuration = 15000; // 15 seconds

    const creator = Array.from(room.players.values()).find(p => p.id === projectile.createdBy);
    const portalDuration = baseDuration + (creator?.portalDuration || 0);

    const playerPortals = gameState.abilityObjects.filter(
      obj => (obj.type === 'portal_orange' || obj.type === 'portal_blue') &&
             obj.createdBy === projectile.createdBy
    );

    Matter.World.remove(world, projectile.body);
    const projectileIndex = gameState.abilityObjects.findIndex(obj => obj.id === projectile.id);
    if (projectileIndex !== -1) {
      gameState.abilityObjects.splice(projectileIndex, 1);
    }

    const createPortal = (type, position) => {
      const sides = 16;
      const vertices = [];

      for (let i = 0; i < sides; i++) {
        const angle = (i * Math.PI * 2) / sides;
        vertices.push({
          x: Math.cos(angle) * portalRadius,
          y: Math.sin(angle) * portalRadius
        });
      }

      const isOrange = type === 'portal_orange';
      const portalBody = Matter.Bodies.fromVertices(
        position.x,
        position.y,
        [vertices],
        {
          isSensor: true,
          isStatic: true,
          label: type,
          ownerId: projectile.createdBy,
          render: {
            fillStyle: isOrange ? '#ff8800' : '#0088ff',
            strokeStyle: isOrange ? '#ffaa44' : '#64b4ff',
            lineWidth: 4
          },
          slop: 0,
        },
        true
      );

      Matter.World.add(world, portalBody);

      const portal = {
        id: uuidv4(),
        type: type,
        body: portalBody,
        abilityId: 'portal',
        createdBy: projectile.createdBy,
        createdAt: currentTime,
        expiresAt: currentTime + portalDuration,
        position: position,
        radius: portalRadius,
        linkedPortalId: null,
      };

      gameState.abilityObjects.push(portal);
      return portal;
    };

    if (playerPortals.length === 0) {
      createPortal('portal_orange', projectile.body.position);
    } else if (playerPortals.length === 1) {
      const newPortal = createPortal('portal_blue', projectile.body.position);

      const existingPortal = playerPortals[0];
      existingPortal.linkedPortalId = newPortal.id;
      newPortal.linkedPortalId = existingPortal.id;
    } else {
      const oldest = playerPortals.sort((a, b) => a.createdAt - b.createdAt)[0];
      const remaining = playerPortals.find(p => p.id !== oldest.id);

      Matter.World.remove(world, oldest.body);
      const oldestIndex = gameState.abilityObjects.findIndex(obj => obj.id === oldest.id);
      if (oldestIndex !== -1) {
        gameState.abilityObjects.splice(oldestIndex, 1);
      }

      const newType = remaining.type === 'portal_orange' ? 'portal_blue' : 'portal_orange';

      const newPortal = createPortal(newType, projectile.body.position);

      remaining.linkedPortalId = newPortal.id;
      newPortal.linkedPortalId = remaining.id;
    }

    return true;
  }

  static handleExplosionProjectileCollision(projectile, otherBody, world, gameState, room) {
    if (!projectile || !projectile.body) return false;

    const explosionPos = projectile.body.position;
    const explosionRadius = projectile.explosionRadius;
    const explosionDamage = projectile.explosionDamage;
    const explosionForce = projectile.explosionForce;
    const forceMultiplier = 5;

    const carsInRange = Array.from(room.players.values()).filter(targetCar => {
      if (!targetCar.body || targetCar.isGhost || targetCar.godMode) return false;

      const dx = targetCar.body.position.x - explosionPos.x;
      const dy = targetCar.body.position.y - explosionPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance <= explosionRadius;
    });

    carsInRange.forEach(targetCar => {
      const dx = targetCar.body.position.x - explosionPos.x;
      const dy = targetCar.body.position.y - explosionPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const falloff = distance === 0 ? 1 : Math.max(0, 1 - (distance / explosionRadius));
      const actualDamage = explosionDamage * falloff;
      const actualForce = explosionForce * falloff;

      if (targetCar.id !== projectile.createdBy) {
        targetCar.currentHealth -= actualDamage;

        if (!targetCar.damageTagHistory) {
          targetCar.damageTagHistory = [];
        }
        targetCar.damageTagHistory.push({
          attackerId: projectile.createdBy,
          timestamp: Date.now()
        });

        if (targetCar.currentHealth <= 0) {
          targetCar.justCrashed = true;
        }
      }

      if (distance > 0.1) {
        const angle = Math.atan2(dy, dx);

        const currentVel = targetCar.body.velocity;
        const impulseX = Math.cos(angle) * forceMultiplier * actualForce;
        const impulseY = Math.sin(angle) * forceMultiplier * actualForce;

        Matter.Body.setVelocity(targetCar.body, {
          x: currentVel.x + impulseX,
          y: currentVel.y + impulseY
        });
      }
    });

    const allBodies = Matter.Composite.allBodies(world);
    const dynamicObjectsInRange = allBodies.filter(body => {
      if (!body.label || !body.label.startsWith('dynamic-')) return false;
      if (body.isStatic) return false;

      const dx = body.position.x - explosionPos.x;
      const dy = body.position.y - explosionPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance <= explosionRadius;
    });

    dynamicObjectsInRange.forEach(body => {
      const dx = body.position.x - explosionPos.x;
      const dy = body.position.y - explosionPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0.1) {
        const falloff = Math.max(0, 1 - (distance / explosionRadius));
        const actualForce = explosionForce * falloff * 2;

        const angle = Math.atan2(dy, dx);

        const currentVel = body.velocity;
        const impulseX = Math.cos(angle) * forceMultiplier * actualForce;
        const impulseY = Math.sin(angle) * forceMultiplier * actualForce;

        Matter.Body.setVelocity(body, {
          x: currentVel.x + impulseX,
          y: currentVel.y + impulseY
        });

      }
    });

    const currentTime = Date.now();
    const explosionEffect = {
      id: uuidv4(),
      type: 'explosion-effect',
      body: {
        position: explosionPos,
        angle: 0,
        vertices: [] // circle render, no verts
      },
      createdBy: projectile.createdBy,
      createdAt: currentTime,
      expiresAt: currentTime + 300, // 0.3 secs
      explosionRadius: explosionRadius,
      position: explosionPos
    };
    gameState.abilityObjects.push(explosionEffect);

    Matter.World.remove(world, projectile.body);
    const projectileIndex = gameState.abilityObjects.findIndex(obj => obj.id === projectile.id);
    if (projectileIndex !== -1) {
      gameState.abilityObjects.splice(projectileIndex, 1);
    }

    return true;
  }

  static handlePortalTeleport(portal, car, gameState) {
    if (car.isGhost || car.godMode) return false;

    const now = Date.now();
    if (!car.portalCooldown) car.portalCooldown = new Map();

    const lastTeleport = car.portalCooldown.get(portal.id);
    const teleportCooldown = 400;

    if (lastTeleport && (now - lastTeleport) < teleportCooldown) {
      return false;
    }

    const linkedPortal = gameState.abilityObjects.find(
      obj => obj.id === portal.linkedPortalId
    );

    if (!linkedPortal) return false;
    const exitPos = linkedPortal.body.position;
    Matter.Body.setPosition(car.body, {
      x: exitPos.x,
      y: exitPos.y
    });

    car.portalInvulnerable = true;
    car.portalInvulnerableUntil = now + 300; // small godmode frams to prevent instant crashes

    car.portalCooldown.set(portal.id, now);
    car.portalCooldown.set(linkedPortal.id, now);

    return true;
  }
}

module.exports = PortalAbility;

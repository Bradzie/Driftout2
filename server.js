const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const Matter = require('matter-js');
const decomp = require('poly-decomp');
Matter.Common.setDecomp(decomp);
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('client'));

// send car types to client
app.get('/api/carTypes', (req, res) => {
  res.json(CAR_TYPES);
});

// send debug mode status to client
app.get('/api/debug', (req, res) => {
  res.json({ debugMode: DEBUG_MODE });
});

const PORT = process.env.PORT || 3000;

// Debug mode - toggle this to enable/disable admin panel
const DEBUG_MODE = true;

const HELPERS = require('./helpers');
const { abilityRegistry, SpikeTrapAbility } = require('./abilities');

const MAP_TYPES = require('./mapTypes');
const mapKeys = Object.keys(MAP_TYPES);
let currentMapIndex = 0;
let currentMapKey = mapKeys[currentMapIndex];
let currentTrackBodies = [];
let currentDynamicBodies = []; // Track dynamic map objects

function pointInPolygon(x, y, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;

    // Handle horizontal edges properly
    if (yi === yj && yi === y) {
      if (x >= Math.min(xi, xj) && x <= Math.max(xi, xj)) {
        return true; // On a horizontal edge
      }
    }

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
const CAR_TYPES = require('./carTypes');

const engine = Matter.Engine.create();
engine.gravity.x = 0;
engine.gravity.y = 0;
const world = engine.world;

Matter.Events.on(engine, 'collisionStart', (event) => {
  for (const pair of event.pairs) {
    const { bodyA, bodyB } = pair

    const isCarA = bodyA.label?.startsWith?.('car-')
    const isCarB = bodyB.label?.startsWith?.('car-')
    const isSpikeA = bodyA.label === 'spike-trap'
    const isSpikeB = bodyB.label === 'spike-trap'

    const carA = isCarA ? [...rooms[0].players.values()].find(c => c.body === bodyA) : null
    const carB = isCarB ? [...rooms[0].players.values()].find(c => c.body === bodyB) : null

    // Handle spike trap collisions (ignore owner completely)
    if (isSpikeA && carB) {
      const trap = gameState.abilityObjects.find(obj => obj.body === bodyA)
      if (trap) {
        if (trap.createdBy !== carB.id) {
          SpikeTrapAbility.handleCollision(trap, carB)
        }
      }
    }
    if (isSpikeB && carA) {
      const trap = gameState.abilityObjects.find(obj => obj.body === bodyB)
      if (trap) {
        if (trap.createdBy !== carA.id) {
          SpikeTrapAbility.handleCollision(trap, carA)
        }
      }
    }

    // Handle collisions (only if not ghost and not spike traps)
    if (!isSpikeA && !isSpikeB) {
      const impulse = pair.collision.depth * 100 // crude impulse estimation
      
      // Calculate relative velocity for more accurate damage
      const relativeVelocityX = bodyA.velocity.x - bodyB.velocity.x
      const relativeVelocityY = bodyA.velocity.y - bodyB.velocity.y
      const relativeSpeed = Math.sqrt(relativeVelocityX * relativeVelocityX + relativeVelocityY * relativeVelocityY)
      
      // Apply mutual collision damage with overflow mechanics
      if (carA && carB && !carA.isGhost && !carB.isGhost) {
        applyMutualCollisionDamage(carA, carB, impulse, relativeSpeed)
      } else {
        // Handle single car collisions (with walls, etc.) using original system
        if (carA && !carA.isGhost) {
          // Check if bodyB is a dynamic object with damageScale
          const damageScale = (bodyB.dynamicObject && typeof bodyB.dynamicObject.damageScale === 'number') 
            ? bodyB.dynamicObject.damageScale : 1.0;
          carA.applyCollisionDamage(bodyB, impulse, relativeSpeed, damageScale);
        }
        if (carB && !carB.isGhost) {
          // Check if bodyA is a dynamic object with damageScale
          const damageScale = (bodyA.dynamicObject && typeof bodyA.dynamicObject.damageScale === 'number') 
            ? bodyA.dynamicObject.damageScale : 1.0;
          carB.applyCollisionDamage(bodyA, impulse, relativeSpeed, damageScale);
        }
      }
      
      // Handle dynamic object damage (can be damaged by cars)
      const isDynamicA = bodyA.label && bodyA.label.startsWith('dynamic-')
      const isDynamicB = bodyB.label && bodyB.label.startsWith('dynamic-')
      
      if (isDynamicA && carB) {
        applyDynamicObjectDamage(bodyA, bodyB, impulse, relativeSpeed)
      }
      if (isDynamicB && carA) {
        applyDynamicObjectDamage(bodyB, bodyA, impulse, relativeSpeed)
      }
    }
  }
})

// Smart collision damage system with overflow mechanics and collision kill rewards
function applyMutualCollisionDamage(carA, carB, impulse, relativeSpeed) {
  if (!carA || !carB || carA.godMode || carB.godMode || carA.isGhost || carB.isGhost) return;
  
  // Store initial health states
  const carAInitialHealth = carA.currentHealth;
  const carBInitialHealth = carB.currentHealth;
  
  // Calculate potential damage for both cars using existing physics formulas
  const damageA = calculateCollisionDamage(carA, carB.body, impulse, relativeSpeed);
  const damageB = calculateCollisionDamage(carB, carA.body, impulse, relativeSpeed);
  
  // Determine which car has less remaining health
  const carAHealthRemaining = carA.currentHealth;
  const carBHealthRemaining = carB.currentHealth;
  
  // Apply overflow damage logic
  let finalDamageA = damageA;
  let finalDamageB = damageB;
  
  // If damageB would exceed carB's remaining health, cap damageA to overflow amount
  if (damageB > carBHealthRemaining) {
    const overflow = damageB - carBHealthRemaining;
    finalDamageA = Math.min(finalDamageA, overflow);
  }
  
  // If damageA would exceed carA's remaining health, cap damageB to overflow amount
  if (damageA > carAHealthRemaining) {
    const overflow = damageA - carAHealthRemaining;
    finalDamageB = Math.min(finalDamageB, overflow);
  }
  
  // Apply the calculated damage
  carA.currentHealth -= finalDamageA;
  carB.currentHealth -= finalDamageB;
  
  // Check for crashes and award upgrade points for collision kills
  const carACrashed = carA.currentHealth <= 0;
  const carBCrashed = carB.currentHealth <= 0;
  
  if (carACrashed) {
    carA.justCrashed = true;
    carA.crashedByPlayer = true; // Mark as player collision crash
  }
  if (carBCrashed) {
    carB.justCrashed = true;
    carB.crashedByPlayer = true; // Mark as player collision crash
  }
  
  // Award upgrade points for successful collision kills and broadcast crash events
  if (carACrashed && !carBCrashed) {
    // carB killed carA - reward carB
    carB.upgradePoints += 1;
    
    // Broadcast kill feed message
    const room = rooms[0]; // Assuming single room for now
    if (room) {
      for (const [socketId, car] of room.players.entries()) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('killFeedMessage', {
            text: `${carB.name} crashed ${carA.name}!`,
            type: 'crash'
          });
        }
      }
    }
  } else if (carBCrashed && !carACrashed) {
    // carA killed carB - reward carA  
    carA.upgradePoints += 1;
    
    // Broadcast kill feed message
    const room = rooms[0]; // Assuming single room for now
    if (room) {
      for (const [socketId, car] of room.players.entries()) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('killFeedMessage', {
            text: `${carA.name} crashed ${carB.name}!`,
            type: 'crash'
          });
        }
      }
    }
  } else if (carACrashed && carBCrashed) {
    // Both crashed - mutual destruction
    const room = rooms[0]; // Assuming single room for now
    if (room) {
      for (const [socketId, car] of room.players.entries()) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('killFeedMessage', {
            text: `${carA.name} and ${carB.name} crashed!`,
            type: 'crash'
          });
        }
      }
    }
  }
  // If both crash (mutual destruction), no points awarded
}

// Calculate collision damage for a single car (extracted from applyCollisionDamage)
function calculateCollisionDamage(car, otherBody, impulse, relativeSpeed) {
  // Physics-based damage calculation using density ratios
  const otherDensity = otherBody.density || 0.001;
  const thisDensity = car.body.density || 0.3;
  
  // Calculate density ratio (heavier objects deal more damage to lighter ones)
  const densityRatio = otherDensity / thisDensity;
  
  // Add velocity factor for more realistic collision damage
  const velocityFactor = Math.sqrt(Math.abs(relativeSpeed)) / 10 || 1;
  
  // Cap the damage multiplier to prevent one-hit kills
  const MAX_DAMAGE_MULTIPLIER = 3.0;
  const MIN_DAMAGE_MULTIPLIER = 0.5;
  const damageMultiplier = Math.max(MIN_DAMAGE_MULTIPLIER, Math.min(MAX_DAMAGE_MULTIPLIER, densityRatio * velocityFactor));
  
  const BASE_DAMAGE_SCALE = 0.05; // Increased from 0.03 for more intense collisions
  const damage = impulse * damageMultiplier * BASE_DAMAGE_SCALE;
  
  return damage;
}

// Handle damage to dynamic objects (like brown box)
function applyDynamicObjectDamage(dynamicBody, otherBody, impulse, relativeSpeed) {
  if (!dynamicBody.dynamicObject) return
  
  // Only apply damage if the object has maxHealth defined
  if (typeof dynamicBody.dynamicObject.maxHealth === 'undefined') {
    // No health system for this object - it's indestructible
    return
  }
  
  // Initialize health if not set
  if (typeof dynamicBody.health === 'undefined') {
    dynamicBody.health = dynamicBody.dynamicObject.maxHealth
  }
  
  // Calculate damage using density ratios (similar to cars)
  const otherDensity = otherBody.density || 0.3
  const thisDensity = dynamicBody.density || 0.01
  const densityRatio = otherDensity / thisDensity
  const velocityFactor = Math.sqrt(Math.abs(relativeSpeed)) / 10 || 1
  
  // Dynamic objects are more fragile than cars
  const DYNAMIC_DAMAGE_SCALE = 0.1
  const damageMultiplier = Math.min(20.0, densityRatio * velocityFactor) // Higher cap for fragile objects
  const damage = impulse * damageMultiplier * DYNAMIC_DAMAGE_SCALE
  
  dynamicBody.health -= damage
  
  // Visual feedback for damage (could reduce opacity, change color, etc.)
  if (dynamicBody.health <= 0) {
    // Mark as destroyed (could remove from world or change appearance)
    dynamicBody.isDestroyed = true
    // For now, just make it very light so it's easily pushed around
    Matter.Body.setDensity(dynamicBody, 0.001)
  }
}

function setTrackBodies(mapKey) {
  // Remove old static bodies
  for (const body of currentTrackBodies) {
    Matter.World.remove(world, body)
  }
  currentTrackBodies = []

  // Remove old dynamic bodies  
  for (const body of currentDynamicBodies) {
    Matter.World.remove(world, body)
  }
  currentDynamicBodies = []

  const map = MAP_TYPES[mapKey]
  const thickness = 10
  if (!map) return

  // Create static track walls from shapes
  if (map.shapes) {
    for (const shape of map.shapes) {
      if (shape.hollow) continue
      if (!Array.isArray(shape.vertices)) continue

      const verts = shape.vertices
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i]
        const b = verts[(i + 1) % verts.length]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const length = Math.sqrt(dx * dx + dy * dy)
        const angle = Math.atan2(dy, dx)
        const cx = (a.x + b.x) / 2
        const cy = (a.y + b.y) / 2

        const bodyOptions = {
          ...HELPERS.getBodyOptionsFromShape(shape),
          angle
        }
        const wall = Matter.Bodies.rectangle(cx, cy, length + thickness, thickness, bodyOptions)

        currentTrackBodies.push(wall)
      }
    }
  }

  // Create dynamic objects
  if (map.dynamicObjects) {
    for (const dynObj of map.dynamicObjects) {
      if (!dynObj.position || !dynObj.size) continue
      
      const bodyOptions = {
        ...HELPERS.getBodyOptionsFromShape(dynObj),
        label: `dynamic-${dynObj.id || 'object'}`
      }
      
      let body
      if (dynObj.shape === 'circle') {
        body = Matter.Bodies.circle(dynObj.position.x, dynObj.position.y, dynObj.size.radius, bodyOptions)
      } else {
        // Default to rectangle
        body = Matter.Bodies.rectangle(
          dynObj.position.x, 
          dynObj.position.y, 
          dynObj.size.width, 
          dynObj.size.height, 
          bodyOptions
        )
      }
      
      // Apply frictionAir if specified
      if (typeof dynObj.frictionAir === 'number') {
        body.frictionAir = dynObj.frictionAir;
      }
      
      // Store additional properties for rendering
      body.dynamicObject = dynObj
      currentDynamicBodies.push(body)
    }
  }

  // Add all bodies to the world
  if (currentTrackBodies.length > 0) {
    Matter.World.add(world, currentTrackBodies)
  }
  if (currentDynamicBodies.length > 0) {
    Matter.World.add(world, currentDynamicBodies)
  }
}

setTrackBodies(currentMapKey);

class Car {
  constructor(id, type, roomId, socketId, name) {
    this.id = id;
    this.roomId = roomId;
    this.socketId = socketId;
    this.name = name || '';
    this.type = type;
    this.stats = {
      maxHealth: CAR_TYPES[type].maxHealth,
      acceleration: CAR_TYPES[type].acceleration,
      regen: CAR_TYPES[type].regen
    };
    this.currentHealth = this.stats.maxHealth;
    this.laps = 0;
    this.maxLaps = 3; // Default number of laps to complete
    this.upgradePoints = 0;
    this.upgradeUsage = {}; // Track how many times each upgrade has been used
    this.prevFinishCheck = null; // used for lap crossing on square track
    this.cursor = { x: 0, y: 0 }; // direction and intensity from client
    this.justCrashed = false;
    
    // Ability system
    const carDef = CAR_TYPES[type];
    this.ability = carDef.ability ? abilityRegistry.create(carDef.ability) : null;
    this.isGhost = false;
    this.trapDamageHistory = new Map();
    const mapDef = MAP_TYPES[currentMapKey];
    let startPos = { x: 0, y: 0 };
    this.checkpointsVisited = new Set()
    this._cpLastSides = new Map()
    this.hasLeftStartSinceLap = false
    if (mapDef && mapDef.start) {
      if (mapDef.start.vertices && mapDef.start.vertices.length) {
        const verts = mapDef.start.vertices;
        const avgX = verts.reduce((sum, v) => sum + v.x, 0) / verts.length;
        const avgY = verts.reduce((sum, v) => sum + v.y, 0) / verts.length;
        startPos = { x: avgX, y: avgY };
      } else if (typeof mapDef.start.x === 'number' && typeof mapDef.start.y === 'number') {
        startPos = mapDef.start;
      }
    }
    this.checkpointsVisited = new Set();
    const def = CAR_TYPES[this.type]
    const bodyOpts = {
      ...(def.bodyOptions || {}),
      label: `car-${this.id}`
    }
  if (def.shape && def.shape.vertices.length > 2) {
    this.body = Matter.Bodies.fromVertices(
      startPos.x,
      startPos.y,
      [def.shape.vertices],
      bodyOpts,
      false
    )
    this.displaySize = 15 // used for rendering hud around car (health bars, etc.)
  }
    Matter.Body.setAngle(this.body, 0);
    Matter.World.add(world, this.body);
    this.lastUpdate = Date.now();
  }
  update(dt) {
    // Update ability effects first
    if (this.ability) {
      this.ability.update(this, world, gameState, dt);
    }
    
    const CURSOR_MAX = 100
    const MAX_ROT_SPEED = Math.PI * 8          // rad/s clamp
    const STEER_GAIN = 5.0     // turn aggressiveness (higher = snappier)
    const VEL_ALIGN = 0.05     // how heavy to apply turn force
    const ANGULAR_DAMP = 20.0  // angular damping (turn friction)

    const body = this.body
    const cx = this.cursor.x
    const cy = -this.cursor.y
    const mag = Math.hypot(cx, cy)

    if (mag > 1) {
      const normX = cx / mag
      const normY = cy / mag
      const throttle = Math.min(mag, CURSOR_MAX) / CURSOR_MAX
      const inputAngle = Math.atan2(normY, normX)
      const v = body.velocity
      const speed = Math.hypot(v.x, v.y)
      const velAngle = speed > 0.01 ? Math.atan2(v.y, v.x) : inputAngle
      const desiredAngle = HELPERS.lerpAngle(velAngle, inputAngle, 1 - VEL_ALIGN)
      let diff = HELPERS.shortestAngle(desiredAngle - body.angle)
      const targetAngVel = diff * STEER_GAIN     // rad/s
      let angVel = body.angularVelocity * Math.max(0, 1 - ANGULAR_DAMP * dt)
      const max = MAX_ROT_SPEED
      angVel = HELPERS.clamp(angVel + targetAngVel * dt, -max, max)
      Matter.Body.setAngularVelocity(body, angVel)
      const forceMag = this.stats.acceleration * throttle
      const force = {
        x: Math.cos(body.angle) * forceMag,
        y: Math.sin(body.angle) * forceMag
      }
      Matter.Body.applyForce(body, body.position, force)
    }
    this.currentHealth = Math.min(
      this.stats.maxHealth,
      this.currentHealth + this.stats.regen * dt
    );

    const pos = this.body.position
    const checkpoints = MAP_TYPES[currentMapKey]?.checkpoints || []

    for (let i = 0; i < checkpoints.length; i++) {
      if (checkpoints[i].id == null)
        checkpoints[i].id = i
    }

    //track checkpoint visits (segment distance + crossing)
    for (const cp of checkpoints) {
      if (cp.type !== 'line' || cp.vertices.length < 2 || !cp.id) continue

      const [a, b] = cp.vertices
      const abx = b.x - a.x
      const aby = b.y - a.y
      const apx = pos.x - a.x
      const apy = pos.y - a.y

      const abLen2 = abx * abx + aby * aby || 1
      let t = (apx * abx + apy * aby) / abLen2

      if (t < 0 || t > 1) continue

      const projx = a.x + t * abx
      const projy = a.y + t * aby
      const dx = pos.x - projx
      const dy = pos.y - projy
      const dist = Math.hypot(dx, dy)

      if (dist >= 10) continue

      const lastSide = this._cpLastSides.get(cp.id) ?? 0
      const side = HELPERS.segmentSide(a.x, a.y, b.x, b.y, pos.x, pos.y)

      if (lastSide !== 0 && side !== 0 && side !== lastSide) {
        this.checkpointsVisited.add(cp.id)
      }

      this._cpLastSides.set(cp.id, side)
    }
    let insideStart = false
    const mapDef = MAP_TYPES[currentMapKey]
    if (mapDef?.start?.vertices?.length) {
      insideStart = pointInPolygon(this.body.position.x, this.body.position.y, mapDef.start.vertices)
    }
    if (!insideStart) this.hasLeftStartSinceLap = true
    if (
      insideStart &&
      this.hasLeftStartSinceLap &&
      checkpoints.length > 0 &&
      checkpoints.every(cp => this.checkpointsVisited.has(cp.id))
    ) {
      this.laps += 1
      this.upgradePoints += 1
      this.checkpointsVisited.clear()
      this.hasLeftStartSinceLap = false
    }

    let outsideSolid = false;
    let insideHole = false;
    if (mapDef && Array.isArray(mapDef.shapes)) {
      for (const shape of mapDef.shapes) {
        const px = pos.x
        const py = pos.y

        if (!Array.isArray(shape.vertices)) continue

        const inside = pointInPolygon(px, py, shape.vertices)

        if (shape.hollow) {
          if (inside) insideHole = true
        } else {
          if (!inside) outsideSolid = true
        }
      }
    }
  }
  resetCar() {
    const map = MAP_TYPES[currentMapKey];
    let startPos = { x: 0, y: 0 }
    if (map.start?.vertices?.length) {
      const verts = map.start.vertices
      startPos = {
        x: verts.reduce((sum, v) => sum + v.x, 0) / verts.length,
        y: verts.reduce((sum, v) => sum + v.y, 0) / verts.length
      }
    } else if (typeof map.start?.x === 'number' && typeof map.start?.y === 'number') {
      startPos = map.start
    }
    this.laps = 0;
    this.currentHealth = this.stats.maxHealth;
    this.prevFinishCheck = null;
    this.upgradeUsage = {};
    this.justCrashed = false;
    this.crashedByPlayer = false;
    this.killFeedSent = false;
    Matter.Body.setPosition(this.body, { x: startPos.x, y: startPos.y });
    Matter.Body.setVelocity(this.body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(this.body, 0);
    Matter.Body.setAngle(this.body, 0);
  }
  applyCollisionDamage(otherBody, impulse, relativeVelocity = 0, damageScale = 1.0) {
    // Don't take damage if god mode is enabled
    if (this.godMode) return;
    
    // Don't take damage if other body is static (walls, barriers)
    if (otherBody.isStatic) {
      const WALL_DAMAGE_SCALE = 0.02
      const damage = impulse * WALL_DAMAGE_SCALE * damageScale
      this.currentHealth -= damage
    } else {
      // Physics-based damage calculation using density ratios
      const otherDensity = otherBody.density || 0.001
      const thisDensity = this.body.density || 0.3
      
      // Calculate density ratio (heavier objects deal more damage to lighter ones)
      const densityRatio = otherDensity / thisDensity
      
      // Add velocity factor for more realistic collision damage
      const velocityFactor = Math.sqrt(Math.abs(relativeVelocity)) / 10 || 1
      
      // Cap the damage multiplier to prevent one-hit kills
      const MAX_DAMAGE_MULTIPLIER = 3.0
      const MIN_DAMAGE_MULTIPLIER = 0.5
      const damageMultiplier = Math.max(MIN_DAMAGE_MULTIPLIER, Math.min(MAX_DAMAGE_MULTIPLIER, densityRatio * velocityFactor))
      
      const BASE_DAMAGE_SCALE = 0.05 // Increased for more intense collisions
      const damage = impulse * damageMultiplier * BASE_DAMAGE_SCALE * damageScale
      
      this.currentHealth -= damage
    }

    if (this.currentHealth <= 0) {
      this.justCrashed = true
    }
  }
  
  useAbility(gameState) {
    if (!this.ability) {
      return { success: false, reason: 'no_ability' };
    }
    
    return this.ability.activate(this, world, gameState);
  }
}

class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map(); // socket.id -> Car
    this.sockets = new Map();
  }
  addPlayer(socket, carType, name) {
    const carId = uuidv4();
    const car = new Car(carId, carType, this.id, socket.id, name);
    this.players.set(socket.id, car);
    return car;
  }
  removePlayer(socket) {
    const car = this.players.get(socket.id);
    if (car) {
      Matter.World.remove(world, car.body);
      this.players.delete(socket.id);
    }
  }
  get state() {
    const cars = [];
    for (const [sid, car] of this.players.entries()) {
      const pos = car.body.position;
      cars.push({
        socketId: sid,
        id: car.id,
        type: car.type,
        x: pos.x,
        y: pos.y,
        angle: car.body.angle,
        health: car.currentHealth,
        maxHealth: car.stats.maxHealth,
        laps: car.laps,
        maxLaps: car.maxLaps,
        upgradePoints: car.upgradePoints,
        upgradeUsage: car.upgradeUsage,
        color: CAR_TYPES[car.type].color,
        shape: CAR_TYPES[car.type].shape,
        name: car.name,
        checkpointsVisited: Array.from(car.checkpointsVisited),
        vertices: car.body.vertices.map(v => ({
          x: v.x - pos.x,
          y: v.y - pos.y
        })),
        abilityCooldownReduction: car.abilityCooldownReduction || 0,
        crashed: car.justCrashed || false,
        crashedAt: car.crashedAt || null
      });
    }
    return cars;
  }
  resetRound() {
    for (const car of this.players.values()) {
      car.resetCar();
      car.upgradePoints = 0;
    }
  }
}

const rooms = [new Room(uuidv4())];

// Spectator management
const spectators = new Map(); // socket.id -> socket

// Global game state for ability system
const gameState = {
  abilityObjects: [], // Spike traps, etc.
  activeEffects: []   // Ghost modes, shields, etc.
};

// Delta compression - track last sent state per client
const clientLastStates = new Map();

function createDeltaState(socketId, currentState) {
  const lastState = clientLastStates.get(socketId);
  
  if (!lastState) {
    // First time - send full state
    clientLastStates.set(socketId, JSON.parse(JSON.stringify(currentState)));
    return currentState;
  }

  const delta = {
    players: [],
    fullUpdate: false
  };

  // Compare players and send only changes
  currentState.players.forEach((currentPlayer, i) => {
    const lastPlayer = lastState.players.find(p => p.id === currentPlayer.id);
    
    if (!lastPlayer) {
      // New player - send full data
      delta.players.push({ ...currentPlayer, isFullUpdate: true });
      return;
    }

    // Check if position/angle changed significantly  
    const posChanged = Math.abs(currentPlayer.x - lastPlayer.x) > 0.1 || 
                      Math.abs(currentPlayer.y - lastPlayer.y) > 0.1 ||
                      Math.abs(currentPlayer.angle - lastPlayer.angle) > 0.01;
    
    const healthChanged = currentPlayer.health !== lastPlayer.health;
    const lapsChanged = currentPlayer.laps !== lastPlayer.laps;

    if (posChanged || healthChanged || lapsChanged) {
      const playerDelta = { id: currentPlayer.id };
      
      if (posChanged) {
        playerDelta.x = currentPlayer.x;
        playerDelta.y = currentPlayer.y;
        playerDelta.angle = currentPlayer.angle;
        playerDelta.vertices = currentPlayer.vertices;
      }
      
      if (healthChanged) {
        playerDelta.health = currentPlayer.health;
      }
      
      if (lapsChanged) {
        playerDelta.laps = currentPlayer.laps;
        playerDelta.upgradePoints = currentPlayer.upgradePoints;
      }

      delta.players.push(playerDelta);
    }
  });

  // Update stored state
  clientLastStates.set(socketId, JSON.parse(JSON.stringify(currentState)));
  
  return delta.players.length > 0 ? delta : null;
}

function assignRoom() {
  for (const room of rooms) {
    if (room.players.size < 8) return room;
  }
  const newRoom = new Room(uuidv4());
  rooms.push(newRoom);
  return newRoom;
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let myCar = null;
  
  // Handle spectator requests
  socket.on('requestSpectator', () => {
    spectators.set(socket.id, socket);
  });
  
  socket.on('joinGame', ({ carType, name }) => {
    if (!CAR_TYPES[carType]) return;
    
    // Clean up any existing car for this socket across all rooms (handles rejoin after crash)
    for (const room of rooms) {
      if (room.players.has(socket.id)) {
        console.log(`Cleaning up existing car for socket ${socket.id} in room ${room.id}`);
        room.removePlayer(socket);
      }
    }
    
    currentRoom = assignRoom();
    myCar = currentRoom.addPlayer(socket, carType, name);
    socket.emit('joined', { roomId: currentRoom.id, carId: myCar.id });
  });
  socket.on('input', (data) => {
    if (!myCar) return;
    
    // Ignore input from crashed cars
    if (myCar.crashedAt) return;
    
    if (data.cursor) {
      myCar.cursor.x = data.cursor.x;
      myCar.cursor.y = data.cursor.y;
      // Store timestamp for potential lag compensation
      myCar.lastInputTime = data.timestamp || Date.now();
      myCar.inputSequence = data.sequence || 0;
    }
  });
  socket.on('upgrade', (data) => {
    if (!myCar) return;
    const stat = data.stat;
    if (myCar.upgradePoints > 0) {
      const carType = CAR_TYPES[myCar.type];
      const upgradeConfig = carType.upgrades[stat];
      
      if (upgradeConfig) {
        // Check if upgrade limit has been reached
        const currentUsage = myCar.upgradeUsage[stat] || 0;
        if (currentUsage >= upgradeConfig.maxUpgrades) {
          return; // Cannot upgrade further
        }
        
        const amount = upgradeConfig.amount;
        
        switch (stat) {
          case 'maxHealth':
            myCar.stats.maxHealth += amount;
            myCar.currentHealth += amount;
            break;
          case 'acceleration':
            myCar.stats.acceleration += amount;
            break;
          case 'regen':
            myCar.stats.regen += amount;
            break;
          case 'size': {
            const scaleFactor = amount * 0.7;
            const currentVertices = myCar.body.vertices.map(v => ({ x: v.x, y: v.y }));

            const centerX = currentVertices.reduce((sum, v) => sum + v.x, 0) / currentVertices.length;
            const centerY = currentVertices.reduce((sum, v) => sum + v.y, 0) / currentVertices.length;

            const scaledVertices = currentVertices.map(vertex => {
              const translatedX = vertex.x - centerX;
              const translatedY = vertex.y - centerY;
              const scaledX = translatedX * scaleFactor;
              const scaledY = translatedY * scaleFactor;
              return { x: scaledX + centerX, y: scaledY + centerY };
            });

            Matter.Body.setVertices(myCar.body, [scaledVertices]);
            Matter.Body.setDensity(myCar.body, myCar.body.density + amount);
            myCar.displaySize += amount;
            myCar.acceleration += amount * 0.1;

            break;
          }
          case 'abilityCooldown':
            // Store cooldown reduction on the car
            if (!myCar.abilityCooldownReduction) myCar.abilityCooldownReduction = 0;
            myCar.abilityCooldownReduction += Math.abs(amount);
            break;
        }
        
        // Track usage and spend upgrade point
        myCar.upgradeUsage[stat] = currentUsage + 1;
        myCar.upgradePoints -= 1;
      }
    }
  });
  
  socket.on('useAbility', () => {
    if (!myCar) return;
    const result = myCar.useAbility(gameState);
    socket.emit('abilityResult', result);
  });
  
  // Ping handler for latency measurement
  socket.on('ping', (timestamp, callback) => {
    if (callback) callback(Date.now());
  });

  // Debug event handlers (only available when DEBUG_MODE is true)
  if (DEBUG_MODE) {
    socket.on('debug:giveUpgradePoints', (data) => {
      if (!myCar) return;
      const points = Math.max(0, Math.min(50, data.points || 1)); // Clamp between 0-50
      myCar.upgradePoints += points;
    });

    socket.on('debug:setLaps', (data) => {
      if (!myCar) return;
      const laps = Math.max(0, Math.min(100, data.laps || 0)); // Clamp between 0-100
      myCar.laps = laps;
    });

    socket.on('debug:setHealth', (data) => {
      if (!myCar) return;
      const health = Math.max(0, Math.min(myCar.stats.maxHealth, data.health || myCar.stats.maxHealth));
      myCar.currentHealth = health;
    });

    socket.on('debug:resetPosition', () => {
      if (!myCar) return;
      myCar.resetCar();
    });

    socket.on('debug:toggleGodMode', () => {
      if (!myCar) return;
      myCar.godMode = !myCar.godMode;
      socket.emit('debug:godModeStatus', { godMode: myCar.godMode });
    });

    socket.on('debug:resetAbilityCooldown', () => {
      if (!myCar || !myCar.ability) return;
      myCar.ability.lastUsed = 0;
    });

    socket.on('debug:setStats', (data) => {
      if (!myCar) return;
      if (typeof data.maxHealth === 'number') {
        myCar.stats.maxHealth = Math.max(1, Math.min(200, data.maxHealth));
      }
      if (typeof data.acceleration === 'number') {
        myCar.stats.acceleration = Math.max(0.001, Math.min(1, data.acceleration));
      }
      if (typeof data.regen === 'number') {
        myCar.stats.regen = Math.max(0, Math.min(5, data.regen));
      }
    });

    socket.on('debug:getPlayerData', () => {
      if (!currentRoom) return;
      const playersData = [];
      for (const [socketId, car] of currentRoom.players.entries()) {
        playersData.push({
          socketId,
          id: car.id,
          name: car.name,
          type: car.type,
          laps: car.laps,
          maxLaps: car.maxLaps,
          health: car.currentHealth,
          maxHealth: car.stats.maxHealth,
          upgradePoints: car.upgradePoints,
          upgradeUsage: car.upgradeUsage,
          godMode: car.godMode || false
        });
      }
      socket.emit('debug:playerData', { players: playersData });
    });

    socket.on('debug:resetUpgrades', () => {
      if (!myCar) return;
      myCar.upgradeUsage = {};
      // Reset stats to base values
      const baseCar = CAR_TYPES[myCar.type];
      myCar.stats = {
        maxHealth: baseCar.maxHealth,
        acceleration: baseCar.acceleration,
        regen: baseCar.regen
      };
      myCar.currentHealth = myCar.stats.maxHealth;
      myCar.abilityCooldownReduction = 0;
      // Reset body density if it was modified
      Matter.Body.setDensity(myCar.body, baseCar.bodyOptions.density || 0.3);
    });

    socket.on('debug:forceAbility', () => {
      if (!myCar || !myCar.ability) return;
      const originalLastUsed = myCar.ability.lastUsed;
      myCar.ability.lastUsed = 0; // Reset cooldown temporarily
      const result = myCar.useAbility(gameState);
      if (!result.success) {
        myCar.ability.lastUsed = originalLastUsed; // Restore if failed
      }
      socket.emit('abilityResult', result);
    });
  }

  socket.on('disconnect', () => {
    // Clean up from all rooms to be safe
    for (const room of rooms) {
      if (room.players.has(socket.id)) {
        room.removePlayer(socket);
      }
    }
    spectators.delete(socket.id); // Remove from spectators
  });
});

const PHYSICS_HZ = 60;
const BROADCAST_HZ = 30;
const timeStep = 1 / PHYSICS_HZ;
let physicsAccumulator = 0;
let lastTime = Date.now();

function gameLoop() {
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  physicsAccumulator += dt;
    while (physicsAccumulator >= timeStep) {
    // Clean up expired ability objects
    gameState.abilityObjects = gameState.abilityObjects.filter(obj => {
      if (Date.now() > obj.expiresAt) {
        Matter.World.remove(world, obj.body);
        return false;
      }
      return true;
    });

    for (const room of rooms) {
      let roundWinner = null;
      for (const [sid, car] of room.players.entries()) {
        car.update(timeStep);
        if (!roundWinner && car.laps >= car.maxLaps) {
          roundWinner = car;
        }
      }
        if (roundWinner) {
          const winnerName = roundWinner.name;
          
          // Broadcast win message to kill feed
          for (const [sid, car] of room.players.entries()) {
            const sock = io.sockets.sockets.get(sid);
            if (sock) {
              sock.emit('killFeedMessage', {
                text: `${winnerName} has won!`,
                type: 'win'
              });
            }
          }
          
          // Short delay to let the kill feed message display before returning to menu
          setTimeout(() => {
            currentMapIndex = (currentMapIndex + 1) % mapKeys.length;
            currentMapKey = mapKeys[currentMapIndex];
            setTrackBodies(currentMapKey);
            room.resetRound();
            for (const [sid, car] of room.players.entries()) {
              const sock = io.sockets.sockets.get(sid);
              if (sock) {
                sock.emit('returnToMenu', { winner: winnerName });
              }
            }
            for (const [sid, car] of room.players.entries()) {
              Matter.World.remove(world, car.body);
            }
            room.players.clear();
          }, 1500); // 1.5 second delay to show win message
          continue;
        }
      for (const [sid, car] of [...room.players.entries()]) {
        if (car.justCrashed) {
          const sock = io.sockets.sockets.get(sid);
          if (sock) {
            // Check if this was a solo crash (not from player collision) and message hasn't been sent yet
            if (!car.crashedByPlayer && !car.killFeedSent) {
              // Broadcast solo crash message to kill feed (send once to each player)
              for (const [socketId, otherCar] of room.players.entries()) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                  socket.emit('killFeedMessage', {
                    text: `${car.name} crashed!`,
                    type: 'crash'
                  });
                }
              }
              // Mark that killfeed message has been sent for this crash
              car.killFeedSent = true;
            }
            
            // Mark the crash timestamp for delayed cleanup
            if (!car.crashedAt) {
              console.log(`crashed`)
              car.crashedAt = Date.now();
              // Stop the car from moving
              Matter.Body.setVelocity(car.body, { x: 0, y: 0 });
              Matter.Body.setAngularVelocity(car.body, 0);
            }
            
            // Don't reset justCrashed here - we need it for client fade detection
            // The killFeedSent flag prevents message spam instead
          }
        }
      }
      
      // Clean up cars that have been crashed for longer than fade duration
      for (const [sid, car] of [...room.players.entries()]) {
        if (car.crashedAt && Date.now() - car.crashedAt > 300) { //500ms
          console.log(`Cleaning up crashed car ${car.name} (${sid}) after ${Date.now() - car.crashedAt}ms`);
          Matter.World.remove(world, car.body);
          room.players.delete(sid);
        }
      }
    }
    Matter.Engine.update(engine, timeStep * 1000);
    physicsAccumulator -= timeStep;
  }
  setImmediate(gameLoop);
}
gameLoop();

setInterval(() => {
  for (const room of rooms) {
    const state = room.state;
    const playerSocketIds = Array.from(room.players.values()).map(p => p.socketId);
    const spectatorSocketIds = Array.from(spectators.keys());
    const allSocketIds = [...new Set([...playerSocketIds, ...spectatorSocketIds])];

    for (const socketId of allSocketIds) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        const map = MAP_TYPES[currentMapKey];
        const clientAbilityObjects = gameState.abilityObjects.map(obj => ({
          id: obj.id,
          type: obj.type,
          position: obj.body.position,
          vertices: obj.body.vertices.map(v => ({ x: v.x - obj.body.position.x, y: v.y - obj.body.position.y })),
          createdBy: obj.createdBy,
          expiresAt: obj.expiresAt,
          render: obj.body.render
        }));
        
        const clientDynamicObjects = currentDynamicBodies.map(body => {
          const objData = {
            id: body.dynamicObject?.id || body.id,
            position: body.position,
            angle: body.angle,
            vertices: body.vertices.map(v => ({ x: v.x - body.position.x, y: v.y - body.position.y })),
            fillColor: body.dynamicObject?.fillColor || [139, 69, 19], // Default brown
            strokeColor: body.dynamicObject?.strokeColor || [101, 67, 33],
            strokeWidth: body.dynamicObject?.strokeWidth || 2
          }
          
          // Only include health data if the object has maxHealth defined
          if (typeof body.dynamicObject?.maxHealth !== 'undefined') {
            objData.health = body.health || body.dynamicObject.maxHealth
            objData.maxHealth = body.dynamicObject.maxHealth
            objData.isDestroyed = body.isDestroyed || false
          }
          
          return objData
        });

        const fullState = {
          players: state,
          mySocketId: socketId,
          map: map,
          abilityObjects: clientAbilityObjects,
          dynamicObjects: clientDynamicObjects,
          timestamp: Date.now()
        };

        const deltaState = createDeltaState(socketId, { players: state });
        
        if (deltaState) {
          // Send delta update
          socket.emit('delta', {
            ...deltaState,
            mySocketId: socketId,
            abilityObjects: clientAbilityObjects,
            dynamicObjects: clientDynamicObjects,
            timestamp: Date.now()
          });
        } else {
          // No changes - send heartbeat
          socket.emit('heartbeat', { timestamp: Date.now() });
        }
        
        // Send full state occasionally to prevent drift
        if (Math.random() < 0.1) { // 10% chance = roughly every second at 30Hz
          socket.emit('state', fullState);
        }
      }
    }
  }
  
  // Broadcast to spectators (reduced frequency)
  if (broadcastTick % 2 === 0) { // 15Hz for spectators
    broadcastToSpectators();
  }
  broadcastTick++;
}, 1000 / BROADCAST_HZ);

// Spectator broadcasting function
function broadcastToSpectators() {
  if (spectators.size === 0) return;
  
  const room = rooms[0]; // Using first room for simplicity
  
  // Create ability objects with full data (same format as game state)
  const clientAbilityObjects = gameState.abilityObjects.map(obj => ({
    id: obj.id,
    type: obj.type,
    position: obj.body.position,
    vertices: obj.body.vertices.map(v => ({ x: v.x - obj.body.position.x, y: v.y - obj.body.position.y })),
    createdBy: obj.createdBy,
    expiresAt: obj.expiresAt,
    render: obj.body.render
  }));
  
  // Create dynamic objects with full data (same format as game state)
  const clientDynamicObjects = currentDynamicBodies.map(body => {
    const objData = {
      id: body.dynamicObject?.id || body.id,
      position: body.position,
      angle: body.angle,
      vertices: body.vertices.map(v => ({ x: v.x - body.position.x, y: v.y - body.position.y })),
      fillColor: body.dynamicObject?.fillColor || [139, 69, 19], // Default brown
      strokeColor: body.dynamicObject?.strokeColor || [101, 67, 33],
      strokeWidth: body.dynamicObject?.strokeWidth || 2
    }
    
    // Only include health data if the object has maxHealth defined
    if (typeof body.dynamicObject?.maxHealth !== 'undefined') {
      objData.health = body.health || body.dynamicObject.maxHealth
      objData.maxHealth = body.dynamicObject.maxHealth
      objData.isDestroyed = body.isDestroyed || false
    }
    
    return objData
  });
  
  // Create spectator-optimized state (always include map, even with no players)
  const spectatorState = {
    players: room && room.players.size > 0 ? Array.from(room.players.values())
      .filter(car => !car.crashedAt) // Exclude crashed cars from spectator view
      .map(car => ({
      id: car.id,
      name: car.name,
      type: car.type,
      x: car.body.position.x,
      y: car.body.position.y,
      angle: car.body.angle,
      health: car.currentHealth,
      maxHealth: car.stats.maxHealth,
      laps: car.laps,
      maxLaps: car.maxLaps,
      color: CAR_TYPES[car.type].color
    })) : [],
    abilityObjects: clientAbilityObjects,
    dynamicObjects: clientDynamicObjects,
    map: MAP_TYPES[currentMapKey], // Always send current map
    timestamp: Date.now()
  };
  
  // Send to all spectators
  for (const [socketId, socket] of spectators) {
    if (socket.connected) {
      socket.emit('spectatorState', spectatorState);
    } else {
      spectators.delete(socketId); // Clean up disconnected spectators
    }
  }
}

let broadcastTick = 0;

server.listen(PORT, () => {
  console.log(`Driftout2 server listening on port ${PORT}`);
});
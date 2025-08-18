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

// send available maps to client
app.get('/api/maps', (req, res) => {
  const mapList = Object.keys(MAP_TYPES).map(key => ({
    key: key,
    name: MAP_TYPES[key].name || key,
    description: MAP_TYPES[key].description || ''
  }));
  res.json(mapList);
});

// send debug mode status to client
app.get('/api/debug', (req, res) => {
  res.json({ debugMode: DEBUG_MODE });
});

// Room management API
app.get('/api/rooms', (req, res) => {
  const roomList = rooms.map(room => ({
    id: room.id,
    name: room.name,
    currentMap: room.currentMapKey,
    activePlayerCount: room.activePlayerCount,
    spectatorCount: room.spectatorCount,
    totalOccupancy: room.totalOccupancy,
    maxPlayers: room.maxPlayers,
    isPrivate: room.isPrivate,
    isJoinable: room.isJoinable,
    // Legacy field for backward compatibility
    playerCount: room.activePlayerCount
  }));
  res.json(roomList);
});

app.post('/api/rooms/create', express.json(), (req, res) => {
  try {
    const { name, mapKey, maxPlayers, isPrivate } = req.body;
    
    // Validation
    if (name && name.length > 50) {
      return res.status(400).json({ error: 'Room name too long' });
    }
    if (mapKey && !MAP_TYPES[mapKey]) {
      return res.status(400).json({ error: 'Invalid map' });
    }
    if (maxPlayers && (maxPlayers < 1 || maxPlayers > 16)) {
      return res.status(400).json({ error: 'Invalid max players (1-16)' });
    }
    
    // Create room
    const roomId = uuidv4();
    const room = new Room(roomId, mapKey || null);
    
    if (name) room.name = name;
    if (maxPlayers) room.maxPlayers = maxPlayers;
    if (typeof isPrivate === 'boolean') room.isPrivate = isPrivate;
    
    rooms.push(room);
    
    res.json({
      id: room.id,
      name: room.name,
      currentMap: room.currentMapKey,
      activePlayerCount: room.activePlayerCount,
      spectatorCount: room.spectatorCount,
      totalOccupancy: room.totalOccupancy,
      maxPlayers: room.maxPlayers,
      isPrivate: room.isPrivate,
      isJoinable: room.isJoinable,
      // Legacy field for backward compatibility
      playerCount: room.activePlayerCount
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
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
// Legacy global track bodies removed - now handled per room

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

// Global physics engine removed - now each room has its own
// const engine = Matter.Engine.create();
// engine.gravity.x = 0;
// engine.gravity.y = 0;
// const world = engine.world;

// Legacy global world reference removed - using room-specific worlds

// Global collision detection removed - now handled per room

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

// Legacy setTrackBodies function removed - now handled per room in Room constructor

class Car {
  constructor(id, type, roomId, socketId, name, room = null) {
    this.id = id;
    this.roomId = roomId;
    this.socketId = socketId;
    this.name = name || '';
    this.type = type;
    this.room = room; // Reference to the room for accessing world and gameState
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
    this.godMode = true; // Spawn protection
    this.spawnProtectionEnd = Date.now() + 1000; // 1 second of spawn protection
    
    // Boost system
    this.maxBoost = CAR_TYPES[type].boost;
    this.currentBoost = this.maxBoost;
    this.boostActive = false;
    
    // Ability system
    const carDef = CAR_TYPES[type];
    this.ability = carDef.ability ? abilityRegistry.create(carDef.ability) : null;
    this.isGhost = false;
    this.trapDamageHistory = new Map();
    const roomMapKey = this.room ? this.room.currentMapKey : currentMapKey;
    const mapDef = MAP_TYPES[roomMapKey];
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
    if (this.room && this.room.world) {
      Matter.World.add(this.room.world, this.body);
    } else {
      console.error(`Car ${this.id} created without proper room reference - this should not happen!`);
      throw new Error('Car must be created with valid room reference');
    }
    this.lastUpdate = Date.now();
  }
  update(dt) {
    // Check spawn protection
    if (this.spawnProtectionEnd && Date.now() > this.spawnProtectionEnd) {
      this.godMode = false;
      this.spawnProtectionEnd = null;
    }
    
    // Update ability effects first
    if (this.ability) {
      const roomWorld = this.room.world;
      const roomGameState = this.room.gameState;
      this.ability.update(this, roomWorld, roomGameState, dt);
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
      let acceleration = this.stats.acceleration;
      // Apply boost: 50% more acceleration when boost is active
      if (this.boostActive && this.currentBoost > 0) {
        acceleration *= 2.0;
        // Consume boost at a rate of 100 boost per second
        const boostConsumptionRate = 10; // boost units per second
        this.currentBoost = Math.max(0, this.currentBoost - boostConsumptionRate * dt);
        
        // Stop boost if we run out
        if (this.currentBoost <= 0) {
          this.boostActive = false;
        }
      }
      
      const forceMag = acceleration * throttle
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
    const roomMapKey = this.room ? this.room.currentMapKey : currentMapKey;
    const checkpoints = MAP_TYPES[roomMapKey]?.checkpoints || []

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
    const mapDef = MAP_TYPES[roomMapKey]
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
      
      // Restore boost on lap completion
      this.currentBoost = this.maxBoost
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
    const roomMapKey = this.room ? this.room.currentMapKey : currentMapKey;
    const map = MAP_TYPES[roomMapKey];
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
    
    // Restore boost on new life
    this.currentBoost = this.maxBoost;
    this.boostActive = false;
    this.justCrashed = false;
    this.crashedByPlayer = false;
    this.killFeedSent = false;
    this.godMode = true; // Respawn protection
    this.spawnProtectionEnd = Date.now() + 1000; // 1 second of spawn protection
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
    
    const roomWorld = this.room ? this.room.world : world;
    const roomGameState = this.room ? this.room.gameState : (gameState || this.room?.gameState);
    return this.ability.activate(this, roomWorld, roomGameState);
  }
}

class Room {
  constructor(id, mapKey = null) {
    this.id = id;
    this.name = `Room ${id.substring(0, 8)}`; // Default name using first 8 chars of UUID
    this.players = new Map(); // socket.id -> Car (active players)
    this.spectators = new Map(); // socket.id -> socket (spectators)
    this.allMembers = new Map(); // socket.id -> {socket, state, joinedAt} (all connected users)
    this.sockets = new Map();
    this.maxPlayers = 8;
    this.isPrivate = false;
    
    // Room-specific physics engine
    this.engine = Matter.Engine.create();
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;
    this.world = this.engine.world;
    
    // Room-specific game state
    this.gameState = {
      abilityObjects: [], // Spike traps, etc.
      activeEffects: []   // Ghost modes, shields, etc.
    };
    
    // Room-specific map
    const mapKeys = Object.keys(MAP_TYPES);
    this.currentMapIndex = 0;
    this.currentMapKey = mapKey || mapKeys[this.currentMapIndex];
    this.currentTrackBodies = [];
    this.currentDynamicBodies = [];
    
    // Set up collision detection for this room's physics world
    this.setupCollisionDetection();
    
    // Set up the track bodies for this room
    this.setTrackBodies(this.currentMapKey);
  }
  
  // User state constants
  static USER_STATES = {
    SPECTATING: 'spectating',
    PLAYING: 'playing',
    LOBBY: 'lobby'
  }
  
  // Computed properties for occupancy tracking
  get activePlayerCount() {
    return this.players.size;
  }
  
  get spectatorCount() {
    return this.spectators.size;
  }
  
  get totalOccupancy() {
    return this.allMembers.size;
  }
  
  get availableSlots() {
    return this.maxPlayers - this.totalOccupancy;
  }
  
  get isJoinable() {
    return !this.isPrivate && this.availableSlots > 0;
  }
  
  get isEmpty() {
    return this.totalOccupancy === 0;
  }
  
  setupCollisionDetection() {
    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair
    
        const isCarA = bodyA.label?.startsWith?.('car-')
        const isCarB = bodyB.label?.startsWith?.('car-')
        const isSpikeA = bodyA.label === 'spike-trap'
        const isSpikeB = bodyB.label === 'spike-trap'
    
        const carA = isCarA ? [...this.players.values()].find(c => c.body === bodyA) : null
        const carB = isCarB ? [...this.players.values()].find(c => c.body === bodyB) : null
    
        // Handle spike trap collisions (ignore owner completely)
        if (isSpikeA && carB) {
          const trap = this.gameState.abilityObjects.find(obj => obj.body === bodyA)
          if (trap) {
            if (trap.createdBy !== carB.id) {
              SpikeTrapAbility.handleCollision(trap, carB)
            }
          }
        }
        if (isSpikeB && carA) {
          const trap = this.gameState.abilityObjects.find(obj => obj.body === bodyB)
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
            this.applyMutualCollisionDamage(carA, carB, impulse, relativeSpeed)
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
            this.applyDynamicObjectDamage(bodyA, bodyB, impulse, relativeSpeed)
          }
          if (isDynamicB && carA) {
            this.applyDynamicObjectDamage(bodyB, bodyA, impulse, relativeSpeed)
          }
        }
      }
    });
  }
  
  // Move collision damage methods from global scope to Room scope
  applyMutualCollisionDamage(carA, carB, impulse, relativeSpeed) {
    if (!carA || !carB || carA.godMode || carB.godMode || carA.isGhost || carB.isGhost) return;
    
    // Store initial health states
    const carAInitialHealth = carA.currentHealth;
    const carBInitialHealth = carB.currentHealth;
    
    // Calculate potential damage for both cars using existing physics formulas
    const damageA = this.calculateCollisionDamage(carA, carB.body, impulse, relativeSpeed);
    const damageB = this.calculateCollisionDamage(carB, carA.body, impulse, relativeSpeed);
    
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
      
      // Broadcast kill feed message to this room
      this.broadcastKillFeedMessage(`${carB.name} crashed ${carA.name}!`, 'crash');
    } else if (carBCrashed && !carACrashed) {
      // carA killed carB - reward carA  
      carA.upgradePoints += 1;
      
      // Broadcast kill feed message to this room
      this.broadcastKillFeedMessage(`${carA.name} crashed ${carB.name}!`, 'crash');
    } else if (carACrashed && carBCrashed) {
      // Both crashed - mutual destruction
      this.broadcastKillFeedMessage(`${carA.name} and ${carB.name} crashed!`, 'crash');
    }
  }
  
  calculateCollisionDamage(car, otherBody, impulse, relativeVelocity, damageScale = 1.0) {
    // Don't take damage if other body is static (walls, barriers)
    if (otherBody.isStatic) {
      const WALL_DAMAGE_SCALE = 0.02
      return impulse * WALL_DAMAGE_SCALE * damageScale
    } else {
      // Physics-based damage calculation using density ratios
      const otherDensity = otherBody.density || 0.001
      const thisDensity = car.body.density || 0.3
      
      // Calculate density ratio (heavier objects deal more damage to lighter ones)
      const densityRatio = otherDensity / thisDensity
      
      // Add velocity factor for more realistic collision damage
      const velocityFactor = Math.sqrt(Math.abs(relativeVelocity)) / 10 || 1
      
      // Cap the damage multiplier to prevent one-hit kills
      const MAX_DAMAGE_MULTIPLIER = 3.0
      const MIN_DAMAGE_MULTIPLIER = 0.5
      const damageMultiplier = Math.max(MIN_DAMAGE_MULTIPLIER, Math.min(MAX_DAMAGE_MULTIPLIER, densityRatio * velocityFactor))
      
      const BASE_DAMAGE_SCALE = 0.05 // Increased for more intense collisions
      return impulse * damageMultiplier * BASE_DAMAGE_SCALE * damageScale
    }
  }
  
  applyDynamicObjectDamage(dynamicBody, carBody, impulse, relativeSpeed) {
    // Implementation for dynamic object damage
    if (dynamicBody.dynamicObject && dynamicBody.dynamicObject.health !== undefined) {
      const damage = impulse * 0.1; // Adjust damage scale as needed
      dynamicBody.dynamicObject.health -= damage;
      
      if (dynamicBody.dynamicObject.health <= 0) {
        // Remove the dynamic object
        Matter.World.remove(this.world, dynamicBody);
        const index = this.currentDynamicBodies.indexOf(dynamicBody);
        if (index > -1) {
          this.currentDynamicBodies.splice(index, 1);
        }
      }
    }
  }
  
  broadcastKillFeedMessage(text, type) {
    for (const [socketId, car] of this.players.entries()) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('killFeedMessage', { text, type });
      }
    }
  }
  
  setTrackBodies(mapKey) {
    // Remove old static bodies
    for (const body of this.currentTrackBodies) {
      Matter.World.remove(this.world, body)
    }
    this.currentTrackBodies = []

    // Remove old dynamic bodies  
    for (const body of this.currentDynamicBodies) {
      Matter.World.remove(this.world, body)
    }
    this.currentDynamicBodies = []

    const map = MAP_TYPES[mapKey]
    const thickness = 10
    if (!map) return

    // Create static track walls from shapes
    if (map.shapes) {
      for (const shape of map.shapes) {
        if (shape.hollow) continue
        if (!Array.isArray(shape.vertices)) continue

        const verts = shape.vertices
        if (verts.length < 3) continue

        // Create individual wall segments between vertices (like legacy system)
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
          this.currentTrackBodies.push(wall)
        }
      }
    }

    // Create dynamic objects
    if (map.dynamicObjects) {
      for (const dynObj of map.dynamicObjects) {
        if (!dynObj.position || typeof dynObj.position.x !== 'number' || typeof dynObj.position.y !== 'number') {
          continue
        }

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
        this.currentDynamicBodies.push(body)
      }
    }

    // Add all bodies to the world
    if (this.currentTrackBodies.length > 0) {
      Matter.World.add(this.world, this.currentTrackBodies)
    }
    if (this.currentDynamicBodies.length > 0) {
      Matter.World.add(this.world, this.currentDynamicBodies)
    }
  }
  
  // User membership management
  addMember(socket, state = Room.USER_STATES.SPECTATING) {
    if (this.availableSlots <= 0) {
      throw new Error('Room is full');
    }
    
    this.allMembers.set(socket.id, {
      socket: socket,
      state: state,
      joinedAt: Date.now()
    });
    
    if (state === Room.USER_STATES.SPECTATING) {
      this.spectators.set(socket.id, socket);
    }
    
    console.log(`User ${socket.id} joined room ${this.name} as ${state}. Occupancy: ${this.totalOccupancy}/${this.maxPlayers}`);
  }
  
  removeMember(socketId) {
    const member = this.allMembers.get(socketId);
    if (!member) return false;
    
    // Remove from specific state collections
    this.spectators.delete(socketId);
    if (this.players.has(socketId)) {
      const car = this.players.get(socketId);
      if (car) {
        Matter.World.remove(this.world, car.body);
      }
      this.players.delete(socketId);
    }
    
    // Remove from main collection
    this.allMembers.delete(socketId);
    
    console.log(`User ${socketId} left room ${this.name}. Occupancy: ${this.totalOccupancy}/${this.maxPlayers}`);
    return true;
  }
  
  // Transition user from spectator to player
  promoteToPlayer(socket, carType, name) {
    const member = this.allMembers.get(socket.id);
    if (!member) {
      throw new Error('User not in room');
    }
    
    if (member.state === Room.USER_STATES.PLAYING) {
      throw new Error('User already playing');
    }
    
    // Remove from spectators
    this.spectators.delete(socket.id);
    
    // Add as player
    const carId = uuidv4();
    const car = new Car(carId, carType, this.id, socket.id, name, this);
    this.players.set(socket.id, car);
    
    // Update member state
    member.state = Room.USER_STATES.PLAYING;
    
    console.log(`User ${socket.id} promoted to player in room ${this.name}. Players: ${this.activePlayerCount}, Total: ${this.totalOccupancy}`);
    return car;
  }
  
  // Transition user from player back to spectator
  demoteToSpectator(socketId) {
    const member = this.allMembers.get(socketId);
    if (!member) return false;
    
    if (member.state !== Room.USER_STATES.PLAYING) return false;
    
    // Remove from players
    if (this.players.has(socketId)) {
      const car = this.players.get(socketId);
      if (car) {
        Matter.World.remove(this.world, car.body);
      }
      this.players.delete(socketId);
    }
    
    // Add back to spectators
    this.spectators.set(socketId, member.socket);
    
    // Update member state
    member.state = Room.USER_STATES.SPECTATING;
    
    console.log(`User ${socketId} demoted to spectator in room ${this.name}. Players: ${this.activePlayerCount}, Total: ${this.totalOccupancy}`);
    return true;
  }
  
  getMemberState(socketId) {
    const member = this.allMembers.get(socketId);
    return member ? member.state : null;
  }
  
  hasMember(socketId) {
    return this.allMembers.has(socketId);
  }
  
  // Allow spectators to rejoin the game
  canRejoinAsPlayer(socketId) {
    const member = this.allMembers.get(socketId);
    return member && member.state === Room.USER_STATES.SPECTATING;
  }
  
  addPlayer(socket, carType, name) {
    const carId = uuidv4();
    const car = new Car(carId, carType, this.id, socket.id, name, this);
    this.players.set(socket.id, car);
    return car;
  }
  removePlayer(socket) {
    const car = this.players.get(socket.id);
    if (car) {
      Matter.World.remove(this.world, car.body);
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
        crashedAt: car.crashedAt || null,
        currentBoost: car.currentBoost,
        maxBoost: car.maxBoost
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

// Initialize with a default room
const rooms = [];

// Create initial room
function initializeRooms() {
  if (rooms.length === 0) {
    console.log('Creating initial default room');
    const defaultRoom = new Room(uuidv4());
    defaultRoom.name = 'Official Room';
    rooms.push(defaultRoom);
  }
}

// Initialize rooms on startup
initializeRooms();

// Legacy global references removed - using room-specific worlds

// Spectator management
const spectators = new Map(); // socket.id -> socket

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
  // Ensure we have at least one room
  if (rooms.length === 0) {
    initializeRooms();
  }
  
  // Try to find an existing room with space (using new occupancy logic)
  for (const room of rooms) {
    if (room.isJoinable) return room;
  }
  
  // If no room available, create a new one
  const newRoom = new Room(uuidv4());
  newRoom.name = `Room ${rooms.length + 1}`;
  rooms.push(newRoom);
  return newRoom;
}

// Ensure we always have at least one joinable room
function ensureDefaultRoom() {
  if (rooms.length === 0) {
    initializeRooms();
    return;
  }
  
  const joinableRooms = rooms.filter(room => room.isJoinable);
  
  if (joinableRooms.length === 0) {
    console.log('Creating default room - no joinable rooms available');
    const defaultRoom = new Room(uuidv4());
    defaultRoom.name = 'Main Room';
    rooms.push(defaultRoom);
    
    // Room created successfully - now using room-specific worlds
  }
}

// Clean up empty rooms (but always keep at least one)
function cleanupEmptyRooms() {
  const nonEmptyRooms = rooms.filter(room => !room.isEmpty);
  const emptyRooms = rooms.filter(room => room.isEmpty);
  
  // Keep at least one room (preferably non-private)
  if (nonEmptyRooms.length === 0 && emptyRooms.length > 1) {
    // Keep the first non-private room, or just the first room
    const roomToKeep = emptyRooms.find(room => !room.isPrivate) || emptyRooms[0];
    const roomsToRemove = emptyRooms.filter(room => room !== roomToKeep);
    
    for (const room of roomsToRemove) {
      const index = rooms.indexOf(room);
      if (index > -1) {
        console.log(`Cleaning up empty room: ${room.name} (${room.id}) - was ${room.totalOccupancy}/${room.maxPlayers}`);
        rooms.splice(index, 1);
      }
    }
  }
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let myCar = null;
  
  // Handle spectator requests (with room support)
  socket.on('requestSpectator', (data = {}) => {
    const { roomId } = data;
    // Clean up from other rooms first
    for (const room of rooms) {
      if (room.hasMember(socket.id)) {
        room.removeMember(socket.id);
      }
    }
    
    // Ensure we have at least one room
    if (rooms.length === 0) {
      initializeRooms();
    }
    
    // Find target room or use first available
    let targetRoom = null;
    if (roomId) {
      targetRoom = rooms.find(room => room.id === roomId);
    }
    if (!targetRoom) {
      targetRoom = rooms[0]; // Default to first room if none specified
    }
    
    try {
      if (targetRoom.isJoinable) {
        targetRoom.addMember(socket, Room.USER_STATES.SPECTATING);
        currentRoom = targetRoom;
        console.log(`User ${socket.id} started spectating room ${targetRoom.name}`);
      } else {
        // Still add to global spectators for backward compatibility
        spectators.set(socket.id, socket);
        console.log(`User ${socket.id} spectating globally (room full)`);
      }
    } catch (error) {
      // Fallback to global spectators
      spectators.set(socket.id, socket);
      console.log(`User ${socket.id} spectating globally (fallback)`);
    }
  });
  
  socket.on('joinGame', ({ carType, name, roomId }) => {
    if (!CAR_TYPES[carType]) return;
    
    // Find target room - either specified room ID or auto-assign
    let targetRoom = null;
    if (roomId) {
      // Try to join specific room
      targetRoom = rooms.find(room => room.id === roomId);
      if (!targetRoom) {
        socket.emit('joinError', { error: 'Room not found' });
        return;
      }
      if (!targetRoom.isJoinable) {
        socket.emit('joinError', { error: 'Room is full' });
        return;
      }
    } else {
      // Auto-assign room (backwards compatibility)
      targetRoom = assignRoom();
    }
    
    // Clean up memberships from OTHER rooms (not the target room)
    for (const room of rooms) {
      if (room !== targetRoom && room.hasMember(socket.id)) {
        console.log(`Removing user ${socket.id} from room ${room.name} before joining new game`);
        room.removeMember(socket.id);
      }
    }
    
    try {
      // Check if user is already a spectator in this room
      if (targetRoom.canRejoinAsPlayer(socket.id)) {
        // User is spectating, promote them to player
        myCar = targetRoom.promoteToPlayer(socket, carType, name);
      } else {
        // Add user to room as member first, then promote to player
        targetRoom.addMember(socket, Room.USER_STATES.SPECTATING);
        myCar = targetRoom.promoteToPlayer(socket, carType, name);
      }
      
      currentRoom = targetRoom;
      socket.emit('joined', { 
        roomId: currentRoom.id, 
        carId: myCar.id,
        roomName: currentRoom.name,
        currentMap: currentRoom.currentMapKey
      });
    } catch (error) {
      console.error(`Error joining game for socket ${socket.id}:`, error);
      socket.emit('joinError', { error: error.message });
    }
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
    
    // Handle boost input
    if (typeof data.boostActive === 'boolean') {
      myCar.boostActive = data.boostActive && myCar.currentBoost > 0;
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
    if (!myCar || !currentRoom) return;
    const result = myCar.useAbility(currentRoom.gameState);
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
    // Clean up from all rooms using new membership system
    for (const room of rooms) {
      if (room.hasMember(socket.id)) {
        console.log(`User ${socket.id} disconnected from room ${room.name}`);
        room.removeMember(socket.id);
      }
    }
    
    // Clean up from global spectators (legacy)
    spectators.delete(socket.id);
    
    // Reset local variables
    currentRoom = null;
    myCar = null;
    
    // Ensure at least one joinable room remains after disconnection
    ensureDefaultRoom();
    
    // Clean up empty rooms
    cleanupEmptyRooms();
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
    
    for (const room of rooms) {
      // Clean up expired ability objects per room
      room.gameState.abilityObjects = room.gameState.abilityObjects.filter(obj => {
        if (Date.now() > obj.expiresAt) {
          Matter.World.remove(room.world, obj.body);
          return false;
        }
        return true;
      });
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
            // Cycle to next map for this room
            const mapKeys = Object.keys(MAP_TYPES);
            room.currentMapIndex = (room.currentMapIndex + 1) % mapKeys.length;
            room.currentMapKey = mapKeys[room.currentMapIndex];
            room.setTrackBodies(room.currentMapKey);
            room.resetRound();
            for (const [sid, car] of room.players.entries()) {
              const sock = io.sockets.sockets.get(sid);
              if (sock) {
                sock.emit('returnToMenu', { winner: winnerName });
              }
            }
            for (const [sid, car] of room.players.entries()) {
              Matter.World.remove(room.world, car.body);
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
          
          // Demote crashed player to spectator instead of removing entirely
          const wasPlayer = room.players.has(sid);
          if (wasPlayer) {
            room.demoteToSpectator(sid);
            console.log(`Player ${car.name} (${sid}) demoted to spectator after crash`);
          }
        }
      }
      
      // Update physics engine for this room
      Matter.Engine.update(room.engine, timeStep * 1000);
    }
    physicsAccumulator -= timeStep;
  }
  setImmediate(gameLoop);
}
gameLoop();

setInterval(() => {
  for (const room of rooms) {
    const state = room.state;
    const playerSocketIds = Array.from(room.players.values()).map(p => p.socketId);
    const roomSpectatorSocketIds = Array.from(room.spectators.keys());
    const globalSpectatorSocketIds = Array.from(spectators.keys()); // Legacy support
    const allSocketIds = [...new Set([...playerSocketIds, ...roomSpectatorSocketIds, ...globalSpectatorSocketIds])];

    for (const socketId of allSocketIds) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        const map = MAP_TYPES[room.currentMapKey];
        const clientAbilityObjects = room.gameState.abilityObjects.map(obj => ({
          id: obj.id,
          type: obj.type,
          position: obj.body.position,
          vertices: obj.body.vertices.map(v => ({ x: v.x - obj.body.position.x, y: v.y - obj.body.position.y })),
          createdBy: obj.createdBy,
          expiresAt: obj.expiresAt,
          render: obj.body.render
        }));
        
        const clientDynamicObjects = room.currentDynamicBodies.map(body => {
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
  // Check if there are any spectators (global + room-specific)
  const hasGlobalSpectators = spectators.size > 0;
  const hasRoomSpectators = rooms.some(room => room.spectators.size > 0);
  
  if (!hasGlobalSpectators && !hasRoomSpectators) return;
  
  // Broadcast to spectators in each room + global spectators for the first room
  for (const room of rooms) {
    // Create ability objects with full data (same format as game state)
    const clientAbilityObjects = room.gameState.abilityObjects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: obj.body.position,
      vertices: obj.body.vertices.map(v => ({ x: v.x - obj.body.position.x, y: v.y - obj.body.position.y })),
      createdBy: obj.createdBy,
      expiresAt: obj.expiresAt,
      render: obj.body.render
    }));
    
    // Create dynamic objects with full data (same format as game state)
    const clientDynamicObjects = room.currentDynamicBodies.map(body => {
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
      map: MAP_TYPES[room.currentMapKey], // Always send current map
      timestamp: Date.now()
    };
    
    // Send to room-specific spectators
    for (const [socketId, socket] of room.spectators) {
      if (socket.connected) {
        socket.emit('spectatorState', spectatorState);
      } else {
        room.spectators.delete(socketId); // Clean up disconnected spectators
      }
    }
    
    // Send to global spectators (legacy support) - only for first room
    if (room === rooms[0]) {
      for (const [socketId, socket] of spectators) {
        if (socket.connected) {
          socket.emit('spectatorState', spectatorState);
        } else {
          spectators.delete(socketId); // Clean up disconnected spectators
        }
      }
    }
  }
}

let broadcastTick = 0;

// Room maintenance interval - run every 30 seconds
setInterval(() => {
  cleanupEmptyRooms();
  ensureDefaultRoom();
}, 30000);

// Run initial room maintenance
ensureDefaultRoom();

server.listen(PORT, () => {
  console.log(`Driftout2 server listening on port ${PORT}`);
});
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Matter = require('matter-js');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('client'));

// send car types to client
app.get('/api/carTypes', (req, res) => {
  res.json(CAR_TYPES);
});

const PORT = process.env.PORT || 3000;

const HELPERS = require('./helpers');

const MAP_TYPES = require('./mapTypes');
const mapKeys = Object.keys(MAP_TYPES);
let currentMapIndex = 0;
let currentMapKey = mapKeys[currentMapIndex];
let currentTrackBodies = [];

function pointInPolygon(x, y, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
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

    const carA = isCarA ? [...rooms[0].players.values()].find(c => c.body === bodyA) : null
    const carB = isCarB ? [...rooms[0].players.values()].find(c => c.body === bodyB) : null

    const impulse = pair.collision.depth * 100 // crude impulse estimation

    if (carA) carA.applyCollisionDamage(bodyB, impulse)
    if (carB) carB.applyCollisionDamage(bodyA, impulse)
  }
})



function setTrackBodies(mapKey) {
  for (const body of currentTrackBodies) {
    Matter.World.remove(world, body)
  }
  currentTrackBodies = []

  const map = MAP_TYPES[mapKey]
  const thickness = 10
  if (!map || !map.shapes) return

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

  if (currentTrackBodies.length > 0) {
    Matter.World.add(world, currentTrackBodies)
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
    this.upgradePoints = 0;
    this.prevFinishCheck = null; // used for lap crossing on square track
    this.cursor = { x: 0, y: 0 }; // direction and intensity from client
    this.justCrashed = false;
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
      true
    )
    this.displaySize = 15 // used for rendering hud around car (health bars, etc.)
  }
    Matter.Body.setAngle(this.body, 0);
    Matter.World.add(world, this.body);
    this.lastUpdate = Date.now();
  }
  update(dt) {
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
    Matter.Body.setPosition(this.body, { x: startPos.x, y: startPos.y });
    Matter.Body.setVelocity(this.body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(this.body, 0);
    Matter.Body.setAngle(this.body, 0);
  }
  applyCollisionDamage(otherBody, impulse) {
    const DAMAGE_SCALE = 0.05 // adjust to tune how much damage per impulse
    const damage = impulse * DAMAGE_SCALE
    this.currentHealth -= damage

    if (this.currentHealth <= 0) {
      this.justCrashed = true
    }
  }
}

class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map(); // socket.id -> Car
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
        upgradePoints: car.upgradePoints,
        color: CAR_TYPES[car.type].color,
        shape: CAR_TYPES[car.type].shape,
        name: car.name,
        vertices: car.body.vertices.map(v => ({
          x: v.x - pos.x,
          y: v.y - pos.y
        }))
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
  socket.on('joinGame', ({ carType, name }) => {
    if (!CAR_TYPES[carType]) return;
    currentRoom = assignRoom();
    myCar = currentRoom.addPlayer(socket, carType, name);
    socket.emit('joined', { roomId: currentRoom.id, carId: myCar.id });
  });
  socket.on('input', (data) => {
    if (!myCar) return;
    if (data.cursor) {
      myCar.cursor.x = data.cursor.x;
      myCar.cursor.y = data.cursor.y;
    }
  });
  socket.on('upgrade', (data) => {
    if (!myCar) return;
    const stat = data.stat;
    if (myCar.upgradePoints > 0) {
      switch (stat) {
        case 'maxHealth':
          myCar.stats.maxHealth += 2;
          myCar.currentHealth += 2;
          break;
        case 'acceleration':
          myCar.stats.acceleration += 5;
          break;
        case 'regen':
          myCar.stats.regen += 0.1;
          break;
      }
      myCar.upgradePoints -= 1;
    }
  });
  socket.on('disconnect', () => {
    if (currentRoom) currentRoom.removePlayer(socket);
  });
});

const PHYSICS_HZ = 60;
const BROADCAST_HZ = 20;
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
      let roundWinner = null;
      for (const [sid, car] of room.players.entries()) {
        car.update(timeStep);
        if (!roundWinner && car.laps >= 10) {
          roundWinner = car;
        }
      }
        if (roundWinner) {
          const winnerName = roundWinner.name;
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
          continue;
        }
      for (const [sid, car] of [...room.players.entries()]) {
        if (car.justCrashed) {
          const sock = io.sockets.sockets.get(sid);
          if (sock) {
            sock.emit('returnToMenu', { crashed: true });
          }
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
    for (const [socketId] of room.players) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        const map = MAP_TYPES[currentMapKey];
        socket.emit('state', {
          players: state,
          mySocketId: socketId,
          map: map
        });
      }
    }
  }
}, 1000 / BROADCAST_HZ);

server.listen(PORT, () => {
  console.log(`Driftout2 server listening on port ${PORT}`);
});
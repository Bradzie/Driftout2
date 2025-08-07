const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const planck = require('planck-js');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('client'));
const PORT = process.env.PORT || 3000;

// basic track
const TRACK_OUTER_RADIUS = 250;
const TRACK_INNER_RADIUS = 150;

// Car definitions
const CAR_TYPES = {
  Speedster: {
    displayName: 'Speedster',
    maxHealth: 10,
    acceleration: 40,       // Force magnitude when accelerating
    regen: 0.5,             // Health regenerated per second
    color: { fill: [20, 20, 200], stroke: [100, 100, 255] },
    shape: 'triangle'
  },
  Heavy: {
    displayName: 'Heavy',
    maxHealth: 20,
    acceleration: 25,
    regen: 0.25,
    color: { fill: [50, 255, 150], stroke: [0, 150, 50] },
    shape: 'circle'
  }
};

// Planck physics setup
const world = planck.World({ gravity: planck.Vec2(0, 0) });

// Create static bodies for the track boundaries
function createTrack() {
  const segments = 64;
  const outerVertices = [];
  const innerVertices = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const ox = TRACK_OUTER_RADIUS * Math.cos(angle);
    const oy = TRACK_OUTER_RADIUS * Math.sin(angle);
    const ix = TRACK_INNER_RADIUS * Math.cos(-angle);
    const iy = TRACK_INNER_RADIUS * Math.sin(-angle);
    outerVertices.push(planck.Vec2(ox, oy));
    innerVertices.push(planck.Vec2(ix, iy));
  }
  // outer circle
  const outerBody = world.createBody();
  outerBody.createFixture(planck.Chain(outerVertices, true), {
    userData: { type: 'track', boundary: 'outer' },
    friction: 0.2,
    restitution: 0.5
  });
  // inner circle
  const innerBody = world.createBody();
  innerBody.createFixture(planck.Chain(innerVertices, true), {
    userData: { type: 'track', boundary: 'inner' },
    friction: 0.2,
    restitution: 0.5
  });
}
createTrack();

// car starts between the inner and outer radii, oriented horizontally toward positive Y
class Car {
  constructor(id, type, roomId) {
    this.id = id;
    this.roomId = roomId;
    this.type = type;
    this.stats = {
      maxHealth: CAR_TYPES[type].maxHealth,
      acceleration: CAR_TYPES[type].acceleration,
      regen: CAR_TYPES[type].regen
    };
    this.currentHealth = this.stats.maxHealth;
    this.laps = 0;
    this.upgradePoints = 0;
    this.prevY = null; // track lap crossing
    this.angle = 0;
    this.inputs = { left: false, right: false, accelerate: false };
    const startRadius = (TRACK_INNER_RADIUS + TRACK_OUTER_RADIUS) / 2;
    const startX = startRadius;
    const startY = 0;
    this.body = world.createBody({
      type: 'dynamic',
      position: planck.Vec2(startX, startY),
      angle: this.angle,
      linearDamping: 2.0,
      angularDamping: 5.0
    });
    // car shapes
    if (CAR_TYPES[type].shape === 'circle') {
      const radius = 10;
      this.fixture = this.body.createFixture(planck.Circle(radius), {
        density: 1.0,
        friction: 0.5,
        restitution: 0.2,
        userData: { type: 'car', id: this.id }
      });
      this.displaySize = radius;
    } else {
      const verts = [
        planck.Vec2(15, 0),
        planck.Vec2(-10, 8),
        planck.Vec2(-10, -8)
      ];
      this.fixture = this.body.createFixture(planck.Polygon(verts), {
        density: 1.0,
        friction: 0.5,
        restitution: 0.2,
        userData: { type: 'car', id: this.id }
      });
      this.displaySize = 15;
    }
    // keep track of last update time for frame by frame stats
    this.lastUpdate = Date.now();
  }
  update(dt) {
    const rotSpeed = 2.5;
    if (this.inputs.left) this.angle -= rotSpeed * dt;
    if (this.inputs.right) this.angle += rotSpeed * dt;
    const pos = this.body.getPosition();
    this.body.setTransform(pos, this.angle);
    if (this.inputs.accelerate) {
      const force = planck.Vec2(
        Math.cos(this.angle) * this.stats.acceleration,
        Math.sin(this.angle) * this.stats.acceleration
      );
      this.body.applyForceToCenter(force, true);
    }
    // health regen
    this.currentHealth = Math.min(
      this.stats.maxHealth,
      this.currentHealth + this.stats.regen * dt
    );
    // lap finish detect
    const currentY = pos.y;
    const currentX = pos.x;
    if (this.prevY !== null) {
      if (this.prevY > 0 && currentY <= 0 && currentX > 0) {
        this.laps += 1;
        this.upgradePoints += 1;
      }
    }
    this.prevY = currentY;
    // out of bounds = death
    const radialDist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
    if (radialDist > TRACK_OUTER_RADIUS || radialDist < TRACK_INNER_RADIUS) {
      this.resetCar();
    }
  }
  resetCar() {
    // reset on crash
    const startRadius = (TRACK_INNER_RADIUS + TRACK_OUTER_RADIUS) / 2;
    this.laps = 0;
    this.currentHealth = this.stats.maxHealth;
    this.prevY = null;
    this.angle = 0;
    this.body.setLinearVelocity(planck.Vec2(0, 0));
    this.body.setAngularVelocity(0);
    this.body.setTransform(planck.Vec2(startRadius, 0), this.angle);
  }
}

// room management
class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map(); // socket.id -> Car
  }
  addPlayer(socket, carType) {
    const carId = uuidv4();
    const car = new Car(carId, carType, this.id);
    this.players.set(socket.id, car);
    return car;
  }
  removePlayer(socket) {
    const car = this.players.get(socket.id);
    if (car) {
      world.destroyBody(car.body);
      this.players.delete(socket.id);
    }
  }
  get state() {
    // return room-wide state
    const cars = [];
    for (const [sid, car] of this.players.entries()) {
      const pos = car.body.getPosition();
      cars.push({
        socketId: sid,
        id: car.id,
        type: car.type,
        x: pos.x,
        y: pos.y,
        angle: car.angle,
        health: car.currentHealth,
        maxHealth: car.stats.maxHealth,
        laps: car.laps,
        upgradePoints: car.upgradePoints,
        color: CAR_TYPES[car.type].color,
        shape: CAR_TYPES[car.type].shape
      });
    }
    return cars;
  }
  resetRound() {
    // Reset all players when someone completes 10 laps
    for (const car of this.players.values()) {
      car.resetCar();
      car.upgradePoints = 0;
    }
  }
}

const rooms = [new Room(uuidv4())];

function assignRoom() {
  // Find the first room with space or create a new one
  for (const room of rooms) {
    if (room.players.size < 8) return room;
  }
  const newRoom = new Room(uuidv4());
  rooms.push(newRoom);
  return newRoom;
}

// Handle socket connections
io.on('connection', (socket) => {
  let currentRoom = null;
  let myCar = null;
  // Client requests to join the game with a chosen car type
  socket.on('joinGame', ({ carType }) => {
    if (!CAR_TYPES[carType]) return;
    currentRoom = assignRoom();
    myCar = currentRoom.addPlayer(socket, carType);
    // Notify client of their unique car id and room
    socket.emit('joined', { roomId: currentRoom.id, carId: myCar.id });
  });
  // Update player inputs
  socket.on('input', (data) => {
    if (!myCar) return;
    myCar.inputs.left = !!data.left;
    myCar.inputs.right = !!data.right;
    myCar.inputs.accelerate = !!data.accelerate;
  });
  // Handle upgrade requests
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
  // Clean up on disconnect
  socket.on('disconnect', () => {
    if (currentRoom) currentRoom.removePlayer(socket);
  });
});

// Physics update loop. We use a fixed time step for the physics simulation and
// a lower tick rate for broadcasting state to clients. Planck.js requires
// relatively small time steps for stable simulation.
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
  // Step the world multiple times if needed to catch up
  while (physicsAccumulator >= timeStep) {
    for (const room of rooms) {
      for (const car of room.players.values()) {
        car.update(timeStep);
        // Check if this car has completed 10 laps and restart the round
        if (car.laps >= 10) {
          room.resetRound();
          io.to([...room.players.keys()]).emit('roundEnd', {
            winner: car.id
          });
          break;
        }
      }
    }
    world.step(timeStep);
    physicsAccumulator -= timeStep;
  }
  setImmediate(gameLoop);
}
gameLoop();

// Broadcast state at a lower frequency to reduce bandwidth. Each client
// receives the state of all players in their room along with their own id.
setInterval(() => {
  for (const room of rooms) {
    const state = room.state;
    for (const [socketId] of room.players) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('state', { players: state, mySocketId: socketId });
      }
    }
  }
}, 1000 / BROADCAST_HZ);

server.listen(PORT, () => {
  console.log(`Driftout2 server listening on port ${PORT}`);
});
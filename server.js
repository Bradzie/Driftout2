/*
 * Driftout2 server
 *
 * This server provides a simple, extensible foundation for a multiplayer racing
 * game inspired by the original DriftoutIO project. It uses Node.js with
 * Express to serve static assets and Socket.io for real‑time communication. The
 * physics simulation is handled server‑side using Planck.js, making the server
 * authoritative over player movement and collision resolution. Clients send
 * lightweight input packets and receive periodic state updates.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const planck = require('planck-js');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the client directory
app.use(express.static('client'));

// Basic configuration
const PORT = process.env.PORT || 3000;

// Track definition: A square track defined by inner and outer half lengths.
// The course is centred on (0,0). The outer square has side length
// 2*TRACK_HALF_OUTER and the inner square has side length 2*TRACK_HALF_INNER.
// Players race in the corridor between the two squares. Feel free to adjust
// these values to make the track larger or narrower. A larger value creates
// more room to manoeuvre.
const TRACK_HALF_OUTER = 300;
const TRACK_HALF_INNER = 150;

// Car definitions. These are deliberately simple for the prototype but can be
// extended with additional properties and abilities. Colours are inspired by
// the original DriftoutIO classes (Racer and Tank) to give a familiar feel.
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

// Physical world setup
const world = planck.World({ gravity: planck.Vec2(0, 0) });

// Create static bodies for the track boundaries. Two chain shapes form a
// concentric square outline. Cars can collide with these boundaries and will
// bounce back into the corridor.
function createTrack() {
  // Outer square vertices (counter‑clockwise)
  const ho = TRACK_HALF_OUTER;
  const outerVertices = [
    planck.Vec2(-ho, -ho),
    planck.Vec2(ho, -ho),
    planck.Vec2(ho, ho),
    planck.Vec2(-ho, ho)
  ];
  // Inner square vertices (clockwise)
  const hi = TRACK_HALF_INNER;
  const innerVertices = [
    planck.Vec2(-hi, -hi),
    planck.Vec2(-hi, hi),
    planck.Vec2(hi, hi),
    planck.Vec2(hi, -hi)
  ];
  const outerBody = world.createBody();
  outerBody.createFixture(planck.Chain(outerVertices, true), {
    userData: { type: 'track', boundary: 'outer' },
    friction: 0.2,
    restitution: 0.5
  });
  const innerBody = world.createBody();
  innerBody.createFixture(planck.Chain(innerVertices, true), {
    userData: { type: 'track', boundary: 'inner' },
    friction: 0.2,
    restitution: 0.5
  });
}
createTrack();

// Helper to spawn a car at the starting position. Cars start between the inner
// and outer radii, oriented horizontally toward positive Y. Each car has its
// own Planck body and tracks its own state server‑side.
class Car {
  /**
   * @param {string} id Unique car identifier
   * @param {string} type Car type key (must exist in CAR_TYPES)
   * @param {string} roomId Room identifier
   * @param {string} socketId Owning socket id
   * @param {string} name Display name chosen by the player
   */
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
    this.angle = 0;
    this.cursor = { x: 0, y: 0 }; // direction and intensity from client
    this.justCrashed = false;
    // Starting position halfway between inner and outer squares on the positive X axis
    const startPos = (TRACK_HALF_INNER + TRACK_HALF_OUTER) / 2;
    this.body = world.createBody({
      type: 'dynamic',
      position: planck.Vec2(startPos, 0),
      angle: this.angle,
      linearDamping: 2.5,
      angularDamping: 5.0
    });
    // Collision shape
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
      const verts = [planck.Vec2(15, 0), planck.Vec2(-10, 8), planck.Vec2(-10, -8)];
      this.fixture = this.body.createFixture(planck.Polygon(verts), {
        density: 1.0,
        friction: 0.5,
        restitution: 0.2,
        userData: { type: 'car', id: this.id }
      });
      this.displaySize = 15;
    }
    this.lastUpdate = Date.now();
  }
  update(dt) {
    // Cursor‑based movement. Cursor vectors are provided by the client in
    // screen pixel space relative to the centre of the canvas. The magnitude
    // controls throttle: distances greater than CURSOR_MAX yield full force.
    const CURSOR_MAX = 100;
    const MAX_ROT_SPEED = Math.PI * 6; // radians per second (~1080°/s)
    const cx = this.cursor.x;
    const cy = -this.cursor.y; // invert y (screen y downwards)
    const mag = Math.sqrt(cx * cx + cy * cy);
    if (mag > 1) {
      const normX = cx / mag;
      const normY = cy / mag;
      const throttle = Math.min(mag, CURSOR_MAX) / CURSOR_MAX;
      const desiredAngle = Math.atan2(normY, normX);
      // Normalize angle difference to [-pi, pi]
      let diff = desiredAngle - this.angle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const maxTurn = MAX_ROT_SPEED * dt;
      diff = Math.max(-maxTurn, Math.min(maxTurn, diff));
      this.angle += diff;
      const pos = this.body.getPosition();
      this.body.setTransform(pos, this.angle);
      // Apply acceleration scaled by throttle
      const forceMag = this.stats.acceleration * throttle;
      const force = planck.Vec2(Math.cos(this.angle) * forceMag, Math.sin(this.angle) * forceMag);
      this.body.applyForceToCenter(force, true);
    }
    // Passive regen
    this.currentHealth = Math.min(
      this.stats.maxHealth,
      this.currentHealth + this.stats.regen * dt
    );
    // Lap detection: crossing the finish line on the right side (x near outer boundary)
    const pos = this.body.getPosition();
    const check = pos.y > 0 ? 1 : (pos.y < 0 ? -1 : 0);
    // We consider a crossing when the sign of y changes from positive to negative
    if (this.prevFinishCheck !== null) {
      if (this.prevFinishCheck > 0 && check <= 0 && pos.x > 0) {
        this.laps += 1;
        this.upgradePoints += 1;
      }
    }
    this.prevFinishCheck = check;
    // Crash detection: car outside outer square or inside inner square
    const ax = Math.abs(pos.x);
    const ay = Math.abs(pos.y);
    if (ax > TRACK_HALF_OUTER || ay > TRACK_HALF_OUTER || (ax < TRACK_HALF_INNER && ay < TRACK_HALF_INNER)) {
      this.resetCar();
      this.justCrashed = true;
    }
  }
  resetCar() {
    // Reset state after crash. We reset laps and health. The actual removal from
    // room and notification is handled outside this class.
    const startPos = (TRACK_HALF_INNER + TRACK_HALF_OUTER) / 2;
    this.laps = 0;
    this.currentHealth = this.stats.maxHealth;
    this.prevFinishCheck = null;
    this.angle = 0;
    this.body.setLinearVelocity(planck.Vec2(0, 0));
    this.body.setAngularVelocity(0);
    this.body.setTransform(planck.Vec2(startPos, 0), this.angle);
  }
}

// Room management. Each room can host up to 8 players. For early development
// there will typically only be one room. When a new client joins the game
// assign them to the first room with available space.
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
      world.destroyBody(car.body);
      this.players.delete(socket.id);
    }
  }
  get state() {
    // Return a serializable state for all cars in this room
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
        shape: CAR_TYPES[car.type].shape,
        name: car.name
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
  socket.on('joinGame', ({ carType, name }) => {
    if (!CAR_TYPES[carType]) return;
    currentRoom = assignRoom();
    myCar = currentRoom.addPlayer(socket, carType, name);
    // Notify client of their unique car id and room
    socket.emit('joined', { roomId: currentRoom.id, carId: myCar.id });
  });
  // Update player inputs
  socket.on('input', (data) => {
    if (!myCar) return;
    if (data.cursor) {
      myCar.cursor.x = data.cursor.x;
      myCar.cursor.y = data.cursor.y;
    }
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
      // We'll track winner per room
      let roundWinner = null;
      for (const [sid, car] of room.players.entries()) {
        car.update(timeStep);
        // If a player hits the lap target, declare them the winner
        if (!roundWinner && car.laps >= 10) {
          roundWinner = car;
        }
      }
      // Handle crashes and winners after updates to avoid modifying the players map during iteration
      if (roundWinner) {
        // Reset the round for all players and send them back to the menu
        const winnerName = roundWinner.name;
        room.resetRound();
        for (const [sid, car] of room.players.entries()) {
          const sock = io.sockets.sockets.get(sid);
          if (sock) {
            sock.emit('returnToMenu', { winner: winnerName });
          }
        }
        // Destroy all cars and empty the room; players must rejoin
        for (const [sid, car] of room.players.entries()) {
          world.destroyBody(car.body);
        }
        room.players.clear();
        continue;
      }
      // Process crashes: remove crashed players and notify them
      for (const [sid, car] of [...room.players.entries()]) {
        if (car.justCrashed) {
          const sock = io.sockets.sockets.get(sid);
          if (sock) {
            sock.emit('returnToMenu', { crashed: true });
          }
          world.destroyBody(car.body);
          room.players.delete(sid);
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
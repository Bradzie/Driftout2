(() => {
  const socket = io();
  // track constants mirror server values for drawing.
  const TRACK_OUTER_RADIUS = 250;
  const TRACK_INNER_RADIUS = 150;

  const menu = document.getElementById('menu');
  const joinButton = document.getElementById('joinButton');
  const gameCanvas = document.getElementById('gameCanvas');
  const hud = document.getElementById('hud');
  const healthSpan = document.getElementById('health');
  const lapsSpan = document.getElementById('laps');
  const upgradeContainer = document.getElementById('upgrades');
  const upgradePointsSpan = document.getElementById('upgradePoints');
  const messageDiv = document.getElementById('message');

  const ctx = gameCanvas.getContext('2d');
  let players = [];
  let mySocketId = null;
  let inputState = { left: false, right: false, accelerate: false };
  let sendInputInterval = null;

  // resize canvas to fill the window
  function resizeCanvas() {
    gameCanvas.width = window.innerWidth;
    gameCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // join the game when the button is clicked
  joinButton.addEventListener('click', () => {
    const selected = document.querySelector('input[name="car"]:checked');
    const carType = selected ? selected.value : 'Speedster';
    socket.emit('joinGame', { carType });
  });

  // after server acknowledges joining, hide the menu and start sending inputs
  socket.on('joined', (data) => {
    mySocketId = data.carId ? null : null; // client uses socket id to identify itself later
    menu.style.display = 'none';
    gameCanvas.style.display = 'block';
    hud.style.display = 'flex';
    // start input transmission loop
    sendInputInterval = setInterval(() => {
      socket.emit('input', inputState);
    }, 1000 / 60);
  });

  // receive state updates from server
  socket.on('state', (data) => {
    players = data.players;
    mySocketId = data.mySocketId;
    drawGame();
  });

  // handle round end message
  socket.on('roundEnd', ({ winner }) => {
    messageDiv.textContent = `Player ${winner} completed 10 laps! Restarting round...`;
    messageDiv.classList.remove('hidden');
    setTimeout(() => {
      messageDiv.classList.add('hidden');
    }, 4000);
  });

  // keyboard controls
  const keyMap = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'accelerate',
    ArrowDown: null,
    a: 'left',
    d: 'right',
    w: 'accelerate',
    s: null
  };

  function setInputFromKey(key, isDown) {
    const action = keyMap[key];
    if (action) {
      inputState[action] = isDown;
    }
  }

  window.addEventListener('keydown', (e) => {
    setInputFromKey(e.key, true);
  });
  window.addEventListener('keyup', (e) => {
    setInputFromKey(e.key, false);
  });

  // ppgrade button events
  upgradeContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const stat = e.target.dataset.stat;
      socket.emit('upgrade', { stat });
    }
  });

  // drawing
  function drawGame() {
    const width = gameCanvas.width;
    const height = gameCanvas.height;
    ctx.clearRect(0, 0, width, height);
    const scale = (Math.min(width, height) * 0.8) / (TRACK_OUTER_RADIUS * 2);
    const centerX = width / 2;
    const centerY = height / 2;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(1, -1);
    ctx.beginPath();
    ctx.arc(0, 0, TRACK_OUTER_RADIUS * scale, 0, 2 * Math.PI);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(200,200,200,0.4)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, TRACK_INNER_RADIUS * scale, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    const startX = (TRACK_OUTER_RADIUS - 5) * scale;
    ctx.moveTo(startX, -20 * scale);
    ctx.lineTo(startX, 20 * scale);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    // draw cars
    players.forEach((p) => {
      const px = p.x * scale;
      const py = p.y * scale;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-p.angle); // invert because we flipped Y axis
      // set colours
      ctx.fillStyle = `rgb(${p.color.fill[0]},${p.color.fill[1]},${p.color.fill[2]})`;
      ctx.strokeStyle = `rgb(${p.color.stroke[0]},${p.color.stroke[1]},${p.color.stroke[2]})`;
      ctx.lineWidth = 3;
      const size = (p.shape === 'circle' ? 10 : 15) * scale;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else {
        // triangle
        ctx.beginPath();
        ctx.moveTo(15 * scale, 0);
        ctx.lineTo(-10 * scale, 8 * scale);
        ctx.lineTo(-10 * scale, -8 * scale);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    });
    ctx.restore();
    // update HUD
    const me = players.find((p) => p.socketId === mySocketId);
    if (me) {
      healthSpan.textContent = `HP: ${me.health.toFixed(0)}/${me.maxHealth}`;
      lapsSpan.textContent = `Laps: ${me.laps}`;
      upgradePointsSpan.textContent = me.upgradePoints;
      if (me.upgradePoints > 0) {
        upgradeContainer.classList.remove('hidden');
      } else {
        upgradeContainer.classList.add('hidden');
      }
    }
  }
})();
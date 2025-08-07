/*
 * Driftout2 client
 *
 * Handles client‑side UI, input collection, and rendering. The server is
 * authoritative over physics, so the client simply draws what it receives and
 * sends control inputs back. Drawing uses the HTML5 canvas API instead of
 * frameworks to keep dependencies minimal.
 */

(() => {
  const socket = io();
  // Track constants mirror server values for drawing. If you tweak these
  // values on the server, update them here as well.
  // These constants mirror those defined on the server. They determine the
  // half lengths of the outer and inner square boundaries used to draw the
  // track. Adjust these values if you modify the server track dimensions.
  const TRACK_HALF_OUTER = 300;
  const TRACK_HALF_INNER = 150;

  const menu = document.getElementById('menu');
  const joinButton = document.getElementById('joinButton');
  const nameInput = document.getElementById('nameInput');
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
  let inputState = { cursor: { x: 0, y: 0 } };
  let sendInputInterval = null;

  // Resize canvas to fill the window
  function resizeCanvas() {
    gameCanvas.width = window.innerWidth;
    gameCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Join the game when the button is clicked
  joinButton.addEventListener('click', () => {
    const selected = document.querySelector('input[name="car"]:checked');
    const carType = selected ? selected.value : 'Speedster';
    const name = nameInput.value.trim() || 'Anon';
    socket.emit('joinGame', { carType, name });
  });

  // After server acknowledges joining, hide the menu and start sending inputs
  socket.on('joined', (data) => {
    // The server returns the car ID but we rely on socket id for identification
    menu.style.display = 'none';
    gameCanvas.style.display = 'block';
    hud.style.display = 'flex';
    // Start input transmission loop
    sendInputInterval = setInterval(() => {
      socket.emit('input', inputState);
    }, 1000 / 60);
  });

  // Receive state updates from server
  socket.on('state', (data) => {
    players = data.players;
    mySocketId = data.mySocketId;
    drawGame();
  });

  // Handle return to menu (win or crash)
  socket.on('returnToMenu', ({ winner, crashed }) => {
    // Show menu again and clear state
    clearInterval(sendInputInterval);
    sendInputInterval = null;
    menu.style.display = 'flex';
    gameCanvas.style.display = 'none';
    hud.style.display = 'none';
    players = [];
    inputState.cursor.x = 0;
    inputState.cursor.y = 0;
    upgradeContainer.classList.add('hidden');
    // Show message
    if (winner) {
      messageDiv.textContent = `${winner} completed 10 laps!`;
    } else if (crashed) {
      messageDiv.textContent = `You crashed!`;
    } else {
      messageDiv.textContent = '';
    }
    messageDiv.classList.remove('hidden');
    setTimeout(() => {
      messageDiv.classList.add('hidden');
    }, 3000);
  });

  // Mouse movement controls
  gameCanvas.addEventListener('mousemove', (e) => {
    // Calculate cursor delta from centre of the canvas
    const rect = gameCanvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    inputState.cursor.x = e.clientX - cx;
    inputState.cursor.y = e.clientY - cy;
  });

  // Upgrade button events
  upgradeContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const stat = e.target.dataset.stat;
      socket.emit('upgrade', { stat });
    }
  });

  // Drawing logic
  function drawGame() {
    const width = gameCanvas.width;
    const height = gameCanvas.height;
    ctx.clearRect(0, 0, width, height);
    // Determine scale so the outer square fits in 40% of the smaller dimension
    const scale = (Math.min(width, height) * 0.4) / (TRACK_HALF_OUTER * 2);
    const me = players.find((p) => p.socketId === mySocketId);
    const centerX = width / 2;
    const centerY = height / 2;
    // Draw track (square) relative to camera centred on player
    if (me) {
      // Outer square corners relative to player
      const cornersOuter = [
        { x: -TRACK_HALF_OUTER - me.x, y: -TRACK_HALF_OUTER - me.y },
        { x: TRACK_HALF_OUTER - me.x, y: -TRACK_HALF_OUTER - me.y },
        { x: TRACK_HALF_OUTER - me.x, y: TRACK_HALF_OUTER - me.y },
        { x: -TRACK_HALF_OUTER - me.x, y: TRACK_HALF_OUTER - me.y }
      ];
      const cornersInner = [
        { x: -TRACK_HALF_INNER - me.x, y: -TRACK_HALF_INNER - me.y },
        { x: TRACK_HALF_INNER - me.x, y: -TRACK_HALF_INNER - me.y },
        { x: TRACK_HALF_INNER - me.x, y: TRACK_HALF_INNER - me.y },
        { x: -TRACK_HALF_INNER - me.x, y: TRACK_HALF_INNER - me.y }
      ];
      ctx.strokeStyle = 'rgba(200,200,200,0.4)';
      ctx.lineWidth = 3;
      // Outer square
      ctx.beginPath();
      cornersOuter.forEach((c, i) => {
        const sx = centerX + c.x * scale;
        const sy = centerY - c.y * scale;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.stroke();
      // Inner square
      ctx.beginPath();
      cornersInner.forEach((c, i) => {
        const sx = centerX + c.x * scale;
        const sy = centerY - c.y * scale;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.stroke();
      // Start/finish line (right side of outer square)
      const startXWorld = TRACK_HALF_OUTER - me.x;
      ctx.beginPath();
      const sx1 = centerX + startXWorld * scale;
      const sy1 = centerY - (-20 - me.y) * scale;
      const sy2 = centerY - (20 - me.y) * scale;
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx1, sy2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    // Draw cars
    players.forEach((p) => {
      // Position relative to player
      const dx = p.x - (me ? me.x : 0);
      const dy = p.y - (me ? me.y : 0);
      const screenX = centerX + dx * scale;
      const screenY = centerY - dy * scale;
      // Draw shape with rotation
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(-p.angle);
      ctx.fillStyle = `rgb(${p.color.fill[0]},${p.color.fill[1]},${p.color.fill[2]})`;
      ctx.strokeStyle = `rgb(${p.color.stroke[0]},${p.color.stroke[1]},${p.color.stroke[2]})`;
      ctx.lineWidth = 3;
      if (p.shape === 'circle') {
        const r = 10 * scale;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else {
        const verts = [
          { x: 15 * scale, y: 0 },
          { x: -10 * scale, y: 8 * scale },
          { x: -10 * scale, y: -8 * scale }
        ];
        ctx.beginPath();
        verts.forEach((v, i) => {
          if (i === 0) ctx.moveTo(v.x, v.y);
          else ctx.lineTo(v.x, v.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      // Draw name below car (not rotated)
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(12, 14 * scale)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(p.name || '', screenX, screenY + 15 * scale);
    });
    // Update HUD
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
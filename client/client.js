(() => {
  const socket = io();
  let currentMap = null;

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

  function resizeCanvas() {
    gameCanvas.width = window.innerWidth;
    gameCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  joinButton.addEventListener('click', () => {
    const selected = document.querySelector('input[name="car"]:checked');
    const carType = selected ? selected.value : 'Speedster';
    const name = nameInput.value.trim() || 'Anon';
    socket.emit('joinGame', { carType, name });
  });

  socket.on('joined', (data) => {
    menu.style.display = 'none';
    gameCanvas.style.display = 'block';
    hud.style.display = 'flex';
    sendInputInterval = setInterval(() => {
      socket.emit('input', inputState);
    }, 1000 / 60);
  });

  socket.on('state', (data) => {
    players = data.players;
    mySocketId = data.mySocketId;
    currentMap = data.map || currentMap;
    drawGame();
  });

  socket.on('returnToMenu', ({ winner, crashed }) => {
    clearInterval(sendInputInterval);
    sendInputInterval = null;
    menu.style.display = 'flex';
    gameCanvas.style.display = 'none';
    hud.style.display = 'none';
    players = [];
    inputState.cursor.x = 0;
    inputState.cursor.y = 0;
    upgradeContainer.classList.add('hidden');
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

  gameCanvas.addEventListener('mousemove', (e) => {
    const rect = gameCanvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    inputState.cursor.x = e.clientX - cx;
    inputState.cursor.y = e.clientY - cy;
  });

  upgradeContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const stat = e.target.dataset.stat;
      socket.emit('upgrade', { stat });
    }
  });

  function drawGame() {
    const width = gameCanvas.width;
    const height = gameCanvas.height;
    ctx.clearRect(0, 0, width, height);
    const me = players.find((p) => p.socketId === mySocketId);
    const centerX = width / 2;
    const centerY = height / 2;
    let scale = 1;
    if (currentMap && Array.isArray(currentMap.shapes)) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      currentMap.shapes.forEach((shape) => {
        if (shape.type === 'circle' && typeof shape.radius === 'number') {
          const cx = (shape.center && typeof shape.center.x === 'number') ? shape.center.x : 0;
          const cy = (shape.center && typeof shape.center.y === 'number') ? shape.center.y : 0;
          minX = Math.min(minX, cx - shape.radius);
          maxX = Math.max(maxX, cx + shape.radius);
          minY = Math.min(minY, cy - shape.radius);
          maxY = Math.max(maxY, cy + shape.radius);
        } else if (Array.isArray(shape.vertices)) {
          shape.vertices.forEach((v) => {
            minX = Math.min(minX, v.x);
            maxX = Math.max(maxX, v.x);
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
          });
        }
      });
      const sizeX = maxX - minX;
      const sizeY = maxY - minY;
      const size = Math.max(sizeX, sizeY) || 1;
      scale = (Math.min(width, height) * 2.5) / size;
    }
    if (me && currentMap && Array.isArray(currentMap.shapes)) {
      for (const shape of currentMap.shapes) {
        const colors = (shape.borderColors && shape.borderColors.length > 0) ? shape.borderColors : (currentMap.borderColors || ['#ff0000', '#ffffff']);
        const bWidth = (shape.borderWidth !== undefined ? shape.borderWidth : (currentMap.borderWidth || 3)) * scale;
        ctx.lineWidth = bWidth;
        if (shape.type === 'polygon' && Array.isArray(shape.vertices)) {
          const verts = shape.vertices;
          for (let i = 0; i < verts.length; i++) {
            const a = verts[i];
            const b = verts[(i + 1) % verts.length];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const stripeWorld = 20;
            const numStripes = Math.max(1, Math.floor(length / stripeWorld));
            for (let j = 0; j < numStripes; j++) {
              const t1 = j / numStripes;
              const t2 = (j + 1) / numStripes;
              const sx1 = a.x + dx * t1 - me.x;
              const sy1 = a.y + dy * t1 - me.y;
              const sx2 = a.x + dx * t2 - me.x;
              const sy2 = a.y + dy * t2 - me.y;
              ctx.beginPath();
              ctx.strokeStyle = colors[(i + j) % colors.length];
              ctx.moveTo(centerX + sx1 * scale, centerY - sy1 * scale);
              ctx.lineTo(centerX + sx2 * scale, centerY - sy2 * scale);
              ctx.stroke();
            }
          }
        } else if (shape.type === 'circle' && typeof shape.radius === 'number') {
          const segments = 60;
          const cxWorld = (shape.center && typeof shape.center.x === 'number') ? shape.center.x : 0;
          const cyWorld = (shape.center && typeof shape.center.y === 'number') ? shape.center.y : 0;
          for (let i = 0; i < segments; i++) {
            const startAng = (i / segments) * 2 * Math.PI;
            const endAng = ((i + 1) / segments) * 2 * Math.PI;
            ctx.beginPath();
            ctx.strokeStyle = colors[i % colors.length];
            ctx.arc(
              centerX + (cxWorld - me.x) * scale,
              centerY - (cyWorld - me.y) * scale,
              shape.radius * scale,
              -endAng,
              -startAng,
              false
            );
            ctx.stroke();
          }
        } else if (shape.type === 'line' && Array.isArray(shape.vertices) && shape.vertices.length >= 2) {
          const a = shape.vertices[0];
          const b = shape.vertices[1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const stripeWorld = 20;
          const numStripes = Math.max(1, Math.floor(length / stripeWorld));
          for (let j = 0; j < numStripes; j++) {
            const t1 = j / numStripes;
            const t2 = (j + 1) / numStripes;
            const sx1 = a.x + dx * t1 - me.x;
            const sy1 = a.y + dy * t1 - me.y;
            const sx2 = a.x + dx * t2 - me.x;
            const sy2 = a.y + dy * t2 - me.y;
            ctx.beginPath();
            ctx.strokeStyle = colors[j % colors.length];
            ctx.moveTo(centerX + sx1 * scale, centerY - sy1 * scale);
            ctx.lineTo(centerX + sx2 * scale, centerY - sy2 * scale);
            ctx.stroke();
          }
        }
      }
      let maxX = -Infinity;
      currentMap.shapes.forEach((shape) => {
        if (shape.hollow) return;
        if (shape.type === 'circle' && typeof shape.radius === 'number') {
          const cx = (shape.center && typeof shape.center.x === 'number') ? shape.center.x : 0;
          maxX = Math.max(maxX, cx + shape.radius);
        } else if (Array.isArray(shape.vertices)) {
          shape.vertices.forEach((v) => { if (v.x > maxX) maxX = v.x; });
        }
      });
      if (isFinite(maxX)) {
        const sxWorld = maxX - me.x;
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        const syRange = 20;
        ctx.moveTo(centerX + sxWorld * scale, centerY - (-syRange - me.y) * scale);
        ctx.lineTo(centerX + sxWorld * scale, centerY - (syRange - me.y) * scale);
        ctx.stroke();
      }
    }
    players.forEach((p) => {
      const dx = p.x - (me ? me.x : 0);
      const dy = p.y - (me ? me.y : 0);
      const screenX = centerX + dx * scale;
      const screenY = centerY - dy * scale;
      if (p.vertices && p.vertices.length) {
        ctx.beginPath()
        p.vertices.forEach((v, i) => {
          const x = (p.x + v.x - me.x) * scale
          const y = (p.y + v.y - me.y) * scale
          if (i === 0) ctx.moveTo(centerX + x, centerY - y)
          else ctx.lineTo(centerX + x, centerY - y)
        })
        ctx.closePath()
        ctx.fillStyle = `rgb(${p.color.fill[0]},${p.color.fill[1]},${p.color.fill[2]})`
        ctx.fill()
      } else if (p.radius) {
        ctx.beginPath()
        ctx.arc(0, 0, p.radius * scale, 0, 2 * Math.PI)
        ctx.fill()
      }

      ctx.restore()

      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(12, 14 * scale)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(p.name || '', screenX, screenY + 15 * scale);
    });
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
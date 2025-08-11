(() => {
  const socket = io();
  let currentMap = null;

  const menu = document.getElementById('menu');
  const joinButton = document.getElementById('joinButton');
  const nameInput = document.getElementById('nameInput');
  const gameCanvas = document.getElementById('gameCanvas');
  const hud = document.getElementById('hud');
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
    // map
    if (me && currentMap && Array.isArray(currentMap.shapes)) {
      for (const shape of currentMap.shapes) {
        ctx.beginPath()

        const color = Array.isArray(shape.fillColor)
          ? `rgb(${shape.fillColor[0]}, ${shape.fillColor[1]}, ${shape.fillColor[2]})`
          : 'rgb(50, 50, 50)'
        ctx.fillStyle = color

        if (shape.type === 'polygon' && Array.isArray(shape.vertices)) {
          const verts = shape.vertices.map(v => ({
            x: centerX + (v.x - me.x) * scale,
            y: centerY - (v.y - me.y) * scale
          }))
          ctx.moveTo(verts[0].x, verts[0].y)
          for (let i = 1; i < verts.length; i++) {
            ctx.lineTo(verts[i].x, verts[i].y)
          }
          ctx.closePath()
          ctx.fill()

          if (Array.isArray(shape.borderColors) && shape.borderColors.length > 0) {
            const lineWidth = shape.borderWidth || 8
            const verts = shape.vertices.map(v => ({
              x: centerX + (v.x - me.x) * scale,
              y: centerY - (v.y - me.y) * scale
            }))

            const stripeLength = shape.stripeLength || shape.borderWidth * 1.8 || 25

            for (let i = 0; i < verts.length; i++) {
              const a = verts[i]
              const b = verts[(i + 1) % verts.length]

              const dx = b.x - a.x
              const dy = b.y - a.y
              const len = Math.hypot(dx, dy)
              const steps = Math.max(1, Math.floor(len / stripeLength))

              for (let s = 0; s < steps; s++) {
                const t0 = s / steps
                const t1 = (s + 1) / steps
                const x0 = a.x + dx * t0
                const y0 = a.y + dy * t0
                const x1 = a.x + dx * t1
                const y1 = a.y + dy * t1

                const perpX = -dy / len
                const perpY = dx / len
                const offsetX = (perpX * lineWidth) / 2
                const offsetY = (perpY * lineWidth) / 2

                ctx.beginPath()
                ctx.moveTo(x0 + offsetX, y0 + offsetY)
                ctx.lineTo(x1 + offsetX, y1 + offsetY)
                ctx.lineTo(x1 - offsetX, y1 - offsetY)
                ctx.lineTo(x0 - offsetX, y0 - offsetY)
                ctx.closePath()
                ctx.fillStyle = shape.borderColors[s % shape.borderColors.length]
                ctx.fill()
              }
            }


          }
        } else if (shape.type === 'circle' && typeof shape.radius === 'number') {
          const cx = (shape.center?.x ?? 0) - me.x
          const cy = (shape.center?.y ?? 0) - me.y
          ctx.arc(centerX + cx * scale, centerY - cy * scale, shape.radius * scale, 0, 2 * Math.PI)
          ctx.fill()

          if (Array.isArray(shape.borderColors) && shape.borderColors.length > 0) {
            const lineWidth = shape.borderWidth || 8
            const numSegments = 64
            const cx = centerX + ((shape.center?.x ?? 0) - me.x) * scale
            const cy = centerY - ((shape.center?.y ?? 0) - me.y) * scale
            const radius = shape.radius * scale

            const stripeLength = shape.stripeLength || 25

            for (let i = 0; i < verts.length; i++) {
              const a = verts[i]
              const b = verts[(i + 1) % verts.length]

              const dx = b.x - a.x
              const dy = b.y - a.y
              const len = Math.hypot(dx, dy)
              const steps = Math.max(1, Math.floor(len / stripeLength))

              for (let s = 0; s < steps; s++) {
                const t0 = Math.max(0, (s - 0.05) / steps)
                const t1 = (s + 1.05) / steps
                const x0 = a.x + dx * t0
                const y0 = a.y + dy * t0
                const x1 = a.x + dx * t1
                const y1 = a.y + dy * t1

                ctx.beginPath()
                ctx.moveTo(x0, y0)
                ctx.lineTo(x1, y1)
                ctx.strokeStyle = shape.borderColors[s % shape.borderColors.length]
                ctx.lineWidth = lineWidth
                ctx.stroke()
              }
            }

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

    // start/finish poly
    if (currentMap && currentMap.start && currentMap.start.vertices && me) {
      const screenVerts = currentMap.start.vertices.map(v => ({
        x: centerX + (v.x - me.x) * scale,
        y: centerY - (v.y - me.y) * scale
      }))
      drawCheckerboard(ctx, screenVerts, 20, { x: 0, y: 0 }, scale, me, centerX, centerY)
    }

    // checkpoints
    if (currentMap.checkpoints) {
      for (const cp of currentMap.checkpoints) {
        if (cp.type === 'line' && cp.vertices.length >= 2) {
          const a = cp.vertices[0];
          const b = cp.vertices[1];
          ctx.beginPath();
          ctx.moveTo(centerX + (a.x - me.x) * scale, centerY - (a.y - me.y) * scale);
          ctx.lineTo(centerX + (b.x - me.x) * scale, centerY - (b.y - me.y) * scale);
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // players
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

      ctx.strokeStyle = `rgb(${p.color.stroke[0]}, ${p.color.stroke[1]}, ${p.color.stroke[2]})`
      ctx.lineWidth = p.color.strokeWidth * scale
      ctx.lineJoin = 'round'
      ctx.stroke()

      ctx.restore()

      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(12, 14 * scale)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(p.name || '', screenX, screenY + 15 * scale);

      if (p.health < p.maxHealth) {
        const barWidth = 20 * scale;
        const barHeight = 3 * scale;
        const barX = screenX - barWidth / 2;
        const barY = screenY + 30 * scale;

        const healthRatio = p.health / p.maxHealth;
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        ctx.fillStyle = healthRatio > 0.5 ? '#0f0' : '#f00';
        ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
      }
    });
    if (me) {
      lapsSpan.textContent = `Laps: ${me.laps}`;
      upgradePointsSpan.textContent = me.upgradePoints;
      if (me.upgradePoints > 0) {
        upgradeContainer.classList.remove('hidden');
      } else {
        upgradeContainer.classList.add('hidden');
      }
    }
  }

  // HELPERS

  function drawCheckerboard(ctx, screenVerts, cellSize = 10, originWorld = { x: 0, y: 0 }, scale = 1, me = null, centerX = 0, centerY = 0) {
    ctx.save()
    ctx.beginPath()
    screenVerts.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y)
      else ctx.lineTo(v.x, v.y)
    })
    ctx.closePath()
    ctx.clip()

    const xs = screenVerts.map(v => v.x)
    const ys = screenVerts.map(v => v.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    for (let y = minY; y < maxY; y += cellSize) {
      for (let x = minX; x < maxX; x += cellSize) {
        // Convert screen coords back to world coords to get stable checker alignment
        const worldX = (x - centerX) / scale + me.x
        const worldY = -(y - centerY) / scale + me.y

        const col = Math.floor((worldX - originWorld.x) / (cellSize / scale))
        const row = Math.floor((worldY - originWorld.y) / (cellSize / scale))

        const isBlack = (row + col) % 2 === 0
        ctx.fillStyle = isBlack ? '#333333' : '#ffffff'
        ctx.fillRect(x, y, cellSize, cellSize)
      }
    }

    ctx.restore()
  }


})();
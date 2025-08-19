let editorCanvas, editorCtx;
let editorMap = null;

function initMapEditor() {
  editorCanvas = document.getElementById('mapEditorCanvas');
  editorCtx = editorCanvas.getContext('2d');
  resizeEditorCanvas();

  // load maps list
  fetch('/api/maps')
    .then(res => res.json())
    .then(maps => {
      const select = document.getElementById('mapSelect');
      select.innerHTML = maps.map(m => `<option value="${m.key}">${m.name}</option>`).join('');
      if (maps.length) {
        loadMap(maps[0].key);
      }
    });

  document.getElementById('mapSelect').addEventListener('change', e => {
    loadMap(e.target.value);
  });

  document.getElementById('applyMapData').addEventListener('click', () => {
    try {
      const data = JSON.parse(document.getElementById('mapDataInput').value);
      editorMap = data;
      renderEditor();
    } catch (err) {
      alert('Invalid JSON');
    }
  });

  document.getElementById('downloadMapData').addEventListener('click', () => {
    if (!editorMap) return;
    const blob = new Blob([JSON.stringify(editorMap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'map.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  window.addEventListener('resize', resizeEditorCanvas);
}

function resizeEditorCanvas() {
  if (!editorCanvas) return;
  editorCanvas.width = window.innerWidth;
  editorCanvas.height = window.innerHeight;
  renderEditor();
}

function loadMap(key) {
  fetch(`/api/maps/${key}`)
    .then(res => res.json())
    .then(data => {
      editorMap = data;
      document.getElementById('mapDataInput').value = JSON.stringify(data, null, 2);
      renderEditor();
    });
}

function renderEditor() {
  if (!editorCanvas || !editorCtx) return;
  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  if (!editorMap) return;

  editorCtx.save();
  editorCtx.translate(editorCanvas.width / 2, editorCanvas.height / 2);

  // draw shapes
  if (Array.isArray(editorMap.shapes)) {
    editorMap.shapes.forEach(shape => {
      if (!Array.isArray(shape.vertices)) return;
      editorCtx.beginPath();
      editorCtx.moveTo(shape.vertices[0].x, -shape.vertices[0].y);
      for (let i = 1; i < shape.vertices.length; i++) {
        editorCtx.lineTo(shape.vertices[i].x, -shape.vertices[i].y);
      }
      editorCtx.closePath();
      if (Array.isArray(shape.fillColor)) {
        editorCtx.fillStyle = `rgb(${shape.fillColor[0]},${shape.fillColor[1]},${shape.fillColor[2]})`;
      } else {
        editorCtx.fillStyle = '#555';
      }
      editorCtx.fill();
    });
  }

  // start area
  if (editorMap.start && Array.isArray(editorMap.start.vertices)) {
    editorCtx.strokeStyle = '#0f0';
    editorCtx.beginPath();
    const verts = editorMap.start.vertices;
    editorCtx.moveTo(verts[0].x, -verts[0].y);
    for (let i = 1; i < verts.length; i++) editorCtx.lineTo(verts[i].x, -verts[i].y);
    editorCtx.closePath();
    editorCtx.stroke();
  }

  // checkpoints
  if (Array.isArray(editorMap.checkpoints)) {
    editorCtx.strokeStyle = '#ff0';
    editorMap.checkpoints.forEach(cp => {
      if (Array.isArray(cp.vertices) && cp.vertices.length >= 2) {
        editorCtx.beginPath();
        editorCtx.moveTo(cp.vertices[0].x, -cp.vertices[0].y);
        editorCtx.lineTo(cp.vertices[1].x, -cp.vertices[1].y);
        editorCtx.stroke();
      }
    });
  }

  // dynamic objects
  if (Array.isArray(editorMap.dynamicObjects)) {
    editorCtx.fillStyle = '#f0f';
    editorMap.dynamicObjects.forEach(obj => {
      if (obj.type === 'circle') {
        editorCtx.beginPath();
        editorCtx.arc(obj.x || 0, -(obj.y || 0), obj.radius || 10, 0, Math.PI * 2);
        editorCtx.fill();
      } else if (Array.isArray(obj.vertices)) {
        editorCtx.beginPath();
        editorCtx.moveTo(obj.vertices[0].x, -obj.vertices[0].y);
        for (let i = 1; i < obj.vertices.length; i++) {
          editorCtx.lineTo(obj.vertices[i].x, -obj.vertices[i].y);
        }
        editorCtx.closePath();
        editorCtx.fill();
      }
    });
  }

  editorCtx.restore();
}

window.initMapEditor = initMapEditor;

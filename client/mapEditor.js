let editorCanvas, editorCtx;
let editorMap = null;
let creatingShape = false;
let newShapeVertices = [];
let panX = 0;
let panY = 0;
let zoom = 1;
let isPannable = false;
let lastX = 0;
let lastY = 0;

function initMapEditor() {
  editorCanvas = document.getElementById('mapEditorCanvas');
  editorCtx = editorCanvas.getContext('2d');
  resizeEditorCanvas();

  // load maps list
  loadMapsList();
  // Load first map if available
  setTimeout(() => {
    const select = document.getElementById('mapSelect');
    if (select.options.length > 0) {
      loadMap('square');
    }
  }, 100);

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

  document.getElementById('createShapeButton').addEventListener('click', () => {
    creatingShape = !creatingShape;
    if (creatingShape) {
      newShapeVertices = [];
      editorCanvas.addEventListener('click', handleCanvasClick);
      window.addEventListener('keydown', handleKeyDown);
    } else {
      editorCanvas.removeEventListener('click', handleCanvasClick);
      window.removeEventListener('keydown', handleKeyDown);
    }
  });

  // Add save to server functionality
  document.getElementById('saveMapButton')?.addEventListener('click', saveMapToServer);
  document.getElementById('uploadMapButton')?.addEventListener('click', uploadNewMap);

  window.addEventListener('resize', resizeEditorCanvas);

  // Pan and zoom event listeners
  editorCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle mouse button
      isPannable = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  editorCanvas.addEventListener('mousemove', (e) => {
    if (isPannable) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      panX += dx;
      panY += dy;
      lastX = e.clientX;
      lastY = e.clientY;
      renderEditor();
    }
  });

  editorCanvas.addEventListener('mouseup', (e) => {
    if (e.button === 1) {
      isPannable = false;
    }
  });

  editorCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      zoom *= zoomFactor;
    } else {
      zoom /= zoomFactor;
    }
    renderEditor();
  });
}

function handleCanvasClick(event) {
  if (!creatingShape) return;
  const rect = editorCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left - editorCanvas.width / 2 - panX) / zoom;
  const y = -(event.clientY - rect.top - editorCanvas.height / 2 - panY) / zoom;
  newShapeVertices.push({ x, y });
  renderEditor();
}

function handleKeyDown(event) {
  if (!creatingShape) return;
  if (event.key === 'Enter') {
    if (newShapeVertices.length > 2) {
      if (!editorMap.shapes) {
        editorMap.shapes = [];
      }
      editorMap.shapes.push({
        vertices: newShapeVertices,
        fillColor: [128, 128, 128]
      });
      document.getElementById('mapDataInput').value = JSON.stringify(editorMap, null, 2);
    }
    creatingShape = false;
    newShapeVertices = [];
    editorCanvas.removeEventListener('click', handleCanvasClick);
    window.removeEventListener('keydown', handleKeyDown);
    renderEditor();
  } else if (event.key === 'Escape') {
    creatingShape = false;
    newShapeVertices = [];
    editorCanvas.removeEventListener('click', handleCanvasClick);
    window.removeEventListener('keydown', handleKeyDown);
    renderEditor();
  }
}

async function saveMapToServer() {
  if (!editorMap) {
    alert('No map data to save');
    return;
  }

  const mapName = prompt('Enter map name:');
  if (!mapName) return;

  try {
    const response = await fetch('/api/maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: mapName, 
        mapData: editorMap 
      })
    });

    const result = await response.json();
    
    if (result.success) {
      alert('Map saved successfully!');
      // Refresh maps list
      loadMapsList();
    } else {
      alert('Failed to save map: ' + result.error);
    }
  } catch (error) {
    console.error('Save map error:', error);
    alert('Failed to save map');
  }
}

async function uploadNewMap() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  
  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const mapData = JSON.parse(text);
      
      const mapName = prompt('Enter map name:', file.name.replace('.json', ''));
      if (!mapName) return;

      const response = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: mapName, 
          mapData: mapData 
        })
      });

      const result = await response.json();
      
      if (result.success) {
        alert('Map uploaded successfully!');
        // Load the uploaded map
        editorMap = mapData;
        renderEditor();
        // Refresh maps list
        loadMapsList();
      } else {
        alert('Failed to upload map: ' + result.error);
      }
    } catch (error) {
      console.error('Upload map error:', error);
      alert('Failed to upload map: Invalid JSON file');
    }
  };
  
  fileInput.click();
}

function loadMapsList() {
  fetch('/api/maps')
    .then(res => res.json())
    .then(maps => {
      const select = document.getElementById('mapSelect');
      select.innerHTML = maps.map(m => 
        `<option value="${m.key}">${m.name} (${m.category})</option>`
      ).join('');
    })
    .catch(error => {
      console.error('Error loading maps:', error);
    });
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
  editorCtx.translate(editorCanvas.width / 2 + panX, editorCanvas.height / 2 + panY);
  editorCtx.scale(zoom, zoom);

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

  // draw new shape
  if (creatingShape && newShapeVertices.length > 0) {
    editorCtx.strokeStyle = '#0f0';
    editorCtx.beginPath();
    editorCtx.moveTo(newShapeVertices[0].x, -newShapeVertices[0].y);
    for (let i = 1; i < newShapeVertices.length; i++) {
      editorCtx.lineTo(newShapeVertices[i].x, -newShapeVertices[i].y);
    }
    editorCtx.stroke();
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
      if (Array.isArray(obj.vertices)) {
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

  // area effects
  if (Array.isArray(editorMap.areaEffects)) {
    editorCtx.fillStyle = 'rgba(0, 0, 255, 0.5)';
    editorMap.areaEffects.forEach(area => {
      if (Array.isArray(area.vertices)) {
        editorCtx.beginPath();
        editorCtx.moveTo(area.vertices[0].x, -area.vertices[0].y);
        for (let i = 1; i < area.vertices.length; i++) {
          editorCtx.lineTo(area.vertices[i].x, -area.vertices[i].y);
        }
        editorCtx.closePath();
        editorCtx.fill();
      }
    });
  }

  editorCtx.restore();
}

window.initMapEditor = initMapEditor;

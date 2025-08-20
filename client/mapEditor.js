// Advanced Map Editor
let editorCanvas, editorCtx;
let editorMap = null;

// State management
let currentTool = 'select';
let selectedObject = null;
let selectedVertex = null;
let isDragging = false;
let dragStartPos = null;

// Grid settings
let showGrid = true;
let snapToGrid = true;
let gridSize = 25;

// View settings
let panX = 0;
let panY = 0;
let zoom = 1;
let isPanning = false;
let lastMousePos = { x: 0, y: 0 };

// Object creation state
let creatingShape = false;
let newShapeVertices = [];

function initMapEditor() {
  editorCanvas = document.getElementById('mapEditorCanvas');
  editorCtx = editorCanvas.getContext('2d');
  resizeEditorCanvas();

  // Load maps list
  loadMapsList();
  setTimeout(() => {
    const select = document.getElementById('mapSelect');
    if (select.options.length > 0) {
      loadMap('square');
    }
  }, 100);

  initEventListeners();
  updateUI();
}

function initEventListeners() {
  // Map selection
  document.getElementById('mapSelect').addEventListener('change', e => {
    loadMap(e.target.value);
  });

  // Tool selection
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectTool(btn.dataset.tool);
    });
  });

  // Grid settings
  document.getElementById('showGrid').addEventListener('change', (e) => {
    showGrid = e.target.checked;
    renderEditor();
  });

  document.getElementById('snapToGrid').addEventListener('change', (e) => {
    snapToGrid = e.target.checked;
  });

  document.getElementById('gridSize').addEventListener('change', (e) => {
    gridSize = parseInt(e.target.value);
    renderEditor();
  });

  // File operations
  document.getElementById('applyMapData').addEventListener('click', applyMapData);
  document.getElementById('downloadMapData').addEventListener('click', downloadMapData);
  document.getElementById('saveMapButton')?.addEventListener('click', saveMapToServer);
  document.getElementById('uploadMapButton')?.addEventListener('click', uploadNewMap);

  // Canvas events
  editorCanvas.addEventListener('mousedown', handleMouseDown);
  editorCanvas.addEventListener('mousemove', handleMouseMove);
  editorCanvas.addEventListener('mouseup', handleMouseUp);
  editorCanvas.addEventListener('wheel', handleWheel);
  editorCanvas.addEventListener('contextmenu', handleRightClick);

  // Keyboard events
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', resizeEditorCanvas);
}

function selectTool(tool) {
  // Clean up previous tool
  if (creatingShape) {
    creatingShape = false;
    newShapeVertices = [];
  }

  currentTool = tool;
  selectedObject = null;
  selectedVertex = null;

  // Update UI
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });

  updatePropertiesPanel();
  renderEditor();
}

function getMousePos(e) {
  const rect = editorCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - editorCanvas.width / 2 - panX) / zoom;
  const y = -(e.clientY - rect.top - editorCanvas.height / 2 - panY) / zoom;
  return { x, y };
}

function snapToGridPos(pos) {
  if (!snapToGrid) return pos;
  return {
    x: Math.round(pos.x / gridSize) * gridSize,
    y: Math.round(pos.y / gridSize) * gridSize
  };
}

function handleMouseDown(e) {
  const mousePos = getMousePos(e);
  
  if (e.button === 1) { // Middle mouse button - pan
    isPanning = true;
    lastMousePos = { x: e.clientX, y: e.clientY };
    return;
  }

  if (e.button === 0) { // Left mouse button
    switch (currentTool) {
      case 'select':
        handleSelectMouseDown(mousePos);
        break;
      case 'createShape':
        handleCreateShapeMouseDown(mousePos);
        break;
      case 'checkpoint':
        handleCreateCheckpointMouseDown(mousePos);
        break;
      case 'dynamic':
        handleCreateDynamicMouseDown(mousePos);
        break;
      case 'areaEffect':
        handleCreateAreaEffectMouseDown(mousePos);
        break;
    }
  }
}

function handleMouseMove(e) {
  const mousePos = getMousePos(e);

  if (isPanning) {
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    panX += dx;
    panY += dy;
    lastMousePos = { x: e.clientX, y: e.clientY };
    renderEditor();
    return;
  }

  if (isDragging && selectedVertex) {
    const snappedPos = snapToGridPos(mousePos);
    selectedVertex.x = snappedPos.x;
    selectedVertex.y = snappedPos.y;
    updateMapDataInput();
    renderEditor();
  }
}

function handleMouseUp(e) {
  if (e.button === 1) {
    isPanning = false;
    return;
  }

  isDragging = false;
  dragStartPos = null;
}

function handleWheel(e) {
  e.preventDefault();
  const zoomFactor = 1.1;
  const mousePos = getMousePos(e);
  
  if (e.deltaY < 0) {
    zoom *= zoomFactor;
  } else {
    zoom /= zoomFactor;
  }
  
  zoom = Math.max(0.1, Math.min(5, zoom));
  renderEditor();
}

function handleRightClick(e) {
  e.preventDefault();
  // TODO: Context menu for adding/removing vertices
}

function handleKeyDown(e) {
  switch (e.key) {
    case 'Delete':
      deleteSelectedObject();
      break;
    case 'Escape':
      if (creatingShape) {
        creatingShape = false;
        newShapeVertices = [];
        renderEditor();
      }
      break;
    case 'Enter':
      if (creatingShape && newShapeVertices.length > 2) {
        finishCreatingShape();
      }
      break;
    case 'g':
    case 'G':
      document.getElementById('showGrid').checked = !showGrid;
      showGrid = !showGrid;
      renderEditor();
      break;
    case 's':
    case 'S':
      if (e.ctrlKey) {
        e.preventDefault();
        saveMapToServer();
      } else {
        document.getElementById('snapToGrid').checked = !snapToGrid;
        snapToGrid = !snapToGrid;
      }
      break;
  }
}

function handleSelectMouseDown(mousePos) {
  const clickedVertex = findVertexAtPosition(mousePos);
  const clickedObject = findObjectAtPosition(mousePos);

  if (clickedVertex) {
    selectedVertex = clickedVertex.vertex;
    selectedObject = clickedVertex.object;
    isDragging = true;
    dragStartPos = mousePos;
  } else if (clickedObject) {
    selectedObject = clickedObject;
    selectedVertex = null;
  } else {
    selectedObject = null;
    selectedVertex = null;
  }

  updatePropertiesPanel();
  updateLayersPanel();
  renderEditor();
}

function handleCreateShapeMouseDown(mousePos) {
  const snappedPos = snapToGridPos(mousePos);
  
  if (!creatingShape) {
    creatingShape = true;
    newShapeVertices = [];
  }
  
  newShapeVertices.push({ x: snappedPos.x, y: snappedPos.y });
  renderEditor();
}

function handleCreateCheckpointMouseDown(mousePos) {
  // TODO: Implement checkpoint creation
}

function handleCreateDynamicMouseDown(mousePos) {
  // TODO: Implement dynamic object creation
}

function handleCreateAreaEffectMouseDown(mousePos) {
  // TODO: Implement area effect creation
}

function findVertexAtPosition(pos, tolerance = 10) {
  const scaledTolerance = tolerance / zoom;

  // Check shapes
  if (editorMap.shapes) {
    for (let i = 0; i < editorMap.shapes.length; i++) {
      const shape = editorMap.shapes[i];
      for (let j = 0; j < shape.vertices.length; j++) {
        const vertex = shape.vertices[j];
        const distance = Math.sqrt(
          Math.pow(pos.x - vertex.x, 2) + Math.pow(pos.y - vertex.y, 2)
        );
        if (distance <= scaledTolerance) {
          return {
            object: { type: 'shape', index: i, data: shape },
            vertex: vertex,
            vertexIndex: j
          };
        }
      }
    }
  }

  // Check checkpoints
  if (editorMap.checkpoints) {
    for (let i = 0; i < editorMap.checkpoints.length; i++) {
      const checkpoint = editorMap.checkpoints[i];
      for (let j = 0; j < checkpoint.vertices.length; j++) {
        const vertex = checkpoint.vertices[j];
        const distance = Math.sqrt(
          Math.pow(pos.x - vertex.x, 2) + Math.pow(pos.y - vertex.y, 2)
        );
        if (distance <= scaledTolerance) {
          return {
            object: { type: 'checkpoint', index: i, data: checkpoint },
            vertex: vertex,
            vertexIndex: j
          };
        }
      }
    }
  }

  // Check area effects
  if (editorMap.areaEffects) {
    for (let i = 0; i < editorMap.areaEffects.length; i++) {
      const area = editorMap.areaEffects[i];
      for (let j = 0; j < area.vertices.length; j++) {
        const vertex = area.vertices[j];
        const distance = Math.sqrt(
          Math.pow(pos.x - vertex.x, 2) + Math.pow(pos.y - vertex.y, 2)
        );
        if (distance <= scaledTolerance) {
          return {
            object: { type: 'areaEffect', index: i, data: area },
            vertex: vertex,
            vertexIndex: j
          };
        }
      }
    }
  }

  return null;
}

function findObjectAtPosition(pos) {
  // TODO: Implement object selection logic
  return null;
}

function finishCreatingShape() {
  if (newShapeVertices.length > 2) {
    if (!editorMap.shapes) {
      editorMap.shapes = [];
    }
    editorMap.shapes.push({
      vertices: newShapeVertices,
      fillColor: [128, 128, 128],
      borderColors: ['#ff4d4d', '#ffffff'],
      borderWidth: 20
    });
    updateMapDataInput();
  }
  
  creatingShape = false;
  newShapeVertices = [];
  selectTool('select');
  renderEditor();
}

function deleteSelectedObject() {
  if (!selectedObject) return;

  switch (selectedObject.type) {
    case 'shape':
      editorMap.shapes.splice(selectedObject.index, 1);
      break;
    case 'checkpoint':
      editorMap.checkpoints.splice(selectedObject.index, 1);
      break;
    case 'areaEffect':
      editorMap.areaEffects.splice(selectedObject.index, 1);
      break;
    case 'dynamicObject':
      editorMap.dynamicObjects.splice(selectedObject.index, 1);
      break;
  }

  selectedObject = null;
  selectedVertex = null;
  updateMapDataInput();
  updatePropertiesPanel();
  updateLayersPanel();
  renderEditor();
}

function renderEditor() {
  if (!editorCanvas || !editorCtx) return;
  
  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  
  editorCtx.save();
  editorCtx.translate(editorCanvas.width / 2 + panX, editorCanvas.height / 2 + panY);
  editorCtx.scale(zoom, zoom);

  // Draw grid
  if (showGrid) {
    drawGrid();
  }

  if (!editorMap) {
    editorCtx.restore();
    return;
  }

  // Draw shapes
  if (Array.isArray(editorMap.shapes)) {
    editorMap.shapes.forEach((shape, index) => {
      drawShape(shape, selectedObject?.type === 'shape' && selectedObject?.index === index);
    });
  }

  // Draw checkpoints
  if (Array.isArray(editorMap.checkpoints)) {
    editorMap.checkpoints.forEach((checkpoint, index) => {
      drawCheckpoint(checkpoint, selectedObject?.type === 'checkpoint' && selectedObject?.index === index);
    });
  }

  // Draw area effects
  if (Array.isArray(editorMap.areaEffects)) {
    editorMap.areaEffects.forEach((area, index) => {
      drawAreaEffect(area, selectedObject?.type === 'areaEffect' && selectedObject?.index === index);
    });
  }

  // Draw dynamic objects
  if (Array.isArray(editorMap.dynamicObjects)) {
    editorMap.dynamicObjects.forEach((obj, index) => {
      drawDynamicObject(obj, selectedObject?.type === 'dynamicObject' && selectedObject?.index === index);
    });
  }

  // Draw start area
  if (editorMap.start && Array.isArray(editorMap.start.vertices)) {
    drawStartArea(editorMap.start);
  }

  // Draw new shape being created
  if (creatingShape && newShapeVertices.length > 0) {
    drawNewShape();
  }

  editorCtx.restore();
}

function drawGrid() {
  const canvasWidth = editorCanvas.width / zoom;
  const canvasHeight = editorCanvas.height / zoom;
  const startX = Math.floor((-canvasWidth / 2 - panX / zoom) / gridSize) * gridSize;
  const endX = Math.ceil((canvasWidth / 2 - panX / zoom) / gridSize) * gridSize;
  const startY = Math.floor((-canvasHeight / 2 + panY / zoom) / gridSize) * gridSize;
  const endY = Math.ceil((canvasHeight / 2 + panY / zoom) / gridSize) * gridSize;

  editorCtx.strokeStyle = '#444';
  editorCtx.lineWidth = 1 / zoom;
  editorCtx.setLineDash([2 / zoom, 2 / zoom]);

  // Vertical lines
  for (let x = startX; x <= endX; x += gridSize) {
    editorCtx.beginPath();
    editorCtx.moveTo(x, startY);
    editorCtx.lineTo(x, endY);
    editorCtx.stroke();
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y += gridSize) {
    editorCtx.beginPath();
    editorCtx.moveTo(startX, y);
    editorCtx.lineTo(endX, y);
    editorCtx.stroke();
  }

  editorCtx.setLineDash([]);
}

function drawShape(shape, isSelected) {
  if (!Array.isArray(shape.vertices) || shape.vertices.length === 0) return;

  // Draw filled shape
  editorCtx.beginPath();
  editorCtx.moveTo(shape.vertices[0].x, -shape.vertices[0].y);
  for (let i = 1; i < shape.vertices.length; i++) {
    editorCtx.lineTo(shape.vertices[i].x, -shape.vertices[i].y);
  }
  editorCtx.closePath();

  if (shape.fillColor) {
    editorCtx.fillStyle = `rgb(${shape.fillColor[0]},${shape.fillColor[1]},${shape.fillColor[2]})`;
  } else {
    editorCtx.fillStyle = '#555';
  }
  editorCtx.fill();

  // Draw border if selected
  if (isSelected) {
    editorCtx.strokeStyle = '#ffff00';
    editorCtx.lineWidth = 2 / zoom;
    editorCtx.stroke();
  }

  // Draw vertices
  if (isSelected) {
    drawVertices(shape.vertices);
  }
}

function drawCheckpoint(checkpoint, isSelected) {
  if (!Array.isArray(checkpoint.vertices)) return;

  editorCtx.strokeStyle = isSelected ? '#ffff00' : '#00ff00';
  editorCtx.lineWidth = 3 / zoom;
  editorCtx.beginPath();
  
  if (checkpoint.vertices.length === 2) {
    // Line checkpoint
    editorCtx.moveTo(checkpoint.vertices[0].x, -checkpoint.vertices[0].y);
    editorCtx.lineTo(checkpoint.vertices[1].x, -checkpoint.vertices[1].y);
  }
  editorCtx.stroke();

  if (isSelected) {
    drawVertices(checkpoint.vertices);
  }
}

function drawAreaEffect(area, isSelected) {
  if (!Array.isArray(area.vertices)) return;

  editorCtx.beginPath();
  editorCtx.moveTo(area.vertices[0].x, -area.vertices[0].y);
  for (let i = 1; i < area.vertices.length; i++) {
    editorCtx.lineTo(area.vertices[i].x, -area.vertices[i].y);
  }
  editorCtx.closePath();

  if (area.fillColor) {
    editorCtx.fillStyle = `rgb(${area.fillColor[0]},${area.fillColor[1]},${area.fillColor[2]})`;
  } else {
    editorCtx.fillStyle = 'rgba(0, 0, 255, 0.5)';
  }
  editorCtx.fill();

  if (isSelected) {
    editorCtx.strokeStyle = '#ffff00';
    editorCtx.lineWidth = 2 / zoom;
    editorCtx.stroke();
    drawVertices(area.vertices);
  }
}

function drawDynamicObject(obj, isSelected) {
  // Simple rectangle for now
  const x = obj.position.x - obj.size.width / 2;
  const y = -obj.position.y - obj.size.height / 2;
  
  editorCtx.fillStyle = obj.fillColor ? 
    `rgb(${obj.fillColor[0]},${obj.fillColor[1]},${obj.fillColor[2]})` : '#ff00ff';
  editorCtx.fillRect(x, y, obj.size.width, obj.size.height);

  if (isSelected) {
    editorCtx.strokeStyle = '#ffff00';
    editorCtx.lineWidth = 2 / zoom;
    editorCtx.strokeRect(x, y, obj.size.width, obj.size.height);
  }
}

function drawStartArea(start) {
  if (!Array.isArray(start.vertices)) return;

  editorCtx.strokeStyle = '#00ff00';
  editorCtx.lineWidth = 2 / zoom;
  editorCtx.beginPath();
  editorCtx.moveTo(start.vertices[0].x, -start.vertices[0].y);
  for (let i = 1; i < start.vertices.length; i++) {
    editorCtx.lineTo(start.vertices[i].x, -start.vertices[i].y);
  }
  editorCtx.closePath();
  editorCtx.stroke();
}

function drawNewShape() {
  editorCtx.strokeStyle = '#00ff00';
  editorCtx.lineWidth = 2 / zoom;
  editorCtx.beginPath();
  editorCtx.moveTo(newShapeVertices[0].x, -newShapeVertices[0].y);
  for (let i = 1; i < newShapeVertices.length; i++) {
    editorCtx.lineTo(newShapeVertices[i].x, -newShapeVertices[i].y);
  }
  editorCtx.stroke();

  // Draw vertices being created
  drawVertices(newShapeVertices, '#00ff00');
}

function drawVertices(vertices, color = '#ffff00') {
  const radius = 4 / zoom;
  editorCtx.fillStyle = color;
  
  vertices.forEach(vertex => {
    editorCtx.beginPath();
    editorCtx.arc(vertex.x, -vertex.y, radius, 0, 2 * Math.PI);
    editorCtx.fill();
  });
}

// Properties panel management
function updatePropertiesPanel() {
  const panel = document.getElementById('propertiesPanel');
  
  if (!selectedObject) {
    panel.innerHTML = '<p>Select an object to edit properties</p>';
    return;
  }

  // TODO: Generate property editor based on selected object type
  panel.innerHTML = `<p>Selected: ${selectedObject.type} ${selectedObject.index}</p>`;
}

// Layers panel management
function updateLayersPanel() {
  const panel = document.getElementById('layersPanel');
  let html = '';

  if (editorMap) {
    if (editorMap.shapes) {
      editorMap.shapes.forEach((shape, i) => {
        const isSelected = selectedObject?.type === 'shape' && selectedObject?.index === i;
        html += `<div class="layer-item ${isSelected ? 'selected' : ''}" onclick="selectObject('shape', ${i})">
          Shape ${i + 1}
        </div>`;
      });
    }

    if (editorMap.checkpoints) {
      editorMap.checkpoints.forEach((checkpoint, i) => {
        const isSelected = selectedObject?.type === 'checkpoint' && selectedObject?.index === i;
        html += `<div class="layer-item ${isSelected ? 'selected' : ''}" onclick="selectObject('checkpoint', ${i})">
          ${checkpoint.id || `Checkpoint ${i + 1}`}
        </div>`;
      });
    }

    if (editorMap.areaEffects) {
      editorMap.areaEffects.forEach((area, i) => {
        const isSelected = selectedObject?.type === 'areaEffect' && selectedObject?.index === i;
        html += `<div class="layer-item ${isSelected ? 'selected' : ''}" onclick="selectObject('areaEffect', ${i})">
          Area Effect ${i + 1}
        </div>`;
      });
    }

    if (editorMap.dynamicObjects) {
      editorMap.dynamicObjects.forEach((obj, i) => {
        const isSelected = selectedObject?.type === 'dynamicObject' && selectedObject?.index === i;
        html += `<div class="layer-item ${isSelected ? 'selected' : ''}" onclick="selectObject('dynamicObject', ${i})">
          ${obj.id || `Dynamic ${i + 1}`}
        </div>`;
      });
    }
  }

  panel.innerHTML = html || '<p>No objects in map</p>';
}

function selectObject(type, index) {
  selectedObject = { type, index };
  selectedVertex = null;
  updatePropertiesPanel();
  updateLayersPanel();
  renderEditor();
}

function updateUI() {
  updatePropertiesPanel();
  updateLayersPanel();
}

function updateMapDataInput() {
  if (editorMap) {
    document.getElementById('mapDataInput').value = JSON.stringify(editorMap, null, 2);
  }
}

// File operations (keep existing functions)
function loadMap(key) {
  fetch(`/api/maps/${key}`)
    .then(res => res.json())
    .then(map => {
      editorMap = map;
      updateMapDataInput();
      updateUI();
      renderEditor();
    })
    .catch(error => {
      console.error('Error loading map:', error);
    });
}

function applyMapData() {
  try {
    const data = JSON.parse(document.getElementById('mapDataInput').value);
    editorMap = data;
    selectedObject = null;
    selectedVertex = null;
    updateUI();
    renderEditor();
  } catch (err) {
    alert('Invalid JSON');
  }
}

function downloadMapData() {
  if (!editorMap) return;
  const blob = new Blob([JSON.stringify(editorMap, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'map.json';
  a.click();
  URL.revokeObjectURL(url);
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
        editorMap = mapData;
        updateMapDataInput();
        updateUI();
        renderEditor();
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
  editorCanvas.width = window.innerWidth - 300; // Account for sidebar
  editorCanvas.height = window.innerHeight;
  renderEditor();
}

// Expose global functions
window.initMapEditor = initMapEditor;
window.selectObject = selectObject;
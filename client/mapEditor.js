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
  const tolerance = 10 / zoom; // Adjust tolerance based on zoom level

  // Check dynamic objects first (they're on top)
  if (editorMap.dynamicObjects) {
    for (let i = editorMap.dynamicObjects.length - 1; i >= 0; i--) {
      const obj = editorMap.dynamicObjects[i];
      if (isPointInDynamicObject(pos, obj, tolerance)) {
        return { type: 'dynamicObject', index: i, data: obj };
      }
    }
  }

  // Check area effects
  if (editorMap.areaEffects) {
    for (let i = editorMap.areaEffects.length - 1; i >= 0; i--) {
      const area = editorMap.areaEffects[i];
      if (isPointInPolygon(pos, area.vertices)) {
        return { type: 'areaEffect', index: i, data: area };
      }
    }
  }

  // Check checkpoints
  if (editorMap.checkpoints) {
    for (let i = editorMap.checkpoints.length - 1; i >= 0; i--) {
      const checkpoint = editorMap.checkpoints[i];
      if (checkpoint.vertices.length === 2) {
        // Line checkpoint - check distance to line
        if (isPointNearLine(pos, checkpoint.vertices[0], checkpoint.vertices[1], tolerance)) {
          return { type: 'checkpoint', index: i, data: checkpoint };
        }
      } else if (checkpoint.vertices.length > 2) {
        // Polygon checkpoint
        if (isPointInPolygon(pos, checkpoint.vertices)) {
          return { type: 'checkpoint', index: i, data: checkpoint };
        }
      }
    }
  }

  // Check shapes last (they're typically the background)
  if (editorMap.shapes) {
    for (let i = editorMap.shapes.length - 1; i >= 0; i--) {
      const shape = editorMap.shapes[i];
      if (isPointInPolygon(pos, shape.vertices)) {
        return { type: 'shape', index: i, data: shape };
      }
    }
  }

  return null;
}

// Helper function: Point in polygon test using ray casting
function isPointInPolygon(point, vertices) {
  if (!vertices || vertices.length < 3) return false;
  
  let inside = false;
  let j = vertices.length - 1;
  
  for (let i = 0; i < vertices.length; i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    
    if (((yi > point.y) !== (yj > point.y)) && 
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
    j = i;
  }
  
  return inside;
}

// Helper function: Point near line test
function isPointNearLine(point, lineStart, lineEnd, tolerance) {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) {
    // Line is actually a point
    return Math.hypot(A, B) <= tolerance;
  }
  
  let param = dot / lenSq;
  
  let xx, yy;
  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;
  return Math.hypot(dx, dy) <= tolerance;
}

// Helper function: Point in dynamic object test
function isPointInDynamicObject(point, obj, tolerance) {
  if (!obj.position || !obj.size) return false;
  
  if (obj.shape === 'circle') {
    const radius = Math.max(obj.size.width, obj.size.height) / 2;
    const distance = Math.hypot(point.x - obj.position.x, point.y - obj.position.y);
    return distance <= radius + tolerance;
  } else {
    // Rectangle (default)
    const halfWidth = obj.size.width / 2 + tolerance;
    const halfHeight = obj.size.height / 2 + tolerance;
    return Math.abs(point.x - obj.position.x) <= halfWidth &&
           Math.abs(point.y - obj.position.y) <= halfHeight;
  }
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

  // Draw border with alternating colors if available
  if (Array.isArray(shape.borderColors) && shape.borderColors.length > 0 && shape.borderWidth > 0) {
    const lineWidth = (shape.borderWidth || 8) / zoom;
    const stripeLength = (shape.stripeLength || shape.borderWidth * 1.8 || 25) / zoom;
    
    for (let i = 0; i < shape.vertices.length; i++) {
      const a = { x: shape.vertices[i].x, y: -shape.vertices[i].y };
      const b = { x: shape.vertices[(i + 1) % shape.vertices.length].x, y: -shape.vertices[(i + 1) % shape.vertices.length].y };
      
      // Use different color for each side of the polygon
      const sideColor = shape.borderColors[i % shape.borderColors.length];
      
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.floor(len / stripeLength));
      
      const perpX = -dy / len;
      const perpY = dx / len;
      const offsetX = (perpX * lineWidth) / 2;
      const offsetY = (perpY * lineWidth) / 2;
      
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const x0 = a.x + dx * t0;
        const y0 = a.y + dy * t0;
        const x1 = a.x + dx * t1;
        const y1 = a.y + dy * t1;
        
        editorCtx.beginPath();
        editorCtx.moveTo(x0 + offsetX, y0 + offsetY);
        editorCtx.lineTo(x1 + offsetX, y1 + offsetY);
        editorCtx.lineTo(x1 - offsetX, y1 - offsetY);
        editorCtx.lineTo(x0 - offsetX, y0 - offsetY);
        editorCtx.closePath();
        
        editorCtx.fillStyle = sideColor;
        editorCtx.fill();
      }
      
      // Draw corner caps
      const radius = lineWidth / 2;
      editorCtx.beginPath();
      editorCtx.arc(a.x, a.y, radius, 0, Math.PI * 2);
      editorCtx.fillStyle = sideColor;
      editorCtx.fill();
    }
  }

  // Draw selection border if selected
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

  const objectData = getSelectedObjectData();
  if (!objectData) {
    panel.innerHTML = '<p>Object not found</p>';
    return;
  }

  const propertyForm = generatePropertyForm(selectedObject.type, objectData, selectedObject.index);
  panel.innerHTML = propertyForm;
  attachPropertyEventListeners();
}

function getSelectedObjectData() {
  if (!selectedObject || !editorMap) return null;

  switch (selectedObject.type) {
    case 'shape':
      return editorMap.shapes?.[selectedObject.index];
    case 'dynamicObject':
      return editorMap.dynamicObjects?.[selectedObject.index];
    case 'checkpoint':
      return editorMap.checkpoints?.[selectedObject.index];
    case 'areaEffect':
      return editorMap.areaEffects?.[selectedObject.index];
    default:
      return null;
  }
}

function generatePropertyForm(type, data, index) {
  let html = `<div class="property-form">`;
  html += `<h4>${type.charAt(0).toUpperCase() + type.slice(1)} ${index + 1}</h4>`;

  switch (type) {
    case 'shape':
      html += buildShapeProperties(data, index);
      break;
    case 'dynamicObject':
      html += buildDynamicObjectProperties(data, index);
      break;
    case 'checkpoint':
      html += buildCheckpointProperties(data, index);
      break;
    case 'areaEffect':
      html += buildAreaEffectProperties(data, index);
      break;
  }

  html += `</div>`;
  return html;
}

// Property input component builders
function createColorInput(label, value, id) {
  const hexColor = Array.isArray(value) ? rgbToHex(value[0], value[1], value[2]) : '#888888';
  return `
    <div class="property-row">
      <label class="property-label">${label}:</label>
      <div class="color-input-group">
        <input type="color" id="${id}" class="color-input" value="${hexColor}">
        <span class="color-preview">${hexColor}</span>
      </div>
    </div>
  `;
}

function createNumberInput(label, value, id, min = 0, max = 1000, step = 1) {
  return `
    <div class="property-row">
      <label class="property-label">${label}:</label>
      <input type="number" id="${id}" class="property-input" value="${value || 0}" 
             min="${min}" max="${max}" step="${step}">
    </div>
  `;
}

function createTextInput(label, value, id, placeholder = '') {
  return `
    <div class="property-row">
      <label class="property-label">${label}:</label>
      <input type="text" id="${id}" class="property-input" value="${value || ''}" 
             placeholder="${placeholder}">
    </div>
  `;
}

function createCheckboxInput(label, value, id) {
  return `
    <div class="property-row">
      <label class="property-label">
        <input type="checkbox" id="${id}" class="property-checkbox" ${value ? 'checked' : ''}>
        ${label}
      </label>
    </div>
  `;
}

function createSelectInput(label, value, id, options) {
  let optionsHtml = options.map(option => 
    `<option value="${option.value}" ${option.value === value ? 'selected' : ''}>${option.label}</option>`
  ).join('');
  
  return `
    <div class="property-row">
      <label class="property-label">${label}:</label>
      <select id="${id}" class="property-input">
        ${optionsHtml}
      </select>
    </div>
  `;
}

function createSliderInput(label, value, id, min = 0, max = 1, step = 0.01) {
  return `
    <div class="property-row">
      <label class="property-label">${label}: <span id="${id}_value">${value}</span></label>
      <input type="range" id="${id}" class="property-slider" value="${value || 0}" 
             min="${min}" max="${max}" step="${step}">
    </div>
  `;
}

// Object-specific property builders
function buildShapeProperties(shape, index) {
  let html = '';
  
  // Fill Color
  html += createColorInput('Fill Color', shape.fillColor, `shape_fillColor_${index}`);
  
  // Border Colors (multiple)
  if (shape.borderColors) {
    shape.borderColors.forEach((color, i) => {
      html += createColorInput(`Border ${i + 1}`, hexToRgb(color), `shape_borderColor_${index}_${i}`);
    });
  }
  
  // Border Width
  html += createNumberInput('Border Width', shape.borderWidth, `shape_borderWidth_${index}`, 0, 100, 1);
  
  return html;
}

function buildDynamicObjectProperties(obj, index) {
  let html = '';
  
  // Basic Properties
  html += createTextInput('ID', obj.id, `dynamic_id_${index}`, 'Object identifier');
  
  // Position
  html += '<div class="property-group"><h5>Position</h5>';
  html += createNumberInput('X', obj.position?.x, `dynamic_x_${index}`, -10000, 10000, 1);
  html += createNumberInput('Y', obj.position?.y, `dynamic_y_${index}`, -10000, 10000, 1);
  html += '</div>';
  
  // Size
  html += '<div class="property-group"><h5>Size</h5>';
  html += createNumberInput('Width', obj.size?.width, `dynamic_width_${index}`, 1, 1000, 1);
  html += createNumberInput('Height', obj.size?.height, `dynamic_height_${index}`, 1, 1000, 1);
  html += '</div>';
  
  // Shape Type
  const shapeOptions = [
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'circle', label: 'Circle' }
  ];
  html += createSelectInput('Shape', obj.shape, `dynamic_shape_${index}`, shapeOptions);
  
  // Physics Properties
  html += '<div class="property-group"><h5>Physics</h5>';
  html += createCheckboxInput('Static', obj.isStatic, `dynamic_isStatic_${index}`);
  html += createSliderInput('Density', obj.density, `dynamic_density_${index}`, 0, 5, 0.01);
  html += createSliderInput('Friction', obj.friction, `dynamic_friction_${index}`, 0, 2, 0.01);
  html += createSliderInput('Air Friction', obj.frictionAir, `dynamic_frictionAir_${index}`, 0, 1, 0.01);
  html += createSliderInput('Restitution', obj.restitution, `dynamic_restitution_${index}`, 0, 2, 0.01);
  html += createSliderInput('Damage Scale', obj.damageScale, `dynamic_damageScale_${index}`, 0, 5, 0.01);
  html += '</div>';
  
  // Visual Properties
  html += '<div class="property-group"><h5>Appearance</h5>';
  html += createColorInput('Fill Color', obj.fillColor, `dynamic_fillColor_${index}`);
  html += createColorInput('Stroke Color', obj.strokeColor, `dynamic_strokeColor_${index}`);
  html += createNumberInput('Stroke Width', obj.strokeWidth, `dynamic_strokeWidth_${index}`, 0, 20, 1);
  html += '</div>';
  
  return html;
}

function buildCheckpointProperties(checkpoint, index) {
  let html = '';
  
  html += createTextInput('ID', checkpoint.id, `checkpoint_id_${index}`, 'checkpoint-1');
  
  const typeOptions = [
    { value: 'line', label: 'Line' },
    { value: 'polygon', label: 'Polygon' }
  ];
  html += createSelectInput('Type', checkpoint.type, `checkpoint_type_${index}`, typeOptions);
  
  return html;
}

function buildAreaEffectProperties(area, index) {
  let html = '';
  
  const effectOptions = [
    { value: 'ice', label: 'Ice (Reduces Friction)' },
    { value: 'boost', label: 'Boost (Speed Up)' },
    { value: 'damage', label: 'Damage Zone' },
    { value: 'slow', label: 'Slow Zone' }
  ];
  html += createSelectInput('Effect Type', area.effect, `area_effect_${index}`, effectOptions);
  
  html += createSliderInput('Strength', area.strength, `area_strength_${index}`, 0, 2, 0.01);
  html += createColorInput('Fill Color', area.fillColor, `area_fillColor_${index}`);
  
  return html;
}

// Utility functions
function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [128, 128, 128];
}

// Event handler attachment
function attachPropertyEventListeners() {
  // Color inputs
  document.querySelectorAll('.color-input').forEach(input => {
    input.addEventListener('input', handleColorChange);
  });
  
  // Number inputs
  document.querySelectorAll('.property-input[type="number"]').forEach(input => {
    input.addEventListener('input', handleNumberChange);
  });
  
  // Text inputs
  document.querySelectorAll('.property-input[type="text"]').forEach(input => {
    input.addEventListener('input', handleTextChange);
  });
  
  // Checkboxes
  document.querySelectorAll('.property-checkbox').forEach(input => {
    input.addEventListener('change', handleCheckboxChange);
  });
  
  // Select dropdowns
  document.querySelectorAll('.property-input[type=""], .property-input:not([type])').forEach(input => {
    if (input.tagName === 'SELECT') {
      input.addEventListener('change', handleSelectChange);
    }
  });
  
  // Sliders
  document.querySelectorAll('.property-slider').forEach(input => {
    input.addEventListener('input', handleSliderChange);
  });
}

// Property change event handlers
function handleColorChange(event) {
  const input = event.target;
  const rgb = hexToRgb(input.value);
  const idParts = input.id.split('_');
  const objectType = idParts[0];
  const property = idParts[1];
  const index = parseInt(idParts[2]);
  
  const objectData = getSelectedObjectData();
  if (!objectData) return;
  
  if (objectType === 'shape' && property === 'borderColor') {
    const colorIndex = parseInt(idParts[3]);
    if (objectData.borderColors && objectData.borderColors[colorIndex]) {
      objectData.borderColors[colorIndex] = input.value;
    }
  } else {
    // Regular color properties (fillColor, strokeColor)
    objectData[property] = rgb;
  }
  
  // Update preview color display
  const preview = input.nextElementSibling;
  if (preview && preview.classList.contains('color-preview')) {
    preview.textContent = input.value;
  }
  
  updateMapAndRender();
}

function handleNumberChange(event) {
  const input = event.target;
  const value = parseFloat(input.value);
  const idParts = input.id.split('_');
  const objectType = idParts[0];
  const property = idParts[1];
  const index = parseInt(idParts[2]);
  
  const objectData = getSelectedObjectData();
  if (!objectData) return;
  
  // Handle nested properties
  if (property === 'x' && objectData.position) {
    objectData.position.x = value;
  } else if (property === 'y' && objectData.position) {
    objectData.position.y = value;
  } else if (property === 'width' && objectData.size) {
    objectData.size.width = value;
  } else if (property === 'height' && objectData.size) {
    objectData.size.height = value;
  } else {
    objectData[property] = value;
  }
  
  updateMapAndRender();
}

function handleTextChange(event) {
  const input = event.target;
  const value = input.value;
  const idParts = input.id.split('_');
  const objectType = idParts[0];
  const property = idParts[1];
  const index = parseInt(idParts[2]);
  
  const objectData = getSelectedObjectData();
  if (!objectData) return;
  
  objectData[property] = value;
  updateMapAndRender();
}

function handleCheckboxChange(event) {
  const input = event.target;
  const value = input.checked;
  const idParts = input.id.split('_');
  const objectType = idParts[0];
  const property = idParts[1];
  const index = parseInt(idParts[2]);
  
  const objectData = getSelectedObjectData();
  if (!objectData) return;
  
  objectData[property] = value;
  updateMapAndRender();
}

function handleSelectChange(event) {
  const input = event.target;
  const value = input.value;
  const idParts = input.id.split('_');
  const objectType = idParts[0];
  const property = idParts[1];
  const index = parseInt(idParts[2]);
  
  const objectData = getSelectedObjectData();
  if (!objectData) return;
  
  objectData[property] = value;
  updateMapAndRender();
}

function handleSliderChange(event) {
  const input = event.target;
  const value = parseFloat(input.value);
  const idParts = input.id.split('_');
  const objectType = idParts[0];
  const property = idParts[1];
  const index = parseInt(idParts[2]);
  
  const objectData = getSelectedObjectData();
  if (!objectData) return;
  
  objectData[property] = value;
  
  // Update value display
  const valueDisplay = document.getElementById(`${input.id}_value`);
  if (valueDisplay) {
    valueDisplay.textContent = value.toFixed(2);
  }
  
  updateMapAndRender();
}

function updateMapAndRender() {
  updateMapDataInput();
  renderEditor();
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

  // Show the save modal dialog
  showSaveMapModal();
}

let saveModalHandleEnter = null;

function showSaveMapModal() {
  const modal = document.getElementById('saveMapModal');
  const mapNameInput = document.getElementById('saveMapName');
  const authorInput = document.getElementById('saveMapAuthor');
  
  // Reset form
  mapNameInput.value = '';
  authorInput.value = 'Bradzie';
  document.getElementById('saveCommunity').checked = true;
  
  modal.classList.remove('hidden');
  mapNameInput.focus();
  
  // Handle Enter key in form inputs
  saveModalHandleEnter = (e) => {
    if (e.key === 'Enter') {
      confirmSaveMap();
    }
  };
  
  mapNameInput.addEventListener('keydown', saveModalHandleEnter);
  authorInput.addEventListener('keydown', saveModalHandleEnter);
}

function closeSaveMapModal() {
  const modal = document.getElementById('saveMapModal');
  modal.classList.add('hidden');
  
  // Remove event listeners
  if (saveModalHandleEnter) {
    const mapNameInput = document.getElementById('saveMapName');
    const authorInput = document.getElementById('saveMapAuthor');
    mapNameInput.removeEventListener('keydown', saveModalHandleEnter);
    authorInput.removeEventListener('keydown', saveModalHandleEnter);
    saveModalHandleEnter = null;
  }
}

async function confirmSaveMap() {
  const mapName = document.getElementById('saveMapName').value.trim();
  const author = document.getElementById('saveMapAuthor').value.trim();
  const directory = document.querySelector('input[name="saveDirectory"]:checked').value;
  
  if (!mapName) {
    alert('Please enter a map name');
    return;
  }
  
  if (!author) {
    alert('Please enter an author name');
    return;
  }
  
  closeSaveMapModal();
  
  try {
    // Add author and metadata to map data
    const enhancedMapData = {
      ...editorMap,
      displayName: mapName,
      author: author,
      created_at: editorMap.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const response = await fetch('/api/maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: mapName,
        directory: directory,
        mapData: enhancedMapData 
      })
    });

    const result = await response.json();
    
    if (result.success) {
      alert(`Map saved successfully to ${directory} directory!`);
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
window.closeSaveMapModal = closeSaveMapModal;
window.confirmSaveMap = confirmSaveMap;
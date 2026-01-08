let editorCanvas, editorCtx;
let editorMap = null;

let currentTool = 'select';
let selectedObjects = []; // Changed to array for multi-select
let selectedObject = null; // Keep for backward compatibility
let selectedVertex = null;
let isDragging = false;
let isDraggingObject = false; // New flag for whole object dragging
let dragStartPos = null;
let hoveredObject = null; // Track hovered object for visual feedback
let hoveredVertex = null; // Track hovered vertex for visual feedback
let hoveredEdge = null; // Track hovered edge for visual feedback
let currentMapInfo = {
  key: null,
  name: null,
  directory: null,
  isNew: true,
};

let showGrid = true;
let snapToGrid = true;
let gridSize = 25;

let panX = 0;
let panY = 0;
let zoom = 1;
let isPanning = false;
let lastMousePos = { x: 0, y: 0 };

let creatingShape = false;
let newShapeVertices = [];
let creatingCheckpoint = false;
let checkpointStartPoint = null;
let isShiftKeyHeld = false;
let creatingDynamic = false;
let newDynamicVertices = [];
let creatingAreaEffect = false;
let areaEffectVertices = [];
let placingAxis = false;
let axisTargetObject = null;

let creatingCircle = false;
let creatingRectangle = false;
let creatingTriangle = false;
let presetStartPoint = null;

let historyStack = [];
let historyIndex = -1;

function generateUUID() {
  // Use crypto API if available, otherwise fallback to Date-based UUID
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generation for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
const MAX_HISTORY = 50;

let clipboardObject = null;

function initMapEditor() {
  editorCanvas = document.getElementById('mapEditorCanvas');
  editorCtx = editorCanvas.getContext('2d');
  resizeEditorCanvas();

  // Start with a new blank map
  createNewMap();

  initEventListeners();
  updateUI();
}

function initEventListeners() {
  document.getElementById('newMapButton').addEventListener('click', createNewMap);
  document.getElementById('mapEditorBrowseButton').addEventListener('click', showBrowseModal);
  document.getElementById('closeBrowseModal').addEventListener('click', hideBrowseModal);
  document.getElementById('editorOptionsButton').addEventListener('click', showEditorOptionsModal);
  document.getElementById('closeEditorOptionsModal').addEventListener('click', closeEditorOptionsModal);

  document.getElementById('browseMapModal').addEventListener('click', (e) => {
    if (e.target.id === 'browseMapModal') {
      hideBrowseModal();
    }
  });

  document.getElementById('editorOptionsModal').addEventListener('click', (e) => {
    if (e.target.id === 'editorOptionsModal') {
      closeEditorOptionsModal();
    }
  });

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectTool(btn.dataset.tool);
    });
  });

  const shapeToolBtn = document.getElementById('createShapeTool');
  const shapeHoverMenu = document.getElementById('shapeToolHoverMenu');
  let hoverMenuTimeout = null;

  shapeToolBtn.addEventListener('mouseenter', () => {
    clearTimeout(hoverMenuTimeout);
    showShapeHoverMenu();
  });

  shapeToolBtn.addEventListener('mouseleave', () => {
    hoverMenuTimeout = setTimeout(() => {
      hideShapeHoverMenu();
    }, 100);
  });

  shapeHoverMenu.addEventListener('mouseenter', () => {
    clearTimeout(hoverMenuTimeout);
  });

  shapeHoverMenu.addEventListener('mouseleave', () => {
    hideShapeHoverMenu();
  });

  document.querySelectorAll('.hover-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      handlePresetClick(item.dataset.preset);
      hideShapeHoverMenu();
    });
  });

  // Context menu event listeners
  document.getElementById('addVertexOption').addEventListener('click', handleAddVertex);
  document.getElementById('removeVertexOption').addEventListener('click', handleRemoveVertex);
  document.getElementById('cancelVertexOption').addEventListener('click', hideContextMenu);
  
  // Hide context menu when clicking outside
  document.addEventListener('click', (e) => {
    if (contextMenuVisible && !document.getElementById('vertexContextMenu').contains(e.target)) {
      hideContextMenu();
    }
  });

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

  document.getElementById('saveMapButton')?.addEventListener('click', saveMap);
  document.getElementById('saveAsMapButton')?.addEventListener('click', saveMapAs);
  document.getElementById('setPreviewButton')?.addEventListener('click', generatePreviewImage);

  editorCanvas.addEventListener('mousedown', handleMouseDown);
  editorCanvas.addEventListener('mousemove', handleMouseMove);
  editorCanvas.addEventListener('mouseup', handleMouseUp);
  editorCanvas.addEventListener('wheel', handleWheel);
  editorCanvas.addEventListener('contextmenu', handleRightClick);

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', resizeEditorCanvas);
  
  updateStatusBar();
}

function selectTool(tool) {
  if (creatingShape) {
    creatingShape = false;
    newShapeVertices = [];
  }
  if (creatingCheckpoint) {
    creatingCheckpoint = false;
    checkpointStartPoint = null;
  }
  if (creatingDynamic) {
    creatingDynamic = false;
    dynamicStartPoint = null;
  }
  if (creatingAreaEffect) {
    creatingAreaEffect = false;
    areaEffectVertices = [];
  }
  if (creatingCircle || creatingRectangle || creatingTriangle) {
    creatingCircle = false;
    creatingRectangle = false;
    creatingTriangle = false;
    presetStartPoint = null;
  }
  if (placingAxis) {
    placingAxis = false;
    axisTargetObject = null;
  }

  currentTool = tool;
  selectedObject = null;
  selectedVertex = null;
  
  updateStatusBar();

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
        handleSelectMouseDown(mousePos, e.ctrlKey);
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
      case 'axis':
        handleAxisMouseDown(mousePos);
        break;
      case 'createCircle':
        handleCreateCircleMouseDown(mousePos);
        break;
      case 'createRectangle':
        handleCreateRectangleMouseDown(mousePos);
        break;
      case 'createTriangle':
        handleCreateTriangleMouseDown(mousePos);
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
  
  lastMousePos = { x: e.clientX, y: e.clientY };
  
  updateCoordinates(mousePos);
  
  if (!isDragging && currentTool === 'select') {
    const newHoveredVertex = findVertexAtPosition(mousePos, 15);
    const newHoveredEdge = newHoveredVertex ? null : findEdgeAtPosition(mousePos, 10);
    const newHoveredObject = (newHoveredVertex || newHoveredEdge) ? null : findObjectAtPosition(mousePos);
    
    if (hoveredVertex !== newHoveredVertex || hoveredEdge !== newHoveredEdge || hoveredObject !== newHoveredObject) {
      hoveredVertex = newHoveredVertex;
      hoveredEdge = newHoveredEdge;
      hoveredObject = newHoveredObject;
      
      if (hoveredVertex) {
        editorCanvas.style.cursor = 'grab';
      } else if (hoveredEdge) {
        editorCanvas.style.cursor = 'copy'; // Indicates you can add a vertex
      } else if (hoveredObject) {
        editorCanvas.style.cursor = 'move';
      } else {
        editorCanvas.style.cursor = 'default';
      }
      
      renderEditor(); // Re-render to show/hide hover effects
    }
  }

  if (isDragging && selectedVertex) {
    const snappedPos = snapToGridPos(mousePos);
    selectedVertex.x = snappedPos.x;
    selectedVertex.y = snappedPos.y;
    renderEditor();
  } else if (isDragging && isDraggingObject && selectedObjects.length > 0) {
    const deltaX = mousePos.x - dragStartPos.x;
    const deltaY = mousePos.y - dragStartPos.y;
    
    let snappedDeltaX = deltaX;
    let snappedDeltaY = deltaY;
    
    if (snapToGrid) {
      snappedDeltaX = Math.round(deltaX / gridSize) * gridSize;
      snappedDeltaY = Math.round(deltaY / gridSize) * gridSize;
    }
    
    // Move all selected objects
    selectedObjects.forEach(obj => {
      const objectData = getObjectData(obj);
      if (!objectData || !objectData.vertices) return;
      
      // Move all vertices of the object
      objectData.vertices.forEach(vertex => {
        vertex.x = vertex._originalX + snappedDeltaX;
        vertex.y = vertex._originalY + snappedDeltaY;
      });
      
      if (obj.type === 'dynamicObject' && objectData.position) {
        objectData.position.x = objectData.position._originalX + snappedDeltaX;
        objectData.position.y = objectData.position._originalY + snappedDeltaY;
      }
    });

    renderEditor();
  }

  // re-render when creating checkpoint
  if (creatingCheckpoint && checkpointStartPoint) {
    renderEditor();
  }
}

function handleMouseUp(e) {
  if (e.button === 1) {
    isPanning = false;
    return;
  }

  // Save to history if we were dragging objects
  if (isDraggingObject && selectedObjects.length > 0) {
    saveToHistory();
    
    selectedObjects.forEach(obj => {
      const objectData = getObjectData(obj);
      if (!objectData || !objectData.vertices) return;
      
      objectData.vertices.forEach(vertex => {
        delete vertex._originalX;
        delete vertex._originalY;
      });
      
      if (obj.type === 'dynamicObject' && objectData.position) {
        delete objectData.position._originalX;
        delete objectData.position._originalY;
      }
    });
  }

  isDragging = false;
  isDraggingObject = false;
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

let contextMenuVisible = false;
let contextMenuTarget = null;

function handleRightClick(e) {
  e.preventDefault();
  
  if (currentTool !== 'select') {
    return; // Only show context menu in select mode
  }
  
  const mousePos = getMousePos(e);
  
  const vertexHit = findVertexAtPosition(mousePos, 15);
  if (vertexHit) {
    showVertexContextMenu(e.clientX, e.clientY, vertexHit, mousePos);
    return;
  }
  
  const edgeHit = findEdgeAtPosition(mousePos, 10);
  if (edgeHit) {
    showEdgeContextMenu(e.clientX, e.clientY, edgeHit, mousePos);
    return;
  }
  
  // Hide context menu if clicking elsewhere
  hideContextMenu();
}

function handleKeyDown(e) {
  if (e.key === 'Shift' && !isShiftKeyHeld) {
    isShiftKeyHeld = true;
    if (creatingCheckpoint && checkpointStartPoint) {
      renderEditor(); // re-render to show snapped angle
    }
  }

  switch (e.key) {
    case 'Delete':
      deleteSelectedObject();
      break;
    case 'Escape':
      if (creatingShape) {
        creatingShape = false;
        newShapeVertices = [];
        renderEditor();
      } else if (creatingAreaEffect) {
        creatingAreaEffect = false;
        areaEffectVertices = [];
        renderEditor();
      } else if (creatingDynamic) {
        creatingDynamic = false;
        newDynamicVertices = [];
        renderEditor();
      } else if (creatingCircle || creatingRectangle || creatingTriangle) {
        resetCreationStates();
        currentTool = 'select';
        updateStatusBar();
        renderEditor();
      }
      break;
    case 'Enter':
      if (creatingShape && newShapeVertices.length > 2) {
        finishCreatingShape();
      } else if (creatingAreaEffect && areaEffectVertices.length > 2) {
        finishCreatingAreaEffect();
      } else if (creatingDynamic && newDynamicVertices.length > 2) {
        finishCreatingDynamic();
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
        saveMap();
      } else {
        document.getElementById('snapToGrid').checked = !snapToGrid;
        snapToGrid = !snapToGrid;
      }
      break;
    case 'z':
    case 'Z':
      if (e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey) {
        e.preventDefault();
        undo();
      }
      break;
    case 'y':
    case 'Y':
      if (e.ctrlKey) {
        e.preventDefault();
        redo();
      }
      break;
    case 'c':
    case 'C':
      if (e.ctrlKey) {
        e.preventDefault();
        copySelectedObject();
      }
      break;
    case 'v':
    case 'V':
      if (e.ctrlKey) {
        e.preventDefault();
        pasteObject();
      } else if (!e.ctrlKey && currentTool === 'select' && hoveredEdge) {
        // V key to add vertex at hovered edge
        e.preventDefault();
        const fakeMouseEvent = {
          clientX: lastMousePos.x,
          clientY: lastMousePos.y
        };
        const mousePos = getMousePos(fakeMouseEvent);
        showEdgeContextMenu(lastMousePos.x, lastMousePos.y, hoveredEdge, mousePos);
        handleAddVertex();
      }
      break;
    case 'x':
    case 'X':
      if (!e.ctrlKey && currentTool === 'select' && hoveredVertex) {
        // X key to remove vertex at hovered vertex
        e.preventDefault();
        const fakeMouseEvent = {
          clientX: lastMousePos.x,
          clientY: lastMousePos.y
        };
        const mousePos = getMousePos(fakeMouseEvent);
        showVertexContextMenu(lastMousePos.x, lastMousePos.y, hoveredVertex, mousePos);
        handleRemoveVertex();
      }
      break;
    case 'a':
    case 'A':
      if (e.ctrlKey) {
        e.preventDefault();
        selectAllObjects();
      } else {
        selectTool('areaEffect');
      }
      break;
    case 'd':
    case 'D':
      if (e.ctrlKey) {
        e.preventDefault();
        duplicateSelectedObject();
      } else {
        selectTool('dynamic');
      }
      break;
    case '1':
      selectTool('select');
      break;
    case '2':
      selectTool('createShape');
      break;
    case '3':
      selectTool('checkpoint');
      break;
    case '4':
      selectTool('dynamic');
      break;
    case '5':
      selectTool('areaEffect');
      break;
    case '6':
      handlePresetClick('circle');
      break;
    case '7':
      handlePresetClick('rectangle');
      break;
    case '8':
      handlePresetClick('triangle');
      break;
    case 'ArrowLeft':
      if (e.ctrlKey) {
        e.preventDefault();
        alignSelectedObjects('left');
      } else if (selectedObjects.length > 0) {
        e.preventDefault();
        nudgeSelectedObjects(-gridSize, 0);
      }
      break;
    case 'ArrowRight':
      if (e.ctrlKey) {
        e.preventDefault();
        alignSelectedObjects('right');
      } else if (selectedObjects.length > 0) {
        e.preventDefault();
        nudgeSelectedObjects(gridSize, 0);
      }
      break;
    case 'ArrowUp':
      if (e.ctrlKey) {
        e.preventDefault();
        alignSelectedObjects('top');
      } else if (selectedObjects.length > 0) {
        e.preventDefault();
        nudgeSelectedObjects(0, -gridSize);
      }
      break;
    case 'ArrowDown':
      if (e.ctrlKey) {
        e.preventDefault();
        alignSelectedObjects('bottom');
      } else if (selectedObjects.length > 0) {
        e.preventDefault();
        nudgeSelectedObjects(0, gridSize);
      }
      break;
    case 'PageUp':
      if (e.ctrlKey) {
        e.preventDefault();
        moveToFront();
      } else {
        moveUp();
      }
      break;
    case 'PageDown':
      if (e.ctrlKey) {
        e.preventDefault();
        moveToBack();
      } else {
        moveDown();
      }
      break;
  }
}

function handleKeyUp(e) {
  if (e.key === 'Shift' && isShiftKeyHeld) {
    isShiftKeyHeld = false;
    if (creatingCheckpoint && checkpointStartPoint) {
      renderEditor(); // re-render to remove snapping
    }
  }
}

function handleSelectMouseDown(mousePos, ctrlKey = false) {
  const clickedVertex = findVertexAtPosition(mousePos);
  const clickedObject = findObjectAtPosition(mousePos);

  if (clickedVertex) {
    selectedVertex = clickedVertex.vertex;
    selectedObject = clickedVertex.object;
    selectedObjects = [clickedVertex.object];
    isDragging = true;
    dragStartPos = mousePos;
  } else if (clickedObject) {
    if (ctrlKey) {
      const objIndex = selectedObjects.findIndex(obj => 
        obj.type === clickedObject.type && obj.index === clickedObject.index
      );
      
      if (objIndex >= 0) {
        // Deselect if already selected
        selectedObjects.splice(objIndex, 1);
      } else {
        selectedObjects.push(clickedObject);
      }
      
      selectedObject = selectedObjects.length === 1 ? selectedObjects[0] : null;
    } else {
      selectedObject = clickedObject;
      selectedObjects = [clickedObject];
    }
    selectedVertex = null;
    
    isDragging = true;
    isDraggingObject = true;
    dragStartPos = mousePos;
    
    selectedObjects.forEach(obj => {
      const objectData = getObjectData(obj);
      if (!objectData || !objectData.vertices) return;
      
      objectData.vertices.forEach(vertex => {
        vertex._originalX = vertex.x;
        vertex._originalY = vertex.y;
      });
      
      if (obj.type === 'dynamicObject' && objectData.position) {
        objectData.position._originalX = objectData.position.x;
        objectData.position._originalY = objectData.position.y;
      }
    });
  } else {
    // Clicked on empty space
    if (!ctrlKey) {
      selectedObject = null;
      selectedObjects = [];
      selectedVertex = null;
    }
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
  updateStatusBar();
  renderEditor();
}

function handleCreateCheckpointMouseDown(mousePos) {
  if (!creatingCheckpoint) {
    // Start creating checkpoint - first click
    creatingCheckpoint = true;
    checkpointStartPoint = { ...mousePos };
    updateStatusBar();
  } else {
    // Finish creating checkpoint - second click
    let endPoint = { ...mousePos };

    // Apply angle snapping if shift is held
    if (isShiftKeyHeld) {
      const dx = endPoint.x - checkpointStartPoint.x;
      const dy = endPoint.y - checkpointStartPoint.y;
      const length = Math.sqrt(dx * dx + dy * dy);

      if (length > 0) {
        // Calculate current angle in radians
        let angle = Math.atan2(dy, dx);

        // Snap to 15-degree increments
        const snapAngle = (15 * Math.PI) / 180;
        angle = Math.round(angle / snapAngle) * snapAngle;

        // Calculate snapped position
        endPoint = {
          x: checkpointStartPoint.x + Math.cos(angle) * length,
          y: checkpointStartPoint.y + Math.sin(angle) * length
        };
      }
    }

    const checkpoint = {
      type: "line",
      vertices: [
        checkpointStartPoint,
        endPoint
      ],
      id: generateCheckpointId()
    };

    saveToHistory();
    editorMap.checkpoints.push(checkpoint);
    creatingCheckpoint = false;
    checkpointStartPoint = null;
    updateUI();
    renderEditor();
  }
}

function handleCreateDynamicMouseDown(mousePos) {
  const snappedPos = snapToGridPos(mousePos);

  if (!creatingDynamic) {
    creatingDynamic = true;
    newDynamicVertices = [];
  }

  newDynamicVertices.push({ x: snappedPos.x, y: snappedPos.y });
  updateStatusBar();
  renderEditor();
}

function handleCreateAreaEffectMouseDown(mousePos) {
  const snappedPos = snapToGridPos(mousePos);

  if (!creatingAreaEffect) {
    creatingAreaEffect = true;
    areaEffectVertices = [];
  }

  areaEffectVertices.push({ x: snappedPos.x, y: snappedPos.y });
  updateStatusBar();
  renderEditor();
}

function handleAxisMouseDown(mousePos) {
  // Find dynamic object at click position
  const clickedObject = findObjectAtPosition(mousePos);

  if (!clickedObject || clickedObject.type !== 'dynamicObject') {
    console.warn('Axis tool: Click on a dynamic object to set its pivot point');
    updateStatusBar('Click on a dynamic object to set its pivot point');
    return;
  }

  const dynObj = editorMap.dynamicObjects[clickedObject.index];
  if (!dynObj) return;

  saveToHistory();

  // Set axis at clicked position (world coordinates)
  dynObj.axis = {
    x: mousePos.x,
    y: mousePos.y,
    damping: 0.1,
    stiffness: 1,
    motorSpeed: 0
  };

  // Select the object to show properties
  selectedObjects = [clickedObject];
  selectedObject = clickedObject;

  updatePropertiesPanel();
  renderEditor();

  console.log(`Axis set for ${dynObj.id} at (${mousePos.x.toFixed(1)}, ${mousePos.y.toFixed(1)})`);
}

function resetCreationStates() {
  creatingShape = false;
  newShapeVertices = [];
  creatingCheckpoint = false;
  checkpointStartPoint = null;
  creatingDynamic = false;
  newDynamicVertices = [];
  creatingAreaEffect = false;
  areaEffectVertices = [];
  creatingCircle = false;
  creatingRectangle = false;
  creatingTriangle = false;
  presetStartPoint = null;
  selectedVertex = null;
}

function handlePresetClick(presetType) {
  // Reset current creation states
  resetCreationStates();
  
  switch (presetType) {
    case 'circle':
      currentTool = 'createCircle';
      break;
    case 'rectangle':
      currentTool = 'createRectangle';
      break;
    case 'triangle':
      currentTool = 'createTriangle';
      break;
  }
  
  updateStatusBar();
  renderEditor();
}

function handleCreateCircleMouseDown(mousePos) {
  const snappedPos = snapToGridPos(mousePos);
  
  if (!creatingCircle) {
    // Start creating circle - first click sets center
    creatingCircle = true;
    presetStartPoint = { ...snappedPos };
    updateStatusBar();
  } else {
    // Second click sets radius
    const radius = Math.sqrt(
      Math.pow(snappedPos.x - presetStartPoint.x, 2) + 
      Math.pow(snappedPos.y - presetStartPoint.y, 2)
    );
    
    if (radius > 5) { // Minimum radius
      createCircleShape(presetStartPoint, radius);
    }
    
    creatingCircle = false;
    presetStartPoint = null;
    currentTool = 'select';
    updateStatusBar();
  }
  renderEditor();
}

function handleCreateRectangleMouseDown(mousePos) {
  const snappedPos = snapToGridPos(mousePos);
  
  if (!creatingRectangle) {
    // Start creating rectangle - first click
    creatingRectangle = true;
    presetStartPoint = { ...snappedPos };
    updateStatusBar();
  } else {
    // Second click completes rectangle
    if (Math.abs(snappedPos.x - presetStartPoint.x) > 5 && 
        Math.abs(snappedPos.y - presetStartPoint.y) > 5) {
      createRectangleShape(presetStartPoint, snappedPos);
    }
    
    creatingRectangle = false;
    presetStartPoint = null;
    currentTool = 'select';
    updateStatusBar();
  }
  renderEditor();
}

function handleCreateTriangleMouseDown(mousePos) {
  const snappedPos = snapToGridPos(mousePos);
  
  if (!creatingTriangle) {
    // Start creating triangle - first click sets center
    creatingTriangle = true;
    presetStartPoint = { ...snappedPos };
    updateStatusBar();
  } else {
    // Second click sets size
    const radius = Math.sqrt(
      Math.pow(snappedPos.x - presetStartPoint.x, 2) + 
      Math.pow(snappedPos.y - presetStartPoint.y, 2)
    );
    
    if (radius > 5) { // Minimum radius
      createTriangleShape(presetStartPoint, radius);
    }
    
    creatingTriangle = false;
    presetStartPoint = null;
    currentTool = 'select';
    updateStatusBar();
  }
  renderEditor();
}

function createCircleShape(center, radius, segments = 16) {
  const vertices = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    vertices.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    });
  }
  
  const shape = {
    type: "polygon",
    vertices: vertices,
    fillColor: [100, 100, 100],
    borderColors: ['#ff4d4d', '#ffffff'],
    borderWidth: 20,
    isStatic: true
  };

  saveToHistory();
  editorMap.shapes.push(shape);
  updateUI();
  renderEditor();
}

function createRectangleShape(startPos, endPos) {
  const minX = Math.min(startPos.x, endPos.x);
  const maxX = Math.max(startPos.x, endPos.x);
  const minY = Math.min(startPos.y, endPos.y);
  const maxY = Math.max(startPos.y, endPos.y);

  const shape = {
    type: "polygon",
    vertices: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ],
    fillColor: [100, 100, 100],
    borderColors: ['#ff4d4d', '#ffffff'],
    borderWidth: 20,
    isStatic: true
  };

  saveToHistory();
  editorMap.shapes.push(shape);
  updateUI();
  renderEditor();
}

function createTriangleShape(center, radius) {
  const vertices = [];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * 2 * Math.PI - Math.PI / 2; // Start from top
    vertices.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    });
  }

  const shape = {
    type: "polygon",
    vertices: vertices,
    fillColor: [100, 100, 100],
    borderColors: ['#ff4d4d', '#ffffff'],
    borderWidth: 20,
    isStatic: true
  };
  
  saveToHistory();
  editorMap.shapes.push(shape);
  updateUI();
  renderEditor();
}

function generateCheckpointId() {
  let id = 1;
  while (editorMap.checkpoints.find(cp => cp.id === `checkpoint-${id}`)) {
    id++;
  }
  return `checkpoint-${id}`;
}

function generateDynamicId() {
  let id = 1;
  while (editorMap.dynamicObjects.find(obj => obj.id === `dynamicBox${id}`)) {
    id++;
  }
  return `dynamicBox${id}`;
}

function saveToHistory() {
  if (!editorMap) return;
  
  historyStack.splice(historyIndex + 1);
  
  historyStack.push(JSON.parse(JSON.stringify(editorMap)));
  
  // Limit history size and adjust index accordingly
  if (historyStack.length > MAX_HISTORY) {
    historyStack.shift();
    // Index stays the same since we removed from beginning
  } else {
    historyIndex++;
  }
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    editorMap = JSON.parse(JSON.stringify(historyStack[historyIndex]));
    selectedObject = null;
    selectedObjects = [];
    selectedVertex = null;
    updateUI();
    renderEditor();
  }
}

function redo() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    editorMap = JSON.parse(JSON.stringify(historyStack[historyIndex]));
    selectedObject = null;
    selectedObjects = [];
    selectedVertex = null;
    updateUI();
    renderEditor();
  }
}

function copySelectedObject() {
  if (!selectedObject) return;
  
  const objectData = getSelectedObjectData();
  if (objectData) {
    clipboardObject = {
      type: selectedObject.type,
      data: JSON.parse(JSON.stringify(objectData))
    };
    console.log('Object copied to clipboard');
  }
}

function pasteObject() {
  if (!clipboardObject) return;
  
  saveToHistory();
  
  // Clone the object data
  const pastedData = JSON.parse(JSON.stringify(clipboardObject.data));
  
  // Offset the position slightly to avoid overlap
  const offset = 25;
  if (pastedData.vertices && Array.isArray(pastedData.vertices)) {
    pastedData.vertices.forEach(vertex => {
      vertex.x += offset;
      vertex.y += offset;
    });
  }
  
  // Generate new ID for dynamic objects and checkpoints
  if (clipboardObject.type === 'dynamicObject') {
    pastedData.id = generateDynamicId();
  } else if (clipboardObject.type === 'checkpoint') {
    pastedData.id = generateCheckpointId();
  }
  
  switch (clipboardObject.type) {
    case 'shape':
      if (!editorMap.shapes) editorMap.shapes = [];
      editorMap.shapes.push(pastedData);
      break;
    case 'dynamicObject':
      if (!editorMap.dynamicObjects) editorMap.dynamicObjects = [];
      editorMap.dynamicObjects.push(pastedData);
      break;
    case 'checkpoint':
      if (!editorMap.checkpoints) editorMap.checkpoints = [];
      editorMap.checkpoints.push(pastedData);
      break;
    case 'areaEffect':
      if (!editorMap.areaEffects) editorMap.areaEffects = [];
      editorMap.areaEffects.push(pastedData);
      break;
  }
  
  updateUI();
  renderEditor();
  console.log('Object pasted');
}

function selectAllObjects() {
  selectedObjects = [];
  
  if (editorMap.shapes) {
    editorMap.shapes.forEach((shape, index) => {
      selectedObjects.push({ type: 'shape', index, data: shape });
    });
  }
  
  if (editorMap.checkpoints) {
    editorMap.checkpoints.forEach((checkpoint, index) => {
      selectedObjects.push({ type: 'checkpoint', index, data: checkpoint });
    });
  }
  
  if (editorMap.areaEffects) {
    editorMap.areaEffects.forEach((area, index) => {
      selectedObjects.push({ type: 'areaEffect', index, data: area });
    });
  }
  
  if (editorMap.dynamicObjects) {
    editorMap.dynamicObjects.forEach((obj, index) => {
      selectedObjects.push({ type: 'dynamicObject', index, data: obj });
    });
  }
  
  selectedObject = null; // Clear single selection for multi-select mode
  selectedVertex = null;
  updatePropertiesPanel();
  updateLayersPanel();
  renderEditor();
}

function duplicateSelectedObject() {
  if (!selectedObject) return;
  
  copySelectedObject();
  pasteObject();
}

function alignSelectedObjects(alignment) {
  if (selectedObjects.length < 2) return;
  
  saveToHistory();
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let centerX = 0, centerY = 0;
  
  selectedObjects.forEach(obj => {
    const objectData = getObjectData(obj);
    if (objectData && objectData.vertices) {
      objectData.vertices.forEach(vertex => {
        minX = Math.min(minX, vertex.x);
        maxX = Math.max(maxX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxY = Math.max(maxY, vertex.y);
        centerX += vertex.x;
        centerY += vertex.y;
      });
    }
  });
  
  const totalVertices = selectedObjects.reduce((sum, obj) => {
    const objectData = getObjectData(obj);
    return sum + (objectData && objectData.vertices ? objectData.vertices.length : 0);
  }, 0);
  
  centerX /= totalVertices;
  centerY /= totalVertices;
  
  selectedObjects.forEach(obj => {
    const objectData = getObjectData(obj);
    if (!objectData || !objectData.vertices) return;
    
    let objCenterX = 0, objCenterY = 0;
    objectData.vertices.forEach(vertex => {
      objCenterX += vertex.x;
      objCenterY += vertex.y;
    });
    objCenterX /= objectData.vertices.length;
    objCenterY /= objectData.vertices.length;
    
    let offsetX = 0, offsetY = 0;
    
    switch (alignment) {
      case 'left':
        offsetX = minX - objCenterX;
        break;
      case 'right':
        offsetX = maxX - objCenterX;
        break;
      case 'top':
        offsetY = minY - objCenterY;
        break;
      case 'bottom':
        offsetY = maxY - objCenterY;
        break;
      case 'centerH':
        offsetX = centerX - objCenterX;
        break;
      case 'centerV':
        offsetY = centerY - objCenterY;
        break;
    }
    
    objectData.vertices.forEach(vertex => {
      vertex.x += offsetX;
      vertex.y += offsetY;
    });
  });
  
  renderEditor();
  updatePropertiesPanel();
}

function alignToGrid() {
  if (selectedObjects.length === 0) return;
  
  saveToHistory();
  
  selectedObjects.forEach(obj => {
    const objectData = getObjectData(obj);
    if (!objectData || !objectData.vertices) return;
    
    objectData.vertices.forEach(vertex => {
      vertex.x = Math.round(vertex.x / gridSize) * gridSize;
      vertex.y = Math.round(vertex.y / gridSize) * gridSize;
    });
  });
  
  renderEditor();
  updatePropertiesPanel();
}

function getObjectData(obj) {
  switch (obj.type) {
    case 'shape':
      return editorMap.shapes?.[obj.index];
    case 'checkpoint':
      return editorMap.checkpoints?.[obj.index];
    case 'areaEffect':
      return editorMap.areaEffects?.[obj.index];
    case 'dynamicObject':
      return editorMap.dynamicObjects?.[obj.index];
    case 'startArea':
      return editorMap.start;
    default:
      return null;
  }
}

function moveToFront() {
  if (selectedObjects.length === 0) return;
  
  saveToHistory();
  
  selectedObjects.forEach(obj => {
    const array = getObjectArray(obj.type);
    if (!array || obj.index >= array.length) return;
    
    const objData = array.splice(obj.index, 1)[0];
    array.push(objData);
  });
  
  updateSelectedObjectIndices();
  updateLayersPanel();
  renderEditor();
}

function moveToBack() {
  if (selectedObjects.length === 0) return;
  
  saveToHistory();
  
  // Sort by index to maintain order when moving
  const sortedObjects = selectedObjects.slice().sort((a, b) => a.index - b.index);
  
  sortedObjects.forEach((obj, i) => {
    const array = getObjectArray(obj.type);
    if (!array || obj.index >= array.length) return;
    
    const objData = array.splice(obj.index - i, 1)[0]; // Subtract i to account for previous removals
    array.unshift(objData);
  });
  
  updateSelectedObjectIndices();
  updateLayersPanel();
  renderEditor();
}

function moveUp() {
  if (selectedObjects.length === 0) return;
  
  saveToHistory();
  
  selectedObjects.forEach(obj => {
    const array = getObjectArray(obj.type);
    if (!array || obj.index >= array.length - 1) return;
    
    // Swap with next item
    [array[obj.index], array[obj.index + 1]] = [array[obj.index + 1], array[obj.index]];
    obj.index++; // Update selected object index
  });
  
  updateLayersPanel();
  renderEditor();
}

function moveDown() {
  if (selectedObjects.length === 0) return;
  
  saveToHistory();
  
  selectedObjects.forEach(obj => {
    const array = getObjectArray(obj.type);
    if (!array || obj.index <= 0) return;
    
    // Swap with previous item
    [array[obj.index], array[obj.index - 1]] = [array[obj.index - 1], array[obj.index]];
    obj.index--; // Update selected object index
  });
  
  updateLayersPanel();
  renderEditor();
}

function getObjectArray(type) {
  switch (type) {
    case 'shape':
      return editorMap.shapes;
    case 'checkpoint':
      return editorMap.checkpoints;
    case 'areaEffect':
      return editorMap.areaEffects;
    case 'dynamicObject':
      return editorMap.dynamicObjects;
    default:
      return null;
  }
}

function updateSelectedObjectIndices() {
  selectedObjects.forEach(obj => {
    const array = getObjectArray(obj.type);
    if (!array) return;
    
    // Find new index of the object data
    for (let i = 0; i < array.length; i++) {
      if (array[i] === obj.data) {
        obj.index = i;
        break;
      }
    }
  });
}

function findVertexAtPosition(pos, tolerance = 10) {
  const scaledTolerance = tolerance / zoom;

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

  if (editorMap.dynamicObjects) {
    for (let i = 0; i < editorMap.dynamicObjects.length; i++) {
      const dynObj = editorMap.dynamicObjects[i];
      if (dynObj.vertices && Array.isArray(dynObj.vertices)) {
        for (let j = 0; j < dynObj.vertices.length; j++) {
          const vertex = dynObj.vertices[j];
          const distance = Math.sqrt(
            Math.pow(pos.x - vertex.x, 2) + Math.pow(pos.y - vertex.y, 2)
          );
          if (distance <= scaledTolerance) {
            return {
              object: { type: 'dynamicObject', index: i, data: dynObj },
              vertex: vertex,
              vertexIndex: j
            };
          }
        }
      }
    }
  }

  // Check start area vertices
  if (editorMap.start && editorMap.start.vertices) {
    for (let j = 0; j < editorMap.start.vertices.length; j++) {
      const vertex = editorMap.start.vertices[j];
      const distance = Math.sqrt(
        Math.pow(pos.x - vertex.x, 2) + Math.pow(pos.y - vertex.y, 2)
      );
      if (distance <= scaledTolerance) {
        return {
          object: { type: 'startArea', index: 0, data: editorMap.start },
          vertex: vertex,
          vertexIndex: j
        };
      }
    }
  }

  return null;
}

function findEdgeAtPosition(pos, tolerance = 10) {
  const scaledTolerance = tolerance / zoom;

  if (editorMap.shapes) {
    for (let i = 0; i < editorMap.shapes.length; i++) {
      const shape = editorMap.shapes[i];
      for (let j = 0; j < shape.vertices.length; j++) {
        const vertex1 = shape.vertices[j];
        const vertex2 = shape.vertices[(j + 1) % shape.vertices.length];

        const distanceToEdge = distancePointToLineSegment(pos, vertex1, vertex2);
        if (distanceToEdge <= scaledTolerance) {
          return {
            object: { type: 'shape', index: i, data: shape },
            edgeIndex: j,
            insertPosition: pos
          };
        }
      }
    }
  }

  if (editorMap.dynamicObjects) {
    for (let i = 0; i < editorMap.dynamicObjects.length; i++) {
      const dynObj = editorMap.dynamicObjects[i];
      if (!dynObj.vertices) continue;

      for (let j = 0; j < dynObj.vertices.length; j++) {
        const vertex1 = dynObj.vertices[j];
        const vertex2 = dynObj.vertices[(j + 1) % dynObj.vertices.length];

        const distanceToEdge = distancePointToLineSegment(pos, vertex1, vertex2);
        if (distanceToEdge <= scaledTolerance) {
          return {
            object: { type: 'dynamicObject', index: i, data: dynObj },
            edgeIndex: j,
            insertPosition: pos
          };
        }
      }
    }
  }

  return null;
}

function distancePointToLineSegment(point, lineStart, lineEnd) {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) return Math.sqrt(A * A + B * B);
  
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
  return Math.sqrt(dx * dx + dy * dy);
}

function showVertexContextMenu(clientX, clientY, vertexHit, mousePos) {
  const contextMenu = document.getElementById('vertexContextMenu');
  const removeOption = document.getElementById('removeVertexOption');
  
  contextMenuVisible = true;
  contextMenuTarget = {
    type: 'vertex',
    vertexHit: vertexHit,
    mousePos: mousePos
  };
  
  const canRemove = vertexHit.object.data.vertices.length > 3;
  
  if (canRemove) {
    removeOption.classList.remove('disabled');
  } else {
    removeOption.classList.add('disabled');
  }
  
  contextMenu.style.left = clientX + 'px';
  contextMenu.style.top = clientY + 'px';
  contextMenu.classList.remove('hidden');
  
  // Hide "Add Vertex Here" option since we're on a vertex
  document.getElementById('addVertexOption').style.display = 'none';
}

function showEdgeContextMenu(clientX, clientY, edgeHit, mousePos) {
  const contextMenu = document.getElementById('vertexContextMenu');
  
  contextMenuVisible = true;
  contextMenuTarget = {
    type: 'edge',
    edgeHit: edgeHit,
    mousePos: mousePos
  };
  
  // Show "Add Vertex Here" option and hide "Remove Vertex"
  document.getElementById('addVertexOption').style.display = 'block';
  document.getElementById('removeVertexOption').style.display = 'none';
  
  contextMenu.style.left = clientX + 'px';
  contextMenu.style.top = clientY + 'px';
  contextMenu.classList.remove('hidden');
}

function hideContextMenu() {
  const contextMenu = document.getElementById('vertexContextMenu');
  contextMenu.classList.add('hidden');
  contextMenuVisible = false;
  contextMenuTarget = null;

  // Reset menu items visibility
  document.getElementById('addVertexOption').style.display = 'block';
  document.getElementById('removeVertexOption').style.display = 'block';
}

function showShapeHoverMenu() {
  const shapeToolBtn = document.getElementById('createShapeTool');
  const shapeHoverMenu = document.getElementById('shapeToolHoverMenu');
  const rect = shapeToolBtn.getBoundingClientRect();

  shapeHoverMenu.style.left = (rect.right + 5) + 'px';
  shapeHoverMenu.style.top = rect.top + 'px';
  shapeHoverMenu.classList.remove('hidden');
}

function hideShapeHoverMenu() {
  const shapeHoverMenu = document.getElementById('shapeToolHoverMenu');
  shapeHoverMenu.classList.add('hidden');
}

function handleAddVertex() {
  if (!contextMenuTarget || contextMenuTarget.type !== 'edge') {
    hideContextMenu();
    return;
  }
  
  const { edgeHit, mousePos } = contextMenuTarget;
  const shape = edgeHit.object.data;
  const edgeIndex = edgeHit.edgeIndex;
  
  // Save to history before modification
  saveToHistory();
  
  // Insert new vertex after the edge's first vertex
  const snappedPos = snapToGridPos(mousePos);
  shape.vertices.splice(edgeIndex + 1, 0, {
    x: snappedPos.x,
    y: snappedPos.y
  });
  
  hideContextMenu();
  updateUI();
  renderEditor();
}

function handleRemoveVertex() {
  if (!contextMenuTarget || contextMenuTarget.type !== 'vertex') {
    hideContextMenu();
    return;
  }
  
  const { vertexHit } = contextMenuTarget;
  const shape = vertexHit.object.data;
  const vertexIndex = vertexHit.vertexIndex;
  
  if (shape.vertices.length <= 3) {
    hideContextMenu();
    return;
  }
  
  // Save to history before modification
  saveToHistory();
  
  shape.vertices.splice(vertexIndex, 1);
  
  hideContextMenu();
  updateUI();
  renderEditor();
}

function findObjectAtPosition(pos) {
  const tolerance = 10 / zoom; // Adjust tolerance based on zoom level

  // Check start area first (highest priority)
  if (editorMap.start && editorMap.start.vertices) {
    if (isPointInPolygon(pos, editorMap.start.vertices)) {
      return { type: 'startArea', index: 0, data: editorMap.start };
    }
  }

  if (editorMap.dynamicObjects) {
    for (let i = editorMap.dynamicObjects.length - 1; i >= 0; i--) {
      const obj = editorMap.dynamicObjects[i];
      if (isPointInDynamicObject(pos, obj, tolerance)) {
        return { type: 'dynamicObject', index: i, data: obj };
      }
    }
  }

  if (editorMap.areaEffects) {
    for (let i = editorMap.areaEffects.length - 1; i >= 0; i--) {
      const area = editorMap.areaEffects[i];
      if (isPointInPolygon(pos, area.vertices)) {
        return { type: 'areaEffect', index: i, data: area };
      }
    }
  }

  if (editorMap.checkpoints) {
    for (let i = editorMap.checkpoints.length - 1; i >= 0; i--) {
      const checkpoint = editorMap.checkpoints[i];
      if (checkpoint.vertices.length === 2) {
        // Line checkpoint - check distance to line
        if (isPointNearLine(pos, checkpoint.vertices[0], checkpoint.vertices[1], tolerance)) {
          return { type: 'checkpoint', index: i, data: checkpoint };
        }
      } else if (checkpoint.vertices.length > 2) {
        if (isPointInPolygon(pos, checkpoint.vertices)) {
          return { type: 'checkpoint', index: i, data: checkpoint };
        }
      }
    }
  }

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

// Helper function: Point in polygon test
function isPointInPolygon(point, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    if (((vertices[i].y > point.y) !== (vertices[j].y > point.y)) &&
        (point.x < (vertices[j].x - vertices[i].x) * (point.y - vertices[i].y) / (vertices[j].y - vertices[i].y) + vertices[i].x)) {
      inside = !inside;
    }
  }
  return inside;
}

// Helper function: Point in dynamic object test
function isPointInDynamicObject(point, obj, tolerance = 0) {
  if (!obj.vertices || !Array.isArray(obj.vertices)) return false;
  
  return isPointInPolygon(point, obj.vertices);
}

function finishCreatingShape() {
  if (newShapeVertices.length > 2) {
    if (!editorMap.shapes) {
      editorMap.shapes = [];
    }
    saveToHistory();
    editorMap.shapes.push({
      vertices: newShapeVertices,
      fillColor: [128, 128, 128],
      borderColors: ['#ff4d4d', '#ffffff'],
      borderWidth: 20
    });
  }
  
  creatingShape = false;
  newShapeVertices = [];
  selectTool('select');
  updateStatusBar();
  renderEditor();
}

function finishCreatingAreaEffect() {
  if (areaEffectVertices.length > 2) {
    if (!editorMap.areaEffects) {
      editorMap.areaEffects = [];
    }
    saveToHistory();
    editorMap.areaEffects.push({
      vertices: areaEffectVertices,
      effect: 'boost',
      strength: 2.0,
      fillColor: [50, 255, 50]
    });
  }
  
  creatingAreaEffect = false;
  areaEffectVertices = [];
  selectTool('select');
  updateStatusBar();
  renderEditor();
}

function finishCreatingDynamic() {
  if (newDynamicVertices.length > 2) {
    if (!editorMap.dynamicObjects) {
      editorMap.dynamicObjects = [];
    }
    saveToHistory();
    editorMap.dynamicObjects.push({
      id: generateDynamicId(),
      vertices: newDynamicVertices,
      isStatic: false,
      density: 0.3,
      friction: 0.3,
      frictionAir: 0.2,
      restitution: 0.1,
      damageScale: 0,
      fillColor: [139, 69, 19],
      strokeColor: [101, 67, 33],
      strokeWidth: 4
    });
  }

  creatingDynamic = false;
  newDynamicVertices = [];
  selectTool('select');
  updateStatusBar();
  renderEditor();
}

function deleteSelectedObject() {
  if (selectedObjects.length === 0) return;
  deleteSelectedObjects();
}

function deleteSelectedObjects() {
  if (selectedObjects.length === 0) return;

  // Filter out start area (cannot be deleted)
  const hasStartArea = selectedObjects.some(obj => obj.type === 'startArea');
  if (hasStartArea) {
    console.warn('Start area cannot be deleted');
    // Remove startArea from selection but keep other objects
    selectedObjects = selectedObjects.filter(obj => obj.type !== 'startArea');
    if (selectedObjects.length === 0) {
      updatePropertiesPanel();
      renderEditor();
      return;
    }
  }

  saveToHistory();

  // Sort by index in reverse order to avoid index shifting issues
  const sortedObjects = selectedObjects.slice().sort((a, b) => b.index - a.index);

  sortedObjects.forEach(obj => {
    switch (obj.type) {
      case 'shape':
        editorMap.shapes.splice(obj.index, 1);
        break;
      case 'checkpoint':
        editorMap.checkpoints.splice(obj.index, 1);
        break;
      case 'areaEffect':
        editorMap.areaEffects.splice(obj.index, 1);
        break;
      case 'dynamicObject':
        editorMap.dynamicObjects.splice(obj.index, 1);
        break;
      case 'startArea':
        // Should never reach here due to filter above
        break;
    }
  });

  selectedObject = null;
  selectedObjects = [];
  selectedVertex = null;
  updatePropertiesPanel();
  updateLayersPanel();
  renderEditor();
}

function removeAxis(index) {
  if (!editorMap.dynamicObjects[index]) return;
  saveToHistory();
  delete editorMap.dynamicObjects[index].axis;
  updatePropertiesPanel();
  renderEditor();
}

// Make removeAxis globally accessible for onclick handler
window.removeAxis = removeAxis;

function renderEditor() {
  if (!editorCanvas || !editorCtx) return;
  
  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  
  editorCtx.save();
  editorCtx.translate(editorCanvas.width / 2 + panX, editorCanvas.height / 2 + panY);
  editorCtx.scale(zoom, zoom);

  if (showGrid) {
    drawGrid();
  }

  if (!editorMap) {
    editorCtx.restore();
    return;
  }

  if (Array.isArray(editorMap.shapes)) {
    editorMap.shapes.forEach((shape, index) => {
      const isSelected = selectedObjects.some(obj => obj.type === 'shape' && obj.index === index);
      const isHovered = hoveredObject && hoveredObject.type === 'shape' && hoveredObject.index === index;
      drawShape(shape, isSelected, isHovered);
    });
  }

  if (Array.isArray(editorMap.checkpoints)) {
    editorMap.checkpoints.forEach((checkpoint, index) => {
      const isSelected = selectedObjects.some(obj => obj.type === 'checkpoint' && obj.index === index);
      const isHovered = hoveredObject && hoveredObject.type === 'checkpoint' && hoveredObject.index === index;
      drawCheckpoint(checkpoint, isSelected, isHovered);
    });
  }

  if (Array.isArray(editorMap.areaEffects)) {
    editorMap.areaEffects.forEach((area, index) => {
      const isSelected = selectedObjects.some(obj => obj.type === 'areaEffect' && obj.index === index);
      const isHovered = hoveredObject && hoveredObject.type === 'areaEffect' && hoveredObject.index === index;
      drawAreaEffect(area, isSelected, isHovered);
    });
  }

  if (Array.isArray(editorMap.dynamicObjects)) {
    editorMap.dynamicObjects.forEach((obj, index) => {
      const isSelected = selectedObjects.some(selectedObj => selectedObj.type === 'dynamicObject' && selectedObj.index === index);
      const isHovered = hoveredObject && hoveredObject.type === 'dynamicObject' && hoveredObject.index === index;
      drawDynamicObject(obj, isSelected, isHovered);
    });
  }

  if (editorMap.start && Array.isArray(editorMap.start.vertices)) {
    const isStartSelected = selectedObjects.some(obj => obj.type === 'startArea');
    const isStartHovered = hoveredObject && hoveredObject.type === 'startArea';
    drawStartArea(editorMap.start, isStartSelected, isStartHovered);
  }

  // Draw new shape being created
  if (creatingShape && newShapeVertices.length > 0) {
    drawNewShape();
  }
  
  // Draw checkpoint being created
  if (creatingCheckpoint && checkpointStartPoint) {
    drawCheckpointPreview();
  }
  
  // Draw dynamic object being created
  if (creatingDynamic && newDynamicVertices.length > 0) {
    drawNewDynamic();
  }
  
  // Draw area effect being created
  if (creatingAreaEffect && areaEffectVertices.length > 0) {
    drawNewAreaEffect();
  }
  
  if (creatingCircle && presetStartPoint) {
    drawCirclePreview();
  } else if (creatingRectangle && presetStartPoint) {
    drawRectanglePreview();
  } else if (creatingTriangle && presetStartPoint) {
    drawTrianglePreview();
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

  for (let x = startX; x <= endX; x += gridSize) {
    editorCtx.beginPath();
    editorCtx.moveTo(x, startY);
    editorCtx.lineTo(x, endY);
    editorCtx.stroke();
  }

  for (let y = startY; y <= endY; y += gridSize) {
    editorCtx.beginPath();
    editorCtx.moveTo(startX, y);
    editorCtx.lineTo(endX, y);
    editorCtx.stroke();
  }

  editorCtx.setLineDash([]);
}

function drawShape(shape, isSelected, isHovered = false) {
  if (!Array.isArray(shape.vertices) || shape.vertices.length === 0) return;

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
  editorCtx.fill('evenodd');

  // Draw border with alternating colors if available
  if (Array.isArray(shape.borderColors) && shape.borderColors.length > 0 && shape.borderWidth > 0) {
    const lineWidth = shape.borderWidth;
    const baseColor = shape.borderColors[0];

    // Single color mode: draw solid border
    if (shape.borderColors.length === 1) {
      editorCtx.lineWidth = lineWidth;
      editorCtx.strokeStyle = baseColor;
      editorCtx.lineJoin = 'round';
      editorCtx.lineCap = 'round';
      editorCtx.stroke();
    }
    // Dual color mode: draw striped border
    else {
      const stripeLength = shape.stripeLength || shape.borderWidth * 1.8 || 25;

      for (let i = 0; i < shape.vertices.length; i++) {
        const a = { x: shape.vertices[i].x, y: -shape.vertices[i].y };
        const b = { x: shape.vertices[(i + 1) % shape.vertices.length].x, y: -shape.vertices[(i + 1) % shape.vertices.length].y };

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

          const isLastStripe = s === steps - 1;
          editorCtx.fillStyle = isLastStripe ? baseColor : shape.borderColors[s % shape.borderColors.length];
          editorCtx.fill();
        }

        const radius = lineWidth / 2;
        editorCtx.beginPath();
        editorCtx.arc(a.x, a.y, radius, 0, Math.PI * 2);
        editorCtx.fillStyle = baseColor;
        editorCtx.fill();
      }
    }
  }

  // Draw selection border if selected
  if (isSelected) {
    editorCtx.strokeStyle = '#ffff00';
    editorCtx.lineWidth = 2 / zoom;
    editorCtx.stroke();
  }

  if (isHovered && !isSelected) {
    editorCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    editorCtx.lineWidth = 4 / zoom;
    editorCtx.stroke();
  }

  if (isSelected) {
    drawVertices(shape.vertices);
  }
  
  // Draw hovered vertex highlight
  if (hoveredVertex && hoveredVertex.object.data === shape) {
    const vertex = hoveredVertex.vertex;
    editorCtx.beginPath();
    editorCtx.arc(vertex.x, -vertex.y, 6 / zoom, 0, 2 * Math.PI);
    editorCtx.fillStyle = 'rgba(255, 255, 0, 0.5)';
    editorCtx.fill();
    editorCtx.strokeStyle = '#ffff00';
    editorCtx.lineWidth = 2 / zoom;
    editorCtx.stroke();
  }
  
  // Draw hovered edge highlight
  if (hoveredEdge && hoveredEdge.object.data === shape) {
    const edgeIndex = hoveredEdge.edgeIndex;
    const vertex1 = shape.vertices[edgeIndex];
    const vertex2 = shape.vertices[(edgeIndex + 1) % shape.vertices.length];
    
    editorCtx.beginPath();
    editorCtx.moveTo(vertex1.x, -vertex1.y);
    editorCtx.lineTo(vertex2.x, -vertex2.y);
    editorCtx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
    editorCtx.lineWidth = 4 / zoom;
    editorCtx.stroke();
    
    // Draw plus icon at insertion point
    const insertPos = hoveredEdge.insertPosition;
    drawPlusIcon(insertPos.x, -insertPos.y, 8 / zoom);
  }
}

function drawCheckpoint(checkpoint, isSelected, isHovered = false) {
  if (!Array.isArray(checkpoint.vertices)) return;

  editorCtx.strokeStyle = isSelected ? '#ffff00' : '#00ff00';
  editorCtx.lineWidth = 3 / zoom;
  editorCtx.beginPath();
  
  if (checkpoint.vertices.length === 2) {
    editorCtx.moveTo(checkpoint.vertices[0].x, -checkpoint.vertices[0].y);
    editorCtx.lineTo(checkpoint.vertices[1].x, -checkpoint.vertices[1].y);
  }
  editorCtx.stroke();

  if (isHovered && !isSelected) {
    editorCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    editorCtx.lineWidth = 6 / zoom;
    editorCtx.stroke();
  }

  if (isSelected) {
    drawVertices(checkpoint.vertices);
  }
}

function drawAreaEffect(area, isSelected, isHovered = false) {
  if (!Array.isArray(area.vertices)) return;

  editorCtx.beginPath();
  editorCtx.moveTo(area.vertices[0].x, -area.vertices[0].y);
  for (let i = 1; i < area.vertices.length; i++) {
    editorCtx.lineTo(area.vertices[i].x, -area.vertices[i].y);
  }
  editorCtx.closePath();

  // Determine colors based on effect type if not explicitly set
  let fillColor = area.fillColor;
  if (!fillColor || fillColor.length !== 3) {
    switch (area.effect) {
      case 'ice':
        fillColor = [173, 216, 230]; // Light blue
        break;
      case 'lava':
        fillColor = [255, 69, 0]; // Red-orange
        break;
      case 'boost':
        fillColor = [50, 255, 50]; // Bright green
        break;
      case 'slow':
        fillColor = [255, 140, 0]; // Dark orange
        break;
      default:
        fillColor = [128, 128, 128]; // Gray
    }
  }
  
  const alpha = 0.6;
  editorCtx.fillStyle = `rgba(${fillColor[0]},${fillColor[1]},${fillColor[2]},${alpha})`;
  editorCtx.fill();

  if (isHovered && !isSelected) {
    editorCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    editorCtx.lineWidth = 3 / zoom;
    editorCtx.stroke();
  }

  if (isSelected) {
    editorCtx.strokeStyle = '#ffff00';
    editorCtx.lineWidth = 2 / zoom;
    editorCtx.stroke();
    drawVertices(area.vertices);
  }
  
  editorCtx.restore();
}

function drawDynamicObject(obj, isSelected, isHovered = false) {
  if (!obj.vertices || !Array.isArray(obj.vertices) || obj.vertices.length < 3) return;
  
  // Draw the polygon shape
  editorCtx.beginPath();
  obj.vertices.forEach((v, i) => {
    if (i === 0) {
      editorCtx.moveTo(v.x, -v.y);
    } else {
      editorCtx.lineTo(v.x, -v.y);
    }
  });
  editorCtx.closePath();
  
  editorCtx.fillStyle = obj.fillColor ? 
    `rgb(${obj.fillColor[0]},${obj.fillColor[1]},${obj.fillColor[2]})` : '#ff00ff';
  editorCtx.fill();
  
  if (obj.strokeColor && Array.isArray(obj.strokeColor)) {
    editorCtx.strokeStyle = `rgb(${obj.strokeColor[0]},${obj.strokeColor[1]},${obj.strokeColor[2]})`;
    editorCtx.lineWidth = obj.strokeWidth || 2;
    editorCtx.stroke();
  }

  if (isHovered && !isSelected) {
    editorCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    editorCtx.lineWidth = 4 / zoom;
    editorCtx.stroke();
  }

  if (isSelected) {
    editorCtx.strokeStyle = '#ffff00';
    editorCtx.lineWidth = 3 / zoom;
    editorCtx.stroke();

    // Draw vertices for manipulation
    drawVertices(obj.vertices);

    // Draw axis point if it exists
    if (obj.axis) {
      editorCtx.save();

      // Draw circle at axis point
      editorCtx.fillStyle = '#ff0000';
      editorCtx.strokeStyle = '#ffffff';
      editorCtx.lineWidth = 2 / zoom;

      editorCtx.beginPath();
      editorCtx.arc(obj.axis.x, -obj.axis.y, 6 / zoom, 0, 2 * Math.PI);
      editorCtx.fill();
      editorCtx.stroke();

      // Draw crosshair at axis point
      const size = 12 / zoom;
      editorCtx.beginPath();
      editorCtx.moveTo(obj.axis.x - size, -obj.axis.y);
      editorCtx.lineTo(obj.axis.x + size, -obj.axis.y);
      editorCtx.moveTo(obj.axis.x, -(obj.axis.y - size));
      editorCtx.lineTo(obj.axis.x, -(obj.axis.y + size));
      editorCtx.lineWidth = 2 / zoom;
      editorCtx.strokeStyle = '#ff0000';
      editorCtx.stroke();

      editorCtx.restore();
    }
  }
}

function drawStartArea(start, isSelected = false, isHovered = false) {
  if (!Array.isArray(start.vertices)) return;

  editorCtx.beginPath();
  editorCtx.moveTo(start.vertices[0].x, -start.vertices[0].y);
  for (let i = 1; i < start.vertices.length; i++) {
    editorCtx.lineTo(start.vertices[i].x, -start.vertices[i].y);
  }
  editorCtx.closePath();

  // Base green color
  editorCtx.strokeStyle = '#00ff00';
  editorCtx.lineWidth = 2 / zoom;
  editorCtx.stroke();

  // Hover highlight
  if (isHovered && !isSelected) {
    editorCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    editorCtx.lineWidth = 4 / zoom;
    editorCtx.stroke();
  }

  // Selection highlight
  if (isSelected) {
    editorCtx.strokeStyle = '#ffff00';
    editorCtx.lineWidth = 3 / zoom;
    editorCtx.stroke();

    // Draw vertex handles
    drawVertices(start.vertices);
  }
}

function drawNewShape() {
  if (newShapeVertices.length === 0) return;
  
  // Draw filled preview if we have 3 or more vertices
  if (newShapeVertices.length >= 3) {
    editorCtx.fillStyle = 'rgba(128, 128, 128, 0.4)';
    editorCtx.beginPath();
    editorCtx.moveTo(newShapeVertices[0].x, -newShapeVertices[0].y);
    for (let i = 1; i < newShapeVertices.length; i++) {
      editorCtx.lineTo(newShapeVertices[i].x, -newShapeVertices[i].y);
    }
    editorCtx.closePath();
    editorCtx.fill();
  }
  
  editorCtx.strokeStyle = '#00ff00';
  editorCtx.lineWidth = 2 / zoom;
  editorCtx.setLineDash([3 / zoom, 3 / zoom]);
  
  editorCtx.beginPath();
  editorCtx.moveTo(newShapeVertices[0].x, -newShapeVertices[0].y);
  for (let i = 1; i < newShapeVertices.length; i++) {
    editorCtx.lineTo(newShapeVertices[i].x, -newShapeVertices[i].y);
  }
  
  // Draw preview line to close the shape if we have enough vertices
  if (newShapeVertices.length >= 2) {
    const mousePos = getMouseCanvasPos();
    if (mousePos) {
      editorCtx.lineTo(mousePos.x, -mousePos.y);
      // Show closing line to first vertex
      if (newShapeVertices.length >= 3) {
        editorCtx.lineTo(newShapeVertices[0].x, -newShapeVertices[0].y);
      }
    }
  }
  
  editorCtx.stroke();
  editorCtx.setLineDash([]);

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

function drawPlusIcon(x, y, size) {
  editorCtx.strokeStyle = '#00ff00';
  editorCtx.lineWidth = 2 / zoom;
  
  editorCtx.beginPath();
  editorCtx.moveTo(x - size/2, y);
  editorCtx.lineTo(x + size/2, y);
  editorCtx.stroke();
  
  editorCtx.beginPath();
  editorCtx.moveTo(x, y - size/2);
  editorCtx.lineTo(x, y + size/2);
  editorCtx.stroke();
}

function getMouseCanvasPos() {
  if (!lastMousePos) return null;
  
  const rect = editorCanvas.getBoundingClientRect();
  const x = (lastMousePos.x - rect.left - editorCanvas.width / 2 - panX) / zoom;
  const y = -(lastMousePos.y - rect.top - editorCanvas.height / 2 - panY) / zoom;
  return { x, y };
}

function drawCheckpointPreview() {
  let mousePos = getMouseCanvasPos();
  if (!mousePos) return;

  if (isShiftKeyHeld) {
    const dx = mousePos.x - checkpointStartPoint.x;
    const dy = mousePos.y - checkpointStartPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length > 0) {
      let angle = Math.atan2(dy, dx);

      const snapAngle = (15 * Math.PI) / 180;
      angle = Math.round(angle / snapAngle) * snapAngle;

      mousePos = {
        x: checkpointStartPoint.x + Math.cos(angle) * length,
        y: checkpointStartPoint.y + Math.sin(angle) * length
      };
    }
  }

  const dx = mousePos.x - checkpointStartPoint.x;
  const dy = mousePos.y - checkpointStartPoint.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length > 0) {
    const normalX = -dy / length; // we shall normalize
    const normalY = dx / length;

    const thickness = 10;
    const offset = thickness / 2;

    const p1x = checkpointStartPoint.x + normalX * offset;
    const p1y = checkpointStartPoint.y + normalY * offset;
    const p2x = checkpointStartPoint.x - normalX * offset;
    const p2y = checkpointStartPoint.y - normalY * offset;
    const p3x = mousePos.x - normalX * offset;
    const p3y = mousePos.y - normalY * offset;
    const p4x = mousePos.x + normalX * offset;
    const p4y = mousePos.y + normalY * offset;

    editorCtx.fillStyle = 'rgba(0, 255, 0, 0.3)';
    editorCtx.beginPath();
    editorCtx.moveTo(p1x, -p1y);
    editorCtx.lineTo(p2x, -p2y);
    editorCtx.lineTo(p3x, -p3y);
    editorCtx.lineTo(p4x, -p4y);
    editorCtx.closePath();
    editorCtx.fill();

    // draw vertex indicators at corners
    editorCtx.fillStyle = '#00ff00';
    const vertexRadius = 5 / zoom;
    [
      { x: p1x, y: p1y },
      { x: p2x, y: p2y },
      { x: p3x, y: p3y },
      { x: p4x, y: p4y }
    ].forEach(vertex => {
      editorCtx.beginPath();
      editorCtx.arc(vertex.x, -vertex.y, vertexRadius, 0, 2 * Math.PI);
      editorCtx.fill();
    });

    // draw center line with dashed stroke
    editorCtx.strokeStyle = '#00ff00';
    editorCtx.lineWidth = 3 / zoom;
    editorCtx.setLineDash([5 / zoom, 5 / zoom]);

    editorCtx.beginPath();
    editorCtx.moveTo(checkpointStartPoint.x, -checkpointStartPoint.y);
    editorCtx.lineTo(mousePos.x, -mousePos.y);
    editorCtx.stroke();

    editorCtx.setLineDash([]);
  }
  
  editorCtx.fillStyle = '#00ff00';
  editorCtx.beginPath();
  editorCtx.arc(checkpointStartPoint.x, -checkpointStartPoint.y, 4 / zoom, 0, 2 * Math.PI);
  editorCtx.fill();
  
  editorCtx.beginPath();
  editorCtx.arc(mousePos.x, -mousePos.y, 4 / zoom, 0, 2 * Math.PI);
  editorCtx.fill();
}

function drawNewDynamic() {
  if (newDynamicVertices.length === 0) return;

  // Draw filled preview if we have 3 or more vertices
  if (newDynamicVertices.length >= 3) {
    editorCtx.fillStyle = 'rgba(139, 69, 19, 0.4)';
    editorCtx.beginPath();
    editorCtx.moveTo(newDynamicVertices[0].x, -newDynamicVertices[0].y);
    for (let i = 1; i < newDynamicVertices.length; i++) {
      editorCtx.lineTo(newDynamicVertices[i].x, -newDynamicVertices[i].y);
    }
    editorCtx.closePath();
    editorCtx.fill('evenodd');
  }

  editorCtx.strokeStyle = '#8b4513';
  editorCtx.lineWidth = 2 / zoom;
  editorCtx.setLineDash([3 / zoom, 3 / zoom]);

  editorCtx.beginPath();
  editorCtx.moveTo(newDynamicVertices[0].x, -newDynamicVertices[0].y);
  for (let i = 1; i < newDynamicVertices.length; i++) {
    editorCtx.lineTo(newDynamicVertices[i].x, -newDynamicVertices[i].y);
  }

  // Draw preview line to close the shape if we have enough vertices
  if (newDynamicVertices.length >= 2) {
    const mousePos = getMouseCanvasPos();
    if (mousePos) {
      editorCtx.lineTo(mousePos.x, -mousePos.y);
      // Show closing line to first vertex
      if (newDynamicVertices.length >= 3) {
        editorCtx.lineTo(newDynamicVertices[0].x, -newDynamicVertices[0].y);
      }
    }
  }

  editorCtx.stroke();
  editorCtx.setLineDash([]);

  // Draw vertices being created
  drawVertices(newDynamicVertices, '#8b4513');
}

// Preset preview drawing functions
function drawCirclePreview() {
  if (!lastMousePos || !presetStartPoint) return;
  
  const mousePos = getMousePos({ clientX: lastMousePos.x, clientY: lastMousePos.y });
  const radius = Math.sqrt(
    Math.pow(mousePos.x - presetStartPoint.x, 2) + 
    Math.pow(mousePos.y - presetStartPoint.y, 2)
  );
  
  editorCtx.strokeStyle = '#00ff00';
  editorCtx.fillStyle = 'rgba(0, 255, 0, 0.2)';
  editorCtx.lineWidth = 2 / zoom;
  editorCtx.setLineDash([5 / zoom, 5 / zoom]);
  
  editorCtx.beginPath();
  editorCtx.arc(presetStartPoint.x, -presetStartPoint.y, radius, 0, 2 * Math.PI);
  editorCtx.fill();
  editorCtx.stroke();
  editorCtx.setLineDash([]);
  
  editorCtx.fillStyle = '#00ff00';
  editorCtx.beginPath();
  editorCtx.arc(presetStartPoint.x, -presetStartPoint.y, 3 / zoom, 0, 2 * Math.PI);
  editorCtx.fill();
  
  editorCtx.strokeStyle = '#00ff00';
  editorCtx.lineWidth = 1 / zoom;
  editorCtx.beginPath();
  editorCtx.moveTo(presetStartPoint.x, -presetStartPoint.y);
  editorCtx.lineTo(mousePos.x, -mousePos.y);
  editorCtx.stroke();
  
  editorCtx.fillStyle = '#00ff00';
  editorCtx.font = `${12 / zoom}px Arial`;
  editorCtx.textAlign = 'center';
  editorCtx.fillText(`r: ${radius.toFixed(0)}`, presetStartPoint.x, -(presetStartPoint.y - 15 / zoom));
}

function drawRectanglePreview() {
  if (!lastMousePos || !presetStartPoint) return;
  
  const mousePos = getMousePos({ clientX: lastMousePos.x, clientY: lastMousePos.y });
  const minX = Math.min(presetStartPoint.x, mousePos.x);
  const maxX = Math.max(presetStartPoint.x, mousePos.x);
  const minY = Math.min(presetStartPoint.y, mousePos.y);
  const maxY = Math.max(presetStartPoint.y, mousePos.y);
  const width = maxX - minX;
  const height = maxY - minY;
  
  editorCtx.strokeStyle = '#00ff00';
  editorCtx.fillStyle = 'rgba(0, 255, 0, 0.2)';
  editorCtx.lineWidth = 2 / zoom;
  editorCtx.setLineDash([5 / zoom, 5 / zoom]);
  
  editorCtx.beginPath();
  editorCtx.rect(minX, -maxY, width, height);
  editorCtx.fill();
  editorCtx.stroke();
  editorCtx.setLineDash([]);
  
  editorCtx.fillStyle = '#00ff00';
  editorCtx.font = `${12 / zoom}px Arial`;
  editorCtx.textAlign = 'center';
  const dimensionsText = `${width.toFixed(0)} × ${height.toFixed(0)}`;
  editorCtx.fillText(dimensionsText, (minX + maxX) / 2, -((minY + maxY) / 2 - 15 / zoom));
}

function drawTrianglePreview() {
  if (!lastMousePos || !presetStartPoint) return;
  
  const mousePos = getMousePos({ clientX: lastMousePos.x, clientY: lastMousePos.y });
  const radius = Math.sqrt(
    Math.pow(mousePos.x - presetStartPoint.x, 2) + 
    Math.pow(mousePos.y - presetStartPoint.y, 2)
  );
  
  const vertices = [];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * 2 * Math.PI - Math.PI / 2; // Start from top
    vertices.push({
      x: presetStartPoint.x + Math.cos(angle) * radius,
      y: presetStartPoint.y + Math.sin(angle) * radius
    });
  }
  
  editorCtx.strokeStyle = '#00ff00';
  editorCtx.fillStyle = 'rgba(0, 255, 0, 0.2)';
  editorCtx.lineWidth = 2 / zoom;
  editorCtx.setLineDash([5 / zoom, 5 / zoom]);
  
  editorCtx.beginPath();
  editorCtx.moveTo(vertices[0].x, -vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    editorCtx.lineTo(vertices[i].x, -vertices[i].y);
  }
  editorCtx.closePath();
  editorCtx.fill();
  editorCtx.stroke();
  editorCtx.setLineDash([]);
  
  editorCtx.fillStyle = '#00ff00';
  editorCtx.beginPath();
  editorCtx.arc(presetStartPoint.x, -presetStartPoint.y, 3 / zoom, 0, 2 * Math.PI);
  editorCtx.fill();
  
  editorCtx.fillStyle = '#00ff00';
  editorCtx.font = `${12 / zoom}px Arial`;
  editorCtx.textAlign = 'center';
  editorCtx.fillText(`r: ${radius.toFixed(0)}`, presetStartPoint.x, -(presetStartPoint.y - 15 / zoom));
}

function drawNewAreaEffect() {
  editorCtx.fillStyle = 'rgba(173, 216, 230, 0.5)';
  editorCtx.strokeStyle = '#add8e6';
  editorCtx.lineWidth = 2 / zoom;
  editorCtx.setLineDash([3 / zoom, 3 / zoom]);
  
  if (areaEffectVertices.length > 2) {
    editorCtx.beginPath();
    editorCtx.moveTo(areaEffectVertices[0].x, -areaEffectVertices[0].y);
    for (let i = 1; i < areaEffectVertices.length; i++) {
      editorCtx.lineTo(areaEffectVertices[i].x, -areaEffectVertices[i].y);
    }
    editorCtx.closePath();
    editorCtx.fill('evenodd');
    editorCtx.stroke();
  } else {
    editorCtx.beginPath();
    editorCtx.moveTo(areaEffectVertices[0].x, -areaEffectVertices[0].y);
    for (let i = 1; i < areaEffectVertices.length; i++) {
      editorCtx.lineTo(areaEffectVertices[i].x, -areaEffectVertices[i].y);
    }
    editorCtx.stroke();
  }
  
  editorCtx.setLineDash([]);
  
  drawVertices(areaEffectVertices, '#add8e6');
}

function updatePropertiesPanel() {
  const panel = document.getElementById('propertiesPanel');
  
  if (selectedObjects.length === 0) {
    panel.innerHTML = '<p>Select an object to edit properties</p>';
    return;
  } else if (selectedObjects.length > 1) {
    panel.innerHTML = `
      <div class="property-form">
        <h4>Multiple Objects Selected (${selectedObjects.length})</h4>
        <p>Select a single object to edit properties</p>
        
        <div class="alignment-tools">
          <h5>Alignment</h5>
          <div class="alignment-buttons">
            <button onclick="alignSelectedObjects('left')" title="Align Left">←</button>
            <button onclick="alignSelectedObjects('centerH')" title="Center Horizontal">⊙</button>
            <button onclick="alignSelectedObjects('right')" title="Align Right">→</button>
          </div>
          <div class="alignment-buttons">
            <button onclick="alignSelectedObjects('top')" title="Align Top">↑</button>
            <button onclick="alignSelectedObjects('centerV')" title="Center Vertical">⊕</button>
            <button onclick="alignSelectedObjects('bottom')" title="Align Bottom">↓</button>
          </div>
          <div class="alignment-buttons">
            <button onclick="alignToGrid()" title="Align to Grid">⊞</button>
          </div>
        </div>
        
        <div class="layer-tools">
          <h5>Layer Order</h5>
          <div class="layer-buttons">
            <button onclick="moveToFront()" title="Bring to Front">⬆⬆</button>
            <button onclick="moveUp()" title="Move Up">⬆</button>
            <button onclick="moveDown()" title="Move Down">⬇</button>
            <button onclick="moveToBack()" title="Send to Back">⬇⬇</button>
          </div>
        </div>
        
        <button onclick="deleteSelectedObjects()" class="delete-btn">Delete Selected</button>
      </div>
    `;
    return;
  }
  
  // Single selection - use existing logic
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

function buildShapeProperties(shape, index) {
  let html = '';

  html += createColorInput('Fill Color', shape.fillColor, `shape_fillColor_${index}`);

  // Initialize fill collision if missing (default: false for backward compatibility)
  if (shape.fillCollision === undefined) {
    shape.fillCollision = false;
  }
  html += createCheckboxInput('Fill Collision', shape.fillCollision, `shape_fillCollision_${index}`);

  // Initialize border properties if missing
  if (!shape.borderColors) {
    shape.borderColors = [];
  }
  if (shape.borderWidth === undefined) {
    shape.borderWidth = 0;
  }
  // Initialize border collision if missing (default: true for backward compatibility)
  if (shape.borderCollision === undefined) {
    shape.borderCollision = true;
  }

  const borderEnabled = shape.borderWidth > 0 && shape.borderColors.length > 0;
  const borderMode = shape.borderColors.length === 1 ? 'single' : 'dual';

  html += '<div class="property-group"><h5>Border</h5>';
  html += createCheckboxInput('Border Enabled', borderEnabled, `shape_borderEnabled_${index}`);

  if (borderEnabled) {
    html += createCheckboxInput('Border Collision', shape.borderCollision, `shape_borderCollision_${index}`);
    html += createSelectInput('Border Mode', borderMode, `shape_borderMode_${index}`, [
      { value: 'single', label: 'Single Color' },
      { value: 'dual', label: 'Dual Color' }
    ]);

    if (borderMode === 'single') {
      html += createColorInput('Border Color', hexToRgb(shape.borderColors[0] || '#ff4d4d'), `shape_borderColor_${index}_0`);
    } else {
      html += createColorInput('Border Color 1', hexToRgb(shape.borderColors[0] || '#ff4d4d'), `shape_borderColor_${index}_0`);
      html += createColorInput('Border Color 2', hexToRgb(shape.borderColors[1] || '#ffffff'), `shape_borderColor_${index}_1`);
    }

    html += createNumberInput('Border Width', shape.borderWidth, `shape_borderWidth_${index}`, 0, 100, 1);
  }

  html += '</div>';

  return html;
}

function buildDynamicObjectProperties(obj, index) {
  let html = '';

  html += createTextInput('ID', obj.id, `dynamic_id_${index}`, 'Object identifier');

  // Initialize collision if missing (default: true for backward compatibility)
  if (obj.collision === undefined) {
    obj.collision = true;
  }

  html += '<div class="property-group"><h5>Physics</h5>';
  html += createCheckboxInput('Collision Enabled', obj.collision, `dynamic_collision_${index}`);
  html += createCheckboxInput('Static', obj.isStatic, `dynamic_isStatic_${index}`);
  html += createSliderInput('Density', obj.density, `dynamic_density_${index}`, 0, 5, 0.01);
  html += createSliderInput('Friction', obj.friction, `dynamic_friction_${index}`, 0, 2, 0.01);
  html += createSliderInput('Air Friction', obj.frictionAir, `dynamic_frictionAir_${index}`, 0, 1, 0.01);
  html += createSliderInput('Restitution', obj.restitution, `dynamic_restitution_${index}`, 0, 2, 0.01);
  html += createSliderInput('Damage Scale', obj.damageScale, `dynamic_damageScale_${index}`, 0, 5, 0.01);
  html += '</div>';
  
  html += '<div class="property-group"><h5>Appearance</h5>';
  html += createColorInput('Fill Color', obj.fillColor, `dynamic_fillColor_${index}`);
  html += createColorInput('Stroke Color', obj.strokeColor, `dynamic_strokeColor_${index}`);
  html += createNumberInput('Stroke Width', obj.strokeWidth, `dynamic_strokeWidth_${index}`, 0, 20, 1);
  html += '</div>';

  html += '<div class="property-group"><h5>Axis/Pivot Point</h5>';
  if (obj.axis) {
    html += `<p class="property-info" style="color: #aaa; font-size: 0.9em; margin: 5px 0;">Pivot at (${obj.axis.x.toFixed(1)}, ${obj.axis.y.toFixed(1)})</p>`;
    html += createSliderInput('Damping', obj.axis.damping || 0.1, `dynamic_axisDamping_${index}`, 0, 1, 0.01);
    html += createSliderInput('Stiffness', obj.axis.stiffness || 1, `dynamic_axisStiffness_${index}`, 0, 1, 0.01);
    html += createSliderInput('Motor Speed', obj.axis.motorSpeed || 0, `dynamic_axisMotorSpeed_${index}`, -100, 100, 1);
    html += '<p class="property-info" style="color: #888; font-size: 0.85em; margin: 2px 0 8px 0; font-style: italic;">Negative = counter-clockwise, Positive = clockwise, 0 = off</p>';
    html += `<button onclick="removeAxis(${index})" class="delete-btn" style="background: #c44; color: #fff; border: none; padding: 6px 12px; margin-top: 8px; border-radius: 4px; cursor: pointer;">Remove Axis</button>`;
  } else {
    html += '<p class="property-info" style="color: #aaa; font-size: 0.9em; margin: 5px 0;">No pivot point set. Use Axis tool to add.</p>';
  }
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
    { value: 'lava', label: 'Lava (Damage Over Time)' },
    { value: 'boost', label: 'Boost (Speed Up)' },
    { value: 'slow', label: 'Slow Zone (Reduce Speed)' }
  ];
  html += createSelectInput('Effect Type', area.effect, `area_effect_${index}`, effectOptions);
  
  // Adjust slider range based on effect type
  let maxStrength = 2;
  let step = 0.01;
  if (area.effect === 'boost') {
    maxStrength = 5; // Boost can be up to 5x acceleration
    step = 0.1;
  } else if (area.effect === 'slow') {
    maxStrength = 1; // Slow is percentage reduction (0-1)
    step = 0.05;
  } else if (area.effect === 'lava') {
    maxStrength = 50; // Lava damage per second
    step = 1;
  }
  
  html += createSliderInput('Strength', area.strength, `area_strength_${index}`, 0, maxStrength, step);
  
  let helpText = '';
  switch (area.effect) {
    case 'ice':
      helpText = 'Reduces car friction. 0.5 = half friction, 1.0 = no friction';
      break;
    case 'lava':
      helpText = 'Damage per second. 10 = moderate damage, 25+ = high damage';
      break;
    case 'boost':
      helpText = 'Acceleration multiplier. 2.0 = double speed, 3.0 = triple speed';
      break;
    case 'slow':
      helpText = 'Speed reduction. 0.5 = half speed, 0.8 = very slow';
      break;
  }
  
  if (helpText) {
    html += `<div class="property-help">${helpText}</div>`;
  }
  
  html += createColorInput('Fill Color', area.fillColor, `area_fillColor_${index}`);
  
  return html;
}

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

function attachPropertyEventListeners() {
  document.querySelectorAll('.color-input').forEach(input => {
    input.addEventListener('input', handleColorChange);
  });
  
  document.querySelectorAll('.property-input[type="number"]').forEach(input => {
    input.addEventListener('input', handleNumberChange);
  });
  
  document.querySelectorAll('.property-input[type="text"]').forEach(input => {
    input.addEventListener('input', handleTextChange);
  });
  
  document.querySelectorAll('.property-checkbox').forEach(input => {
    input.addEventListener('change', handleCheckboxChange);
  });
  
  document.querySelectorAll('.property-input[type=""], .property-input:not([type])').forEach(input => {
    if (input.tagName === 'SELECT') {
      input.addEventListener('change', handleSelectChange);
    }
  });
  
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

  // Special handling for border enabled checkbox
  if (property === 'borderEnabled') {
    if (value) {
      // Enable border: set default values if not already set
      if (!objectData.borderColors || objectData.borderColors.length === 0) {
        objectData.borderColors = ['#ff4d4d', '#ffffff'];
      }
      if (!objectData.borderWidth || objectData.borderWidth === 0) {
        objectData.borderWidth = 20;
      }
    } else {
      // Disable border: set width to 0
      objectData.borderWidth = 0;
    }
    updateMapAndRender();
    updatePropertiesPanel();
    return;
  }

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

  // Special handling for border mode dropdown
  if (property === 'borderMode') {
    if (value === 'single') {
      // Switch to single color: keep only first color
      if (objectData.borderColors && objectData.borderColors.length > 0) {
        objectData.borderColors = [objectData.borderColors[0]];
      } else {
        objectData.borderColors = ['#ff4d4d'];
      }
    } else if (value === 'dual') {
      // Switch to dual color: add second color if missing
      if (!objectData.borderColors || objectData.borderColors.length === 0) {
        objectData.borderColors = ['#ff4d4d', '#ffffff'];
      } else if (objectData.borderColors.length === 1) {
        objectData.borderColors.push('#ffffff');
      }
    }
    updateMapAndRender();
    updatePropertiesPanel();
    return;
  }

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

  if (property === 'axisDamping' || property === 'axisStiffness' || property === 'axisMotorSpeed') {
    if (!objectData.axis) {
      objectData.axis = {};
    }
    let axisProp;
    if (property === 'axisDamping') {
      axisProp = 'damping';
    } else if (property === 'axisStiffness') {
      axisProp = 'stiffness';
    } else if (property === 'axisMotorSpeed') {
      axisProp = 'motorSpeed';
    }
    objectData.axis[axisProp] = value;
  } else {
    objectData[property] = value;
  }

  const valueDisplay = document.getElementById(`${input.id}_value`);
  if (valueDisplay) {
    valueDisplay.textContent = value.toFixed(2);
  }

  updateMapAndRender();
}

function updateMapAndRender() {
  renderEditor();
}

// Drag and drop state
let draggedItem = null;

function handleDragStart(e, type, index) {
  draggedItem = { type, index };
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e, type, index) {
  e.preventDefault();

  // Only allow drop if same type
  if (draggedItem && draggedItem.type === type) {
    e.dataTransfer.dropEffect = 'move';
    e.target.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  e.target.classList.remove('drag-over');
}

function handleDrop(e, targetType, targetIndex) {
  e.preventDefault();
  e.target.classList.remove('drag-over');

  // Only process if same type and different index
  if (draggedItem && draggedItem.type === targetType && draggedItem.index !== targetIndex) {
    saveToHistory();

    const array = getObjectArray(targetType);
    if (!array) return;

    // Remove from old position
    const item = array.splice(draggedItem.index, 1)[0];

    // Insert at new position
    // If moving down, target index needs adjustment
    const newIndex = draggedItem.index < targetIndex ? targetIndex : targetIndex;
    array.splice(newIndex, 0, item);

    // Update selection if the dragged item was selected
    if (selectedObject?.type === targetType && selectedObject?.index === draggedItem.index) {
      selectedObject.index = newIndex;
    }

    updateLayersPanel();
    renderEditor();
  }

  draggedItem = null;
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedItem = null;

  // Clean up any remaining drag-over classes
  document.querySelectorAll('.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
}

function updateLayersPanel() {
  const panel = document.getElementById('layersPanel');
  let html = '';

  if (editorMap) {
    if (editorMap.shapes) {
      editorMap.shapes.forEach((shape, i) => {
        const isSelected = selectedObject?.type === 'shape' && selectedObject?.index === i;
        html += `<div class="layer-item ${isSelected ? 'selected' : ''}"
          draggable="true"
          data-type="shape"
          data-index="${i}"
          onclick="selectObject('shape', ${i})"
          ondragstart="handleDragStart(event, 'shape', ${i})"
          ondragover="handleDragOver(event, 'shape', ${i})"
          ondragleave="handleDragLeave(event)"
          ondrop="handleDrop(event, 'shape', ${i})"
          ondragend="handleDragEnd(event)">
          Shape ${i + 1}
        </div>`;
      });
    }

    if (editorMap.checkpoints) {
      editorMap.checkpoints.forEach((checkpoint, i) => {
        const isSelected = selectedObject?.type === 'checkpoint' && selectedObject?.index === i;
        html += `<div class="layer-item ${isSelected ? 'selected' : ''}"
          draggable="true"
          data-type="checkpoint"
          data-index="${i}"
          onclick="selectObject('checkpoint', ${i})"
          ondragstart="handleDragStart(event, 'checkpoint', ${i})"
          ondragover="handleDragOver(event, 'checkpoint', ${i})"
          ondragleave="handleDragLeave(event)"
          ondrop="handleDrop(event, 'checkpoint', ${i})"
          ondragend="handleDragEnd(event)">
          ${checkpoint.id || `Checkpoint ${i + 1}`}
        </div>`;
      });
    }

    if (editorMap.areaEffects) {
      editorMap.areaEffects.forEach((area, i) => {
        const isSelected = selectedObject?.type === 'areaEffect' && selectedObject?.index === i;
        html += `<div class="layer-item ${isSelected ? 'selected' : ''}"
          draggable="true"
          data-type="areaEffect"
          data-index="${i}"
          onclick="selectObject('areaEffect', ${i})"
          ondragstart="handleDragStart(event, 'areaEffect', ${i})"
          ondragover="handleDragOver(event, 'areaEffect', ${i})"
          ondragleave="handleDragLeave(event)"
          ondrop="handleDrop(event, 'areaEffect', ${i})"
          ondragend="handleDragEnd(event)">
          Area Effect ${i + 1}
        </div>`;
      });
    }

    if (editorMap.dynamicObjects) {
      editorMap.dynamicObjects.forEach((obj, i) => {
        const isSelected = selectedObject?.type === 'dynamicObject' && selectedObject?.index === i;
        html += `<div class="layer-item ${isSelected ? 'selected' : ''}"
          draggable="true"
          data-type="dynamicObject"
          data-index="${i}"
          onclick="selectObject('dynamicObject', ${i})"
          ondragstart="handleDragStart(event, 'dynamicObject', ${i})"
          ondragover="handleDragOver(event, 'dynamicObject', ${i})"
          ondragleave="handleDragLeave(event)"
          ondrop="handleDrop(event, 'dynamicObject', ${i})"
          ondragend="handleDragEnd(event)">
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

function createNewMap() {
  editorMap = {
    "id": generateUUID(),
    "displayName": "New Map",
    "scale": { 
      "player": 0.002, 
      "spectator": 0.0005 
    },
    "start": {
      "type": "polygon",
      "vertices": [
        { "x": -50, "y": -10 },
        { "x": 50, "y": -10 },
        { "x": 50, "y": 10 },
        { "x": -50, "y": 10 }
      ]
    },
    "shapes": [],
    "checkpoints": [], 
    "areaEffects": [],
    "dynamicObjects": []
  };
  
  console.log('New map created with UUID:', editorMap.id);
  
  currentMapInfo = { 
    key: null, 
    name: "New Map", 
    directory: null, 
    isNew: true 
  };
  
  historyStack = [JSON.parse(JSON.stringify(editorMap))];
  historyIndex = 0;
  
  updateUI();
  renderEditor();
}

function loadMap(key) {
  // Parse category/key format and construct proper URL
  let url;
  if (key.includes('/')) {
    // Key is in format "category/mapname", split it for the URL
    url = `/api/maps/${key}`;
  } else {
    // Key is just the map name, assume official category
    url = `/api/maps/official/${key}`;
  }
  
  fetch(url)
    .then(res => res.json())
    .then(map => {
      if (!map.id) {
        map.id = generateUUID();
        console.log('Generated UUID for existing map:', map.id);
      }
      
      editorMap = map;
      currentMapInfo = {
        key: key,
        name: map.displayName || key.split('/').pop().replace('.json', ''),
        directory: key.split('/')[0],
        isNew: false,
      };
      
      console.log('Map loaded successfully. currentMapInfo set to:', currentMapInfo);
      console.log('Map UUID:', editorMap.id);
      
      historyStack = [JSON.parse(JSON.stringify(editorMap))];
      historyIndex = 0;
      
      updateUI();
      renderEditor();
    })
    .catch(error => {
      console.error('Error loading map:', error);
    });
}

function saveMap() {
  if (currentMapInfo.isNew || !currentMapInfo.name) {
    saveMapAs();
  } else {
    executeSave(currentMapInfo.name, currentMapInfo.directory, editorMap.author, currentMapInfo.key);
  }
}

function saveMapAs() {
  showSaveMapModal();
}

let saveModalHandleEnter = null;

function showSaveMapModal() {
  const modal = document.getElementById('saveMapModal');
  const mapNameInput = document.getElementById('saveMapName');
  const authorInput = document.getElementById('saveMapAuthor');
  
  mapNameInput.value = currentMapInfo.isNew ? '' : currentMapInfo.name;
  authorInput.value = editorMap.author || 'Bradzie';
  if (currentMapInfo.directory === 'official') {
    document.getElementById('saveOfficial').checked = true;
  } else {
    document.getElementById('saveCommunity').checked = true;
  }
  
  modal.classList.remove('hidden');
  mapNameInput.focus();
  
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
  
  if (saveModalHandleEnter) {
    const mapNameInput = document.getElementById('saveMapName');
    const authorInput = document.getElementById('saveMapAuthor');
    mapNameInput.removeEventListener('keydown', saveModalHandleEnter);
    authorInput.removeEventListener('keydown', saveModalHandleEnter);
    saveModalHandleEnter = null;
  }
}

function confirmSaveMap() {
  const mapName = document.getElementById('saveMapName').value.trim();
  const author = document.getElementById('saveMapAuthor').value.trim();
  const directory = document.querySelector('input[name="saveDirectory"]:checked').value;
  const generatePreview = document.getElementById('generatePreviewOnSave').checked;
  executeSave(mapName, directory, author, null, generatePreview);
}

async function generatePreviewImageInternal() {
  if (!editorMap || !editorCanvas) {
    throw new Error('No map loaded to generate preview from');
  }

  const previewCanvas = document.createElement('canvas');
  const previewCtx = previewCanvas.getContext('2d');
  
  previewCanvas.width = 300;
  previewCanvas.height = 200;
  
  const originalPan = { x: panX, y: panY };
  const originalZoom = zoom;
  const originalShowGrid = showGrid;
  const originalSelected = [...selectedObjects];
  const originalHovered = hoveredObject;
  const originalHoveredVertex = hoveredVertex;
  const originalHoveredEdge = hoveredEdge;
  
  const bounds = calculateMapBounds();
  if (!bounds) {
    throw new Error('No content found to preview');
  }
  
  try {
    // Clear selection and hover states for clean preview
    selectedObjects.length = 0;
    hoveredObject = null;
    hoveredVertex = null;
    hoveredEdge = null;
    showGrid = false;
    
    setupPreviewViewport(bounds, previewCanvas);
    
    renderPreview(previewCtx, previewCanvas, bounds);
    
    // Convert to blob and save
    return new Promise((resolve, reject) => {
      previewCanvas.toBlob(async (blob) => {
        try {
          const result = await savePreviewImage(blob);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, 'image/png', 0.9);
    });
  } finally {
    // Restore original editor state
    restoreEditorState(originalPan, originalZoom, originalShowGrid, originalSelected, originalHovered, originalHoveredVertex, originalHoveredEdge);
  }
}

async function generatePreviewImage() {
  try {
    await generatePreviewImageInternal();
    alert('Preview image generated successfully!');
  } catch (error) {
    console.error('Failed to generate preview:', error);
    alert('Failed to generate preview image: ' + error.message);
  }
}

function calculateMapBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasContent = false;

  if (editorMap.shapes && Array.isArray(editorMap.shapes)) {
    editorMap.shapes.forEach(shape => {
      if (shape.vertices && Array.isArray(shape.vertices)) {
        shape.vertices.forEach(vertex => {
          minX = Math.min(minX, vertex.x);
          minY = Math.min(minY, vertex.y);
          maxX = Math.max(maxX, vertex.x);
          maxY = Math.max(maxY, vertex.y);
          hasContent = true;
        });
      }
    });
  }

  if (editorMap.checkpoints && Array.isArray(editorMap.checkpoints)) {
    editorMap.checkpoints.forEach(checkpoint => {
      if (checkpoint.vertices && Array.isArray(checkpoint.vertices)) {
        checkpoint.vertices.forEach(vertex => {
          minX = Math.min(minX, vertex.x);
          minY = Math.min(minY, vertex.y);
          maxX = Math.max(maxX, vertex.x);
          maxY = Math.max(maxY, vertex.y);
          hasContent = true;
        });
      }
    });
  }

  if (editorMap.dynamicObjects && Array.isArray(editorMap.dynamicObjects)) {
    editorMap.dynamicObjects.forEach(obj => {
      if (obj.vertices && Array.isArray(obj.vertices)) {
        obj.vertices.forEach(vertex => {
          minX = Math.min(minX, vertex.x);
          minY = Math.min(minY, vertex.y);
          maxX = Math.max(maxX, vertex.x);
          maxY = Math.max(maxY, vertex.y);
          hasContent = true;
        });
      }
    });
  }

  if (editorMap.areaEffects && Array.isArray(editorMap.areaEffects)) {
    editorMap.areaEffects.forEach(area => {
      if (area.vertices && Array.isArray(area.vertices)) {
        area.vertices.forEach(vertex => {
          minX = Math.min(minX, vertex.x);
          minY = Math.min(minY, vertex.y);
          maxX = Math.max(maxX, vertex.x);
          maxY = Math.max(maxY, vertex.y);
          hasContent = true;
        });
      }
    });
  }

  if (editorMap.start && editorMap.start.vertices && Array.isArray(editorMap.start.vertices)) {
    editorMap.start.vertices.forEach(vertex => {
      minX = Math.min(minX, vertex.x);
      minY = Math.min(minY, vertex.y);
      maxX = Math.max(maxX, vertex.x);
      maxY = Math.max(maxY, vertex.y);
      hasContent = true;
    });
  }

  if (!hasContent) return null;

  const padding = Math.max((maxX - minX) * 0.1, (maxY - minY) * 0.1, 50);
  
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
    width: (maxX - minX) + 2 * padding,
    height: (maxY - minY) + 2 * padding
  };
}

function setupPreviewViewport(bounds, previewCanvas) {
  const scaleX = previewCanvas.width / bounds.width;
  const scaleY = previewCanvas.height / bounds.height;
  zoom = Math.min(scaleX, scaleY) * 0.9; // Leave some margin

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  
  panX = -centerX * zoom;
  panY = -centerY * zoom;
}

function renderPreview(previewCtx, previewCanvas, bounds) {
  // Clear canvas with dark background
  previewCtx.fillStyle = '#1a1a1a';
  previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
  
  previewCtx.save();
  previewCtx.translate(previewCanvas.width / 2 + panX, previewCanvas.height / 2 + panY);
  previewCtx.scale(zoom, zoom);

  // Temporarily swap contexts to render preview
  const originalCtx = editorCtx;
  editorCtx = previewCtx;
  
  try {
    if (Array.isArray(editorMap.shapes)) {
      editorMap.shapes.forEach(shape => {
        drawShape(shape, false, false);
      });
    }

    if (Array.isArray(editorMap.checkpoints)) {
      editorMap.checkpoints.forEach(checkpoint => {
        drawCheckpoint(checkpoint, false, false);
      });
    }

    if (Array.isArray(editorMap.areaEffects)) {
      editorMap.areaEffects.forEach(area => {
        drawAreaEffect(area, false, false);
      });
    }

    if (Array.isArray(editorMap.dynamicObjects)) {
      editorMap.dynamicObjects.forEach(obj => {
        drawDynamicObject(obj, false, false);
      });
    }

    if (editorMap.start && Array.isArray(editorMap.start.vertices)) {
      drawStartArea(editorMap.start, false, false);
    }
  } finally {
    editorCtx = originalCtx;
    previewCtx.restore();
  }
}

function restoreEditorState(originalPan, originalZoom, originalShowGrid, originalSelected, originalHovered, originalHoveredVertex, originalHoveredEdge) {
  panX = originalPan.x;
  panY = originalPan.y;
  zoom = originalZoom;
  showGrid = originalShowGrid;
  selectedObjects.splice(0, selectedObjects.length, ...originalSelected);
  hoveredObject = originalHovered;
  hoveredVertex = originalHoveredVertex;
  hoveredEdge = originalHoveredEdge;
  
  renderEditor(); // Re-render with restored state
}

async function savePreviewImage(blob) {
  console.log('savePreviewImage called with currentMapInfo:', currentMapInfo);
  console.log('editorMap.id:', editorMap?.id);
  
  if (!editorMap?.id) {
    throw new Error('No map UUID available. Please save the map first, or if you loaded an existing map, try reloading it.');
  }

  const formData = new FormData();
  formData.append('preview', blob, 'preview.png');
  formData.append('mapId', editorMap.id);

  console.log('Sending preview with mapId (UUID):', editorMap.id);

  const response = await fetch('/api/maps/preview', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to save preview');
  }
  
  console.log('Preview saved successfully:', result);
  return result;
}

async function executeSave(mapName, directory, author, key = null, generatePreview = false) {
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
    if (!editorMap.id) {
      editorMap.id = generateUUID();
      console.log('Generated UUID for map being saved:', editorMap.id);
    }
    
    const enhancedMapData = {
      ...editorMap,
      displayName: mapName,
      author: author,
      created_at: editorMap.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const payload = { 
      name: mapName,
      directory: directory,
      mapData: enhancedMapData 
    };

    if (key) {
      payload.key = key;
    }
    
    const response = await fetch('/api/maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (result.success) {
      currentMapInfo = {
        key: result.key,
        name: mapName,
        directory: directory,
        isNew: false,
      };
      
      // Generate preview image if requested
      if (generatePreview) {
        try {
          await generatePreviewImageInternal();
          alert(`Map saved successfully to ${directory} directory with preview image!`);
        } catch (previewError) {
          console.error('Preview generation failed:', previewError);
          alert(`Map saved successfully to ${directory} directory, but preview generation failed: ${previewError.message}`);
        }
      } else {
        alert(`Map saved successfully to ${directory} directory!`);
      }
      
      loadMapsList(result.key);
    } else {
      alert('Failed to save map: ' + result.error);
    }
  } catch (error) {
    console.error('Save map error:', error);
    alert('Failed to save map');
  }
}

function showBrowseModal() {
  const modal = document.getElementById('browseMapModal');
  modal.classList.remove('hidden');
  
  // Load and display maps
  fetch('/api/maps')
    .then(res => res.json())
    .then(maps => {
      displayMapsInBrowser(maps);
    })
    .catch(error => {
      console.error('Error loading maps:', error);
      document.getElementById('mapsGrid').innerHTML = '<p>Error loading maps</p>';
    });
}

function hideBrowseModal() {
  document.getElementById('browseMapModal').classList.add('hidden');
}

function showEditorOptionsModal() {
  const modal = document.getElementById('editorOptionsModal');
  modal.classList.remove('hidden');
}

function closeEditorOptionsModal() {
  const modal = document.getElementById('editorOptionsModal');
  modal.classList.add('hidden');
}

function displayMapsInBrowser(maps) {
  const grid = document.getElementById('mapsGrid');
  
  grid.innerHTML = maps.map(map => {
    const author = map.key.includes('official/') ? 'Official' : 'Community';
    const category = map.category || author;
    
    // Check if preview image exists (use UUID if available, fallback to key)
    const previewImageUrl = map.id ? `/previews/${map.id}.png` : `/previews/${map.key.replace(/\//g, '_')}.png`;
    
    return `
      <div class="map-entry" data-map-key="${map.key}" onclick="selectMapFromBrowser('${map.key}')">
        <div class="map-preview">
          <img src="${previewImageUrl}" alt="${map.name} preview" class="preview-image" 
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="no-preview" style="display: none;">No preview</div>
        </div>
        <div class="map-info">
          <h4 class="map-name">${map.name}</h4>
          <p class="map-author">Author: ${author}</p>
          <p class="map-category">${category}</p>
        </div>
      </div>
    `;
  }).join('');
}

function selectMapFromBrowser(key) {
  hideBrowseModal();
  loadMap(key);
}

// Expose function globally for HTML onclick handlers
window.selectMapFromBrowser = selectMapFromBrowser;

function resizeEditorCanvas() {
  if (!editorCanvas) return;
  editorCanvas.width = window.innerWidth - 300; // Account for sidebar
  editorCanvas.height = window.innerHeight;
  renderEditor();
}

window.initMapEditor = initMapEditor;
function updateStatusBar() {
  const toolNameElement = document.getElementById('editorToolName');
  const hintElement = document.getElementById('editorHint');
  
  if (!toolNameElement || !hintElement) return;
  
  const toolNames = {
    'select': 'Select Tool',
    'createShape': 'Create Shape',
    'checkpoint': 'Create Checkpoint',
    'dynamic': 'Create Dynamic Object',
    'areaEffect': 'Create Area Effect',
    'axis': 'Add Pivot Point',
    'createCircle': 'Create Circle',
    'createRectangle': 'Create Rectangle',
    'createTriangle': 'Create Triangle'
  };

  const toolHints = {
    'select': 'Click to select objects, drag to move them. Ctrl+click for multi-select. Arrow keys to nudge.',
    'createShape': 'Click to add vertices, press Enter to complete the shape, Escape to cancel.',
    'checkpoint': 'Click two points to create a checkpoint line. Hold Shift to snap angles to 15 degree increments.',
    'dynamic': 'Click to add vertices, press Enter to complete the dynamic object, Escape to cancel.',
    'areaEffect': 'Click to add vertices, press Enter to complete the area effect, Escape to cancel.',
    'axis': 'Click on a dynamic object to set its pivot point. Adjust damping and stiffness in properties panel.',
    'createCircle': 'Click to set center, then click again to set radius.',
    'createRectangle': 'Click first corner, then click opposite corner.',
    'createTriangle': 'Click to set center, then click again to set size.'
  };
  
  toolNameElement.textContent = toolNames[currentTool] || 'Unknown Tool';
  hintElement.textContent = toolHints[currentTool] || '';
  
  if (creatingShape && newShapeVertices.length > 2) {
    hintElement.textContent = 'Press Enter to complete the shape, or Escape to cancel.';
  } else if (creatingAreaEffect && areaEffectVertices.length > 2) {
    hintElement.textContent = 'Press Enter to complete the area effect, or Escape to cancel.';
  } else if (creatingDynamic && newDynamicVertices.length > 2) {
    hintElement.textContent = 'Press Enter to complete the dynamic object, or Escape to cancel.';
  } else if (creatingCheckpoint && checkpointStartPoint) {
    hintElement.textContent = 'Click the second point to complete the checkpoint. Hold Shift to snap angle.';
  } else if (creatingCircle && presetStartPoint) {
    hintElement.textContent = 'Click to set the radius of the circle.';
  } else if (creatingRectangle && presetStartPoint) {
    hintElement.textContent = 'Click the opposite corner to complete the rectangle.';
  } else if (creatingTriangle && presetStartPoint) {
    hintElement.textContent = 'Click to set the size of the triangle.';
  }
}

function updateCoordinates(mousePos) {
  const coordsElement = document.getElementById('editorCoords');
  if (!coordsElement || !mousePos) return;
  
  const x = Math.round(mousePos.x);
  const y = Math.round(mousePos.y);
  coordsElement.textContent = `${x}, ${y}`;
}

// Nudge selected objects by small amounts using arrow keys
function nudgeSelectedObjects(deltaX, deltaY) {
  if (selectedObjects.length === 0) return;
  
  saveToHistory();
  
  selectedObjects.forEach(obj => {
    const objectData = getObjectData(obj);
    if (!objectData || !objectData.vertices) return;
    
    objectData.vertices.forEach(vertex => {
      vertex.x += deltaX;
      vertex.y += deltaY;
    });
    
    if (obj.type === 'dynamicObject' && objectData.position) {
      objectData.position.x += deltaX;
      objectData.position.y += deltaY;
    }
  });
  
  renderEditor();
  updatePropertiesPanel();
}

window.selectObject = selectObject;
window.closeSaveMapModal = closeSaveMapModal;
window.confirmSaveMap = confirmSaveMap;
window.deleteSelectedObjects = deleteSelectedObjects;
window.alignSelectedObjects = alignSelectedObjects;
window.alignToGrid = alignToGrid;
window.moveToFront = moveToFront;
window.moveToBack = moveToBack;
window.moveUp = moveUp;
window.moveDown = moveDown;
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.handleDragEnd = handleDragEnd;

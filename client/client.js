(() => {
  const socket = io();
  let currentMap = null;

  const menu = document.getElementById('menu');
  const joinButton = document.getElementById('joinButton');
  const nameInput = document.getElementById('nameInput');
  const carCard = document.getElementById('carCard');
  const switchButton = document.getElementById('switchButton');
  const gameCanvas = document.getElementById('gameCanvas');
  const hud = document.getElementById('hud');
  const lapsSpan = document.getElementById('laps');
  const upgradeCardsContainer = document.getElementById('upgradeCards');
  const messageDiv = document.getElementById('message');
  const abilityHud = document.getElementById('abilityHud');
  const abilityName = document.getElementById('abilityName');
  
  // Get references to lap counter and timer elements
  const lapCounter = document.getElementById('lapCounter');
  const lapTimer = document.getElementById('lapTimer');
  const currentLapTimeSpan = document.getElementById('currentLapTime');
  const bestLapTimeSpan = document.getElementById('bestLapTime');
  
  // Get kill feed element
  const killFeed = document.getElementById('killFeed');
  
  // Get spectator canvas
  const spectatorCanvas = document.getElementById('spectatorCanvas');
  const spectatorCtx = spectatorCanvas.getContext('2d');

  // Get references to template elements
  const loadingScreen = document.getElementById('loadingScreen');
  const disconnectionOverlay = document.getElementById('disconnectionOverlay');
  const menuDisconnectionWarning = document.getElementById('menuDisconnectionWarning');
  
  // Get settings elements
  const settingsButton = document.getElementById('settingsButton');
  const settingsModal = document.getElementById('settingsModal');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const fpsToggle = document.getElementById('fpsToggle');
  const pingToggle = document.getElementById('pingToggle');
  const performanceOverlay = document.getElementById('performanceOverlay');
  const fpsDisplay = document.getElementById('fpsDisplay');
  const pingDisplay = document.getElementById('pingDisplay');
  
  // Get references to car card template elements
  const carRadioInput = document.querySelector('input[name="car"]');
  const carName = document.getElementById('carName');
  const carPolygon = document.getElementById('carPolygon');
  const speedFill = document.getElementById('speedFill');
  const healthFill = document.getElementById('healthFill');
  const handlingFill = document.getElementById('handlingFill');
  
  // Add click handlers to refresh buttons
  document.getElementById('disconnectRefreshBtn').addEventListener('click', () => location.reload());
  document.getElementById('menuRefreshBtn').addEventListener('click', () => location.reload());

  // Settings event listeners
  settingsButton.addEventListener('click', openSettings);
  settingsCloseBtn.addEventListener('click', closeSettings);
  
  // Close settings when clicking outside modal
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettings();
    }
  });
  
  // Settings toggle handlers
  fpsToggle.addEventListener('change', (e) => {
    settings.showFPS = e.target.checked;
    saveSettings();
    updatePerformanceOverlay();
  });
  
  pingToggle.addEventListener('change', (e) => {
    settings.showPing = e.target.checked;
    saveSettings();
    updatePerformanceOverlay();
  });

  const ctx = gameCanvas.getContext('2d');
  let players = [];
  let mySocketId = null;
  let abilityObjects = [];
  
  // Interpolation state
  let gameStates = []; // Buffer of recent game states
  let interpolationDelay = 50; // ms behind server for smoother interpolation
  
  let inputState = { cursor: { x: 0, y: 0 } };
  let sendInputInterval = null;
  let hasReceivedFirstState = false; // Flag to prevent rendering before first server data
  
  // Connection monitoring
  let connectionLostTimeout = null;
  let lastServerMessage = Date.now();
  let currentCarIndex = 0;
  let carTypes = [];
  let CAR_TYPES = {};
  let myAbility = null;
  let lastAbilityUse = 0;
  
  // Lap timer state
  let currentLapStartTime = 0;
  let bestLapTime = null;
  let previousLapCount = 0;
  
  // Kill feed message management
  let killFeedMessages = [];
  let messageIdCounter = 0;
  
  // Spectator state management
  let spectatorState = null;
  let isSpectating = false;

  // Crashed car fade effect tracking
  let crashedCars = new Map(); // carId -> { car: carData, fadeStartTime: timestamp }
  let lastKnownPlayers = []; // Track previous players to detect crashes
  let playerCrashTime = null; // Track when the player themselves crashed
  const CRASH_FADE_DURATION = 500; // 500ms fade
  
  // Detect crashed cars and add them to fade queue
  function detectCrashedCars(currentPlayers) {
    const now = Date.now();
    const currentPlayerIds = new Set(currentPlayers.map(p => p.id));
    
    // Check if the player's own car just crashed
    const myPlayer = currentPlayers.find(p => p.socketId === mySocketId);
    if (myPlayer && myPlayer.crashed && !playerCrashTime) {
      playerCrashTime = now;
      console.log('Player crashed, starting fade timer');
    }
    
    // Find players that were in the last state but not in current state (crashed)
    for (const previousPlayer of lastKnownPlayers) {
      if (!currentPlayerIds.has(previousPlayer.id) && !crashedCars.has(previousPlayer.id)) {
        // Car crashed - add to fade queue
        crashedCars.set(previousPlayer.id, {
          car: previousPlayer,
          fadeStartTime: now
        });
      }
    }
    
    // Update last known players
    lastKnownPlayers = [...currentPlayers];
    
    // Clean up expired crashed cars
    for (const [carId, crashData] of crashedCars.entries()) {
      if (now - crashData.fadeStartTime > CRASH_FADE_DURATION) {
        crashedCars.delete(carId);
      }
    }
    
    // Handle player's own crash fade completion
    if (playerCrashTime && (now - playerCrashTime) > CRASH_FADE_DURATION) {
      returnToMenuAfterCrash();
    }
  }
  
  // Handle returning to menu after player crash fade
  function returnToMenuAfterCrash() {
    console.log('Crash fade completed, returning to menu');
    clearInterval(sendInputInterval);
    sendInputInterval = null;
    menu.style.display = 'flex';
    gameCanvas.style.display = 'none';
    hud.style.display = 'none';
    players = [];
    inputState.cursor.x = 0;
    inputState.cursor.y = 0;
    hideUpgradeCards();
    
    // Hide all game-specific UI elements
    abilityHud.classList.add('hidden');
    lapCounter.classList.add('hidden');
    lapTimer.classList.add('hidden');
    
    // Reset ability state
    myAbility = null;
    lastAbilityUse = 0;
    
    // Reset lap timer state
    currentLapStartTime = 0;
    previousLapCount = 0;
    bestLapTime = null;
    bestLapTimeSpan.textContent = '';
    
    // Reset the first state flag so next game waits for server data
    hasReceivedFirstState = false;
    gameStates = []; // Clear game state buffer
    
    // Clear crashed cars tracking
    crashedCars.clear();
    lastKnownPlayers = [];
    playerCrashTime = null;
    
    // Hide loading screen when returning to menu
    loadingScreen.classList.add('hidden');
    
    // Restart spectating when back in menu
    setTimeout(() => startSpectating(), 100); // Small delay to ensure UI is ready
    
    // Show crash message
    messageDiv.textContent = 'You crashed!';
    messageDiv.classList.remove('hidden');
    setTimeout(() => {
      messageDiv.classList.add('hidden');
    }, 3000);
  }

  // Settings system
  let settings = {
    showFPS: false,
    showPing: false
  };
  
  // Performance tracking
  let fpsCounter = 0;
  let lastFpsUpdate = 0;
  let frameCount = 0;
  let currentFPS = 0;
  let pingValue = 0;
  let lastPingTime = 0;

  function formatTime(milliseconds) {
    if (!milliseconds || milliseconds <= 0) return '0:00.000';
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = milliseconds % 1000;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  // Settings system functions
  function loadSettings() {
    try {
      const savedSettings = localStorage.getItem('driftz-settings');
      if (savedSettings) {
        settings = { ...settings, ...JSON.parse(savedSettings) };
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e);
    }
    
    // Apply loaded settings to UI
    fpsToggle.checked = settings.showFPS;
    pingToggle.checked = settings.showPing;
    updatePerformanceOverlay();
  }
  
  function saveSettings() {
    try {
      localStorage.setItem('driftz-settings', JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage:', e);
    }
  }
  
  function updatePerformanceOverlay() {
    // Show/hide performance overlay based on settings
    if (settings.showFPS || settings.showPing) {
      performanceOverlay.classList.remove('hidden');
    } else {
      performanceOverlay.classList.add('hidden');
    }
    
    // Show/hide individual displays
    if (settings.showFPS) {
      fpsDisplay.classList.remove('hidden');
    } else {
      fpsDisplay.classList.add('hidden');
    }
    
    if (settings.showPing) {
      pingDisplay.classList.remove('hidden');
    } else {
      pingDisplay.classList.add('hidden');
    }
  }
  
  function updateFPS() {
    frameCount++;
    const now = performance.now();
    
    if (now - lastFpsUpdate >= 1000) {
      currentFPS = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      frameCount = 0;
      lastFpsUpdate = now;
      
      if (settings.showFPS) {
        fpsDisplay.textContent = `FPS: ${currentFPS}`;
      }
    }
  }
  
  function updatePing() {
    const now = Date.now();
    if (now - lastPingTime >= 2000 && socket.connected) { // Send ping every 2 seconds
      lastPingTime = now;
      const startTime = now;
      
      socket.emit('ping', startTime, (responseTime) => {
        pingValue = Date.now() - startTime;
        if (settings.showPing) {
          pingDisplay.textContent = `Ping: ${pingValue}ms`;
        }
      });
    }
  }
  
  function openSettings() {
    settingsModal.classList.remove('hidden');
  }
  
  function closeSettings() {
    settingsModal.classList.add('hidden');
  }
  
  // Kill feed functions
  function addKillFeedMessage(text, type = 'info') {
    const messageId = messageIdCounter++;
    const message = {
      id: messageId,
      text: text,
      type: type,
      timestamp: Date.now()
    };
    
    killFeedMessages.unshift(message); // Add to beginning of array
    
    // Keep only the last 5 messages
    if (killFeedMessages.length > 5) {
      killFeedMessages = killFeedMessages.slice(0, 5);
    }
    
    renderKillFeed();
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeKillFeedMessage(messageId);
    }, 5000);
  }
  
  function removeKillFeedMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.classList.add('fade-out');
      setTimeout(() => {
        killFeedMessages = killFeedMessages.filter(msg => msg.id !== messageId);
        renderKillFeed();
      }, 300); // Wait for fade-out animation
    }
  }
  
  function renderKillFeed() {
    killFeed.innerHTML = '';
    
    if (killFeedMessages.length === 0) {
      killFeed.classList.add('hidden');
      return;
    }
    
    killFeed.classList.remove('hidden');
    
    killFeedMessages.forEach(message => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `kill-feed-message ${message.type}`;
      messageDiv.setAttribute('data-message-id', message.id);
      messageDiv.textContent = message.text;
      killFeed.appendChild(messageDiv);
    });
  }
  
  // Spectator functions
  function startSpectating() {
    if (!isSpectating) {
      isSpectating = true;
      socket.emit('requestSpectator');
      resizeSpectatorCanvas();
      console.log('Started spectating mode');
    }
  }
  
  function stopSpectating() {
    isSpectating = false;
    spectatorState = null;
    spectatorCtx.clearRect(0, 0, spectatorCanvas.width, spectatorCanvas.height);
  }
  
  function resizeSpectatorCanvas() {
    spectatorCanvas.width = window.innerWidth;
    spectatorCanvas.height = window.innerHeight;
  }
  

  function resizeCanvas() {
    gameCanvas.width = window.innerWidth;
    gameCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', () => {
    resizeCanvas();
    resizeSpectatorCanvas();
  });
  resizeCanvas();
  resizeSpectatorCanvas();
  
  // Start spectating when page loads (menu is visible)
  startSpectating();

  async function initCarSelection() {
    try {
      const response = await fetch('/api/carTypes');
      CAR_TYPES = await response.json();
      carTypes = Object.keys(CAR_TYPES);
      currentCarIndex = 0;
      updateCarCard();
      
      // Initialize settings system
      loadSettings();
    } catch (error) {
      console.error('Failed to load car types:', error);
      carCard.innerHTML = '<p>Failed to load car types. Please refresh the page.</p>';
    }
  }

  function updateCarCard() {
    const carType = carTypes[currentCarIndex];
    const car = CAR_TYPES[carType];
    
    // Update template elements with car data
    carRadioInput.value = carType;
    carName.textContent = car.displayName || carType;
    
    // Update car visual
    const points = car.shape.vertices.map(v => `${v.x * 1.5},${-v.y * 1.5}`).join(' ');
    carPolygon.setAttribute('points', points);
    carPolygon.setAttribute('fill', `rgb(${car.color.fill.join(',')})`);
    carPolygon.setAttribute('stroke', `rgb(${car.color.stroke.join(',')})`);
    carPolygon.setAttribute('stroke-width', car.color.strokeWidth || 2);
    
    // Update stat bars
    speedFill.style.width = `${car.displaySpeed}%`;
    healthFill.style.width = `${car.displayHealth}%`;
    handlingFill.style.width = `${car.displayHandling}%`;
  }

  function switchCar() {
    currentCarIndex = (currentCarIndex + 1) % carTypes.length;
    updateCarCard();
  }

  switchButton.addEventListener('click', switchCar);
  
  initCarSelection();

  function sanitizeName(name) {
    // Remove control characters and non-printable ASCII
    let sanitized = name.replace(/[\x00-\x1F\x7F]/g, '');

    // Remove excessive combining diacritical marks (glitch text)
    // This regex targets Unicode combining diacritical marks (U+0300 to U+036F)
    // and similar characters that can be spammed.
    sanitized = sanitized.replace(/[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]+/g, '');

    // Trim whitespace and limit length
    sanitized = sanitized.trim().substring(0, 20); // Limit to 20 characters

    return sanitized || 'Unnamed'; // Default to 'Unnamed' if empty after sanitization
  }

  joinButton.addEventListener('click', () => {
    const selected = document.querySelector('input[name="car"]:checked');
    const carType = selected ? selected.value : 'Speedster';
    const name = sanitizeName(nameInput.value); // Apply sanitization
    socket.emit('joinGame', { carType, name });
  });

  socket.on('joined', (data) => {
    stopSpectating(); // Stop spectating when joining game
    menu.style.display = 'none';
    loadingScreen.classList.remove('hidden'); // Show loading screen
    gameCanvas.style.display = 'block';
    hud.style.display = 'flex';
    
    // Set up ability HUD and upgrade cards based on selected car
    const selectedCar = document.querySelector('input[name="car"]:checked');
    if (selectedCar && CAR_TYPES[selectedCar.value]) {
      const carType = CAR_TYPES[selectedCar.value];
      const carTypeName = selectedCar.value;
      
      // Generate upgrade cards for this car type
      generateUpgradeCards(carTypeName);
      
      if (carType.ability) {
        myAbility = {
          name: carType.abilityName || carType.ability,
          cooldown: carType.abilityCooldown || 0,
        };
        abilityHud.classList.remove('hidden');
        updateAbilityHUD();
      } else {
        myAbility = null;
        abilityHud.classList.add('hidden');
      }
    }
    
    sendInputInterval = setInterval(() => {
      const timestampedInput = {
        ...inputState,
        timestamp: Date.now(),
        sequence: (sendInputInterval._sequence = (sendInputInterval._sequence || 0) + 1)
      };
      socket.emit('input', timestampedInput);
    }, 1000 / 60);
  });

  socket.on('state', (data) => {
    // Update last message timestamp for connection monitoring
    lastServerMessage = Date.now();
    
    // Detect crashed cars for fade effect
    detectCrashedCars(data.players || []);
    
    // Buffer the state with timestamp for interpolation
    gameStates.push({
      players: data.players,
      abilityObjects: data.abilityObjects || [],
      dynamicObjects: data.dynamicObjects || [],
      timestamp: data.timestamp || Date.now(),
      mySocketId: data.mySocketId,
      map: data.map
    });

    // Update myAbility cooldown if player data is available
    const me = data.players.find(p => p.socketId === data.mySocketId);
    if (me && myAbility) {
      const carDef = CAR_TYPES[me.type];
      const baseCooldown = carDef.abilityCooldown || 0;
      myAbility.cooldown = Math.max(0, baseCooldown - (me.abilityCooldownReduction || 0));
    }

    // Mark that we've received our first state - safe to start rendering
    hasReceivedFirstState = true;
    
    // Hide loading screen now that we have game data
    loadingScreen.classList.add('hidden');

    // Keep only last 1 second of states
    const now = Date.now();
    gameStates = gameStates.filter(state => (now - state.timestamp) < 1000);

    // Update current map immediately (doesn't need interpolation)
    currentMap = data.map || currentMap;
  });

  // Handle delta updates for better performance
  socket.on('delta', (data) => {
    // Update last message timestamp for connection monitoring
    lastServerMessage = Date.now();
    
    const lastState = gameStates[gameStates.length - 1];
    if (!lastState) return;

    // Apply delta to last known state
    const newPlayers = [...lastState.players];
    
    data.players.forEach(deltaPlayer => {
      const existingIndex = newPlayers.findIndex(p => p.id === deltaPlayer.id);
      
      if (deltaPlayer.isFullUpdate) {
        // Full player data
        if (existingIndex >= 0) {
          newPlayers[existingIndex] = deltaPlayer;
        } else {
          newPlayers.push(deltaPlayer);
        }
      } else {
        // Partial update
        if (existingIndex >= 0) {
          newPlayers[existingIndex] = { ...newPlayers[existingIndex], ...deltaPlayer };
        }
      }
    });
    
    // Detect crashed cars for fade effect
    detectCrashedCars(newPlayers);

    // Add the delta state to buffer
    gameStates.push({
      players: newPlayers,
      abilityObjects: data.abilityObjects || lastState.abilityObjects,
      dynamicObjects: data.dynamicObjects || lastState.dynamicObjects || [],
      timestamp: data.timestamp || Date.now(),
      mySocketId: data.mySocketId || lastState.mySocketId,
      map: lastState.map
    });

    // Update myAbility cooldown if player data is available
    const me = newPlayers.find(p => p.socketId === (data.mySocketId || lastState.mySocketId));
    if (me && myAbility) {
      const carDef = CAR_TYPES[me.type];
      const baseCooldown = carDef.abilityCooldown || 0;
      myAbility.cooldown = Math.max(0, baseCooldown - (me.abilityCooldownReduction || 0));
    }

    // Mark that we've received our first data - safe to start rendering
    hasReceivedFirstState = true;
    
    // Hide loading screen now that we have game data
    loadingScreen.classList.add('hidden');

    // Keep only last 1 second of states
    const now = Date.now();
    gameStates = gameStates.filter(state => (now - state.timestamp) < 1000);
  });

  // Handle heartbeat (no data changed)
  socket.on('heartbeat', (data) => {
    // Update last message timestamp for connection monitoring
    lastServerMessage = Date.now();
    
    // Just update timestamp for interpolation timing
    const lastState = gameStates[gameStates.length - 1];
    if (lastState) {
      gameStates.push({
        ...lastState,
        timestamp: data.timestamp || Date.now()
      });
    }
  });

  // Handle kill feed messages
  socket.on('killFeedMessage', ({ text, type }) => {
    addKillFeedMessage(text, type);
  });

  // Handle spectator state
  socket.on('spectatorState', (data) => {
    spectatorState = data;
    console.log('Received spectator state:', data.players?.length || 0, 'players', data.map ? 'with map' : 'no map');
    if (data.players && data.players.length > 0) {
      console.log('First player:', data.players[0]);
    }
  });

  socket.on('returnToMenu', ({ winner, crashed }) => {
    // Skip handling crashes here - they're now handled locally with fade
    if (crashed) return;
    clearInterval(sendInputInterval);
    sendInputInterval = null;
    menu.style.display = 'flex';
    gameCanvas.style.display = 'none';
    hud.style.display = 'none';
    players = [];
    inputState.cursor.x = 0;
    inputState.cursor.y = 0;
    hideUpgradeCards();
    
    // Hide all game-specific UI elements
    abilityHud.classList.add('hidden');
    lapCounter.classList.add('hidden');
    lapTimer.classList.add('hidden');
    
    // Reset ability state
    myAbility = null;
    lastAbilityUse = 0;
    
    // Reset lap timer state
    currentLapStartTime = 0;
    previousLapCount = 0;
    bestLapTime = null;
    bestLapTimeSpan.textContent = '';
    
    // Reset the first state flag so next game waits for server data
    hasReceivedFirstState = false;
    gameStates = []; // Clear game state buffer
    
    // Clear crashed cars tracking
    crashedCars.clear();
    lastKnownPlayers = [];
    
    // Hide loading screen when returning to menu
    loadingScreen.classList.add('hidden');
    
    // Restart spectating when back in menu
    setTimeout(() => startSpectating(), 100); // Small delay to ensure UI is ready
    
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

  // Ability and upgrade input handling
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      
      // Immediate visual feedback for ability button press
      if (myAbility) {
        const now = Date.now();
        const remaining = Math.max(0, myAbility.cooldown - (now - lastAbilityUse));
        
        if (remaining === 0) {
          // Ability ready - immediate feedback
          updateAbilityHUD();
          
          // Visual button press feedback
          abilityHud.style.transform = 'scale(0.95)';
          setTimeout(() => {
            abilityHud.style.transform = 'scale(1)';
          }, 100);

          // Client-side prediction for Dash ability
          if (myAbility.name === 'Dash') {
            const originalLastAbilityUse = lastAbilityUse; // Store original value
            lastAbilityUse = now; // Update client-side for immediate HUD feedback
            updateAbilityHUD(); // Re-render HUD with new cooldown
            // Store originalLastAbilityUse for potential rollback
            myAbility._originalLastAbilityUse = originalLastAbilityUse;
          }
        }
      }
      
      socket.emit('useAbility');
    }
    
    // Handle upgrade number keys (1-6)
    if (e.key >= '1' && e.key <= '6' && !e.repeat) {
      e.preventDefault();
      
      // Only allow upgrades if cards are visible and we're in game
      if (!upgradeCardsContainer.classList.contains('hidden') && sendInputInterval) {
        const upgradeKey = parseInt(e.key);
        const upgradeCard = document.querySelector(`[data-key="${upgradeKey}"]`);
        
        if (upgradeCard) {
          const stat = upgradeCard.getAttribute('data-stat');
          
          // Visual feedback
          upgradeCard.style.transform = 'translateY(-3px) scale(1.1)';
          
          setTimeout(() => {
            upgradeCard.style.transform = '';
          }, 200);
          
          // Send upgrade request
          socket.emit('upgrade', { stat });
        }
      }
    }
  });

  socket.on('abilityResult', (result) => {
    // Handle ability activation feedback
    if (result.success) {
      // Use server timestamp if available, otherwise fall back to client time
      lastAbilityUse = result.serverTime || Date.now();
      updateAbilityHUD();
    } else {
      // Server rejected ability use, revert client-side prediction if it was for Dash
      if (myAbility && myAbility.name === 'Dash' && myAbility._originalLastAbilityUse !== undefined) {
        lastAbilityUse = myAbility._originalLastAbilityUse;
        delete myAbility._originalLastAbilityUse; // Clean up temporary variable
        updateAbilityHUD(); // Re-render HUD with reverted cooldown
      }
    }
  });

  // Update ability HUD every frame
  function updateAbilityHUD() {
    if (!myAbility) {
      abilityHud.classList.add('hidden');
      return;
    }

    const now = Date.now();
    const timeSinceUse = now - lastAbilityUse;
    const remaining = Math.max(0, myAbility.cooldown - timeSinceUse);
    const isReady = remaining === 0;

    // Update ability info
    abilityName.textContent = myAbility.name;
    abilityHud.classList.remove('hidden');

    // Get the progress background element
    const progressBg = abilityHud.querySelector('.ability-progress-bg');
    if (!progressBg) {
      return;
    }

    if (isReady) {
      // Ability is ready - full green background
      progressBg.classList.remove('on-cooldown');
      progressBg.style.transform = 'scaleX(1)';
    } else {
      // Ability is on cooldown - red background that shrinks as cooldown progresses
      progressBg.classList.add('on-cooldown');
      const progress = remaining / myAbility.cooldown;
      progressBg.style.transform = `scaleX(${progress})`;
    }
  }

  // Generate upgrade cards based on car type
  function generateUpgradeCards(carType) {
    upgradeCardsContainer.innerHTML = ''; // Clear existing cards
    
    const car = CAR_TYPES[carType];
    if (!car || !car.upgrades) return;
    
    // Create upgrade points display
    const upgradePointsDisplay = document.createElement('div');
    upgradePointsDisplay.className = 'upgrade-points-display';
    upgradePointsDisplay.innerHTML = `
      <div class="upgrade-points-label">Points</div>
      <div class="upgrade-points-count" id="upgradePointsCounter">0</div>
    `;
    upgradeCardsContainer.appendChild(upgradePointsDisplay);
    
    const upgrades = car.upgrades;
    let keyIndex = 1;
    
    for (const [statName, upgrade] of Object.entries(upgrades)) {
      const upgradeCardContainer = document.createElement('div');
      upgradeCardContainer.className = 'upgrade-card-container';
      upgradeCardContainer.setAttribute('data-stat', statName);
      
      // Create progress blocks
      const progressBlocks = document.createElement('div');
      progressBlocks.className = 'upgrade-progress-blocks';
      
      for (let i = 0; i < upgrade.maxUpgrades; i++) {
        const block = document.createElement('div');
        block.className = 'upgrade-progress-block';
        block.style.backgroundColor = upgrade.color;
        progressBlocks.appendChild(block);
      }
      
      // Create upgrade card
      const upgradeCard = document.createElement('div');
      upgradeCard.className = 'upgrade-card';
      upgradeCard.setAttribute('data-stat', statName);
      upgradeCard.setAttribute('data-key', keyIndex.toString());
      upgradeCard.style.borderColor = upgrade.color;
      
      upgradeCard.innerHTML = `
        <div class="upgrade-key-indicator" style="background-color: ${upgrade.color}">${keyIndex}</div>
        <div class="upgrade-name">${upgrade.name}</div>
      `;
      
      upgradeCardContainer.appendChild(progressBlocks);
      upgradeCardContainer.appendChild(upgradeCard);
      upgradeCardsContainer.appendChild(upgradeCardContainer);
      keyIndex++;
    }
  }

  // Hide upgrade cards completely
  function hideUpgradeCards() {
    upgradeCardsContainer.classList.add('hidden');
    upgradeCardsContainer.classList.remove('compact');
    
    // Hide ability HUD
    abilityHud.classList.add('hidden');
    
    // Hide lap counter and lap timer
    lapCounter.classList.add('hidden');
    lapTimer.classList.add('hidden');
    currentLapStartTime = 0;
    bestLapTime = null;
    previousLapCount = 0;
    bestLapTimeSpan.textContent = '';
    currentLapTimeSpan.textContent = '0:00.000';
  }

  // Update upgrade cards and progress blocks based on current state
  function updateUpgradeDisplay(me, carType) {
    if (!me || !carType) return;
    
    const car = CAR_TYPES[carType];
    if (!car || !car.upgrades) return;
    
    const upgradeUsage = me.upgradeUsage || {};
    
    // Update card availability and progress blocks
    for (const [statName, upgrade] of Object.entries(car.upgrades)) {
      const currentUsage = upgradeUsage[statName] || 0;
      const maxUpgrades = upgrade.maxUpgrades;
      const isMaxed = currentUsage >= maxUpgrades;
      
      // Update upgrade card
      const upgradeCard = document.querySelector(`.upgrade-card[data-stat="${statName}"]`);
      if (upgradeCard) {
        upgradeCard.classList.toggle('maxed', isMaxed);
      }
      
      // Update progress blocks
      const container = document.querySelector(`.upgrade-card-container[data-stat="${statName}"]`);
      if (container) {
        const blocks = container.querySelectorAll('.upgrade-progress-block');
        blocks.forEach((block, index) => {
          if (index < currentUsage) {
            block.classList.add('filled');
          } else {
            block.classList.remove('filled');
          }
        });
      }
    }
  }

  // Update ability HUD regularly
  setInterval(updateAbilityHUD, 100);

  // DEBUG PANEL FUNCTIONALITY
  let debugMode = false;
  let debugPanel = null;

  // Check if debug mode is enabled on server
  async function initDebugPanel() {
    try {
      const response = await fetch('/api/debug');
      const data = await response.json();
      debugMode = data.debugMode;
      
      if (debugMode) {
        debugPanel = document.getElementById('debugPanel');
        if (debugPanel) {
          setupDebugPanel();
          debugPanel.classList.remove('hidden');
        }
      }
    } catch (error) {
      console.log('Debug mode not available');
    }
  }

  // Set up debug panel event listeners and functionality
  function setupDebugPanel() {
    // Get debug panel elements
    const debugToggle = document.getElementById('debugToggle');
    const debugContent = document.getElementById('debugContent');
    
    // Sliders that need real-time value updates
    const healthSlider = document.getElementById('debugHealth');
    const healthValue = document.getElementById('debugHealthValue');
    const maxHealthSlider = document.getElementById('debugMaxHealth');
    const maxHealthValue = document.getElementById('debugMaxHealthValue');
    const speedSlider = document.getElementById('debugSpeed');
    const speedValue = document.getElementById('debugSpeedValue');
    const regenSlider = document.getElementById('debugRegen');
    const regenValue = document.getElementById('debugRegenValue');
    
    // Buttons
    const givePointsBtn = document.getElementById('debugGivePoints');
    const setLapsBtn = document.getElementById('debugSetLaps');
    const setHealthBtn = document.getElementById('debugSetHealth');
    const resetPositionBtn = document.getElementById('debugResetPosition');
    const toggleGodModeBtn = document.getElementById('debugToggleGodMode');
    const resetAbilityBtn = document.getElementById('debugResetAbility');
    const forceAbilityBtn = document.getElementById('debugForceAbility');
    const setStatsBtn = document.getElementById('debugSetStats');
    const resetUpgradesBtn = document.getElementById('debugResetUpgrades');
    const getPlayerDataBtn = document.getElementById('debugGetPlayerData');
    
    // Collapse/expand functionality
    debugToggle.addEventListener('click', () => {
      const isCollapsed = debugContent.classList.toggle('collapsed');
      debugToggle.textContent = isCollapsed ? '+' : '−';
    });

    // Slider value updates
    healthSlider.addEventListener('input', () => {
      healthValue.textContent = healthSlider.value;
    });
    maxHealthSlider.addEventListener('input', () => {
      maxHealthValue.textContent = maxHealthSlider.value;
    });
    speedSlider.addEventListener('input', () => {
      speedValue.textContent = parseFloat(speedSlider.value).toFixed(3);
    });
    regenSlider.addEventListener('input', () => {
      regenValue.textContent = parseFloat(regenSlider.value).toFixed(2);
    });

    // Button event listeners
    givePointsBtn.addEventListener('click', () => {
      const points = parseInt(document.getElementById('debugUpgradePoints').value);
      socket.emit('debug:giveUpgradePoints', { points });
    });

    setLapsBtn.addEventListener('click', () => {
      const laps = parseInt(document.getElementById('debugLaps').value);
      socket.emit('debug:setLaps', { laps });
    });

    setHealthBtn.addEventListener('click', () => {
      const health = parseInt(healthSlider.value);
      socket.emit('debug:setHealth', { health });
    });

    resetPositionBtn.addEventListener('click', () => {
      socket.emit('debug:resetPosition');
    });

    toggleGodModeBtn.addEventListener('click', () => {
      socket.emit('debug:toggleGodMode');
    });

    resetAbilityBtn.addEventListener('click', () => {
      socket.emit('debug:resetAbilityCooldown');
    });

    forceAbilityBtn.addEventListener('click', () => {
      socket.emit('debug:forceAbility');
    });

    setStatsBtn.addEventListener('click', () => {
      const maxHealth = parseInt(maxHealthSlider.value);
      const acceleration = parseFloat(speedSlider.value);
      const regen = parseFloat(regenSlider.value);
      socket.emit('debug:setStats', { maxHealth, acceleration, regen });
    });

    resetUpgradesBtn.addEventListener('click', () => {
      socket.emit('debug:resetUpgrades');
    });

    getPlayerDataBtn.addEventListener('click', () => {
      socket.emit('debug:getPlayerData');
    });

    // F12 toggle shortcut
    document.addEventListener('keydown', (e) => {
      if (e.key === '#' && debugMode) {
        e.preventDefault();
        debugPanel.classList.toggle('hidden');
      }
    });
  }

  // Handle debug socket events
  socket.on('debug:godModeStatus', (data) => {
    const godModeBtn = document.getElementById('debugToggleGodMode');
    if (godModeBtn) {
      godModeBtn.textContent = data.godMode ? 'God Mode: ON' : 'God Mode: OFF';
      godModeBtn.setAttribute('data-active', data.godMode.toString());
    }
  });

  socket.on('debug:playerData', (data) => {
    const playerDataDiv = document.getElementById('debugPlayerData');
    if (playerDataDiv && data.players) {
      let html = '';
      data.players.forEach(player => {
        html += `
          <div class="debug-player">
            <strong>${player.name}</strong> (${player.type})
            <br>Laps: ${player.laps} | Health: ${Math.round(player.health)}/${player.maxHealth}
            <br>Upgrade Points: ${player.upgradePoints} | God Mode: ${player.godMode ? 'ON' : 'OFF'}
          </div>
        `;
      });
      playerDataDiv.innerHTML = html || 'No players found';
    }
  });

  // Initialize debug panel when page loads
  initDebugPanel();

  // Socket disconnection handlers
  socket.on('disconnect', () => {
    console.log('Socket disconnected');
    hideUpgradeCards();
    
    // Hide all game-specific UI elements on disconnect
    abilityHud.classList.add('hidden');
    lapCounter.classList.add('hidden');
    lapTimer.classList.add('hidden');
    
    showDisconnectionOverlay();
  });

  socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
    hideUpgradeCards();
    
    // Hide all game-specific UI elements on connection error
    abilityHud.classList.add('hidden');
    lapCounter.classList.add('hidden');
    lapTimer.classList.add('hidden');
    
    showDisconnectionOverlay();
  });

  socket.on('reconnect_failed', () => {
    console.log('Reconnection failed');
    hideUpgradeCards();
    
    // Hide all game-specific UI elements on reconnection failure
    abilityHud.classList.add('hidden');
    lapCounter.classList.add('hidden');
    lapTimer.classList.add('hidden');
    
    showDisconnectionOverlay();
  });

  function showDisconnectionOverlay() {
    if (menu.style.display === 'none') {
      // User was in-game - show full overlay
      disconnectionOverlay.classList.remove('hidden');
      loadingScreen.classList.add('hidden'); // Hide loading screen if it was showing
    } else {
      // User is on menu - show inline disconnection message
      showMenuDisconnectionWarning();
    }
  }

  function showMenuDisconnectionWarning() {
    // Hide the interactive menu elements
    nameInput.style.display = 'none';
    carCard.style.display = 'none';
    switchButton.style.display = 'none';
    joinButton.style.display = 'none';
    
    // Show the menu disconnection warning template
    menuDisconnectionWarning.classList.remove('hidden');
  }

  function hideMenuDisconnectionWarning() {
    // Show the interactive menu elements
    nameInput.style.display = 'block';
    carCard.style.display = 'block';
    switchButton.style.display = 'block';
    joinButton.style.display = 'block';
    
    // Hide the warning template
    menuDisconnectionWarning.classList.add('hidden');
  }

  // Monitor server messages to detect "silent" disconnections
  function monitorConnection() {
    const now = Date.now();
    if (now - lastServerMessage > 600000) { // 10 minutes without any server message
      console.log('Connection appears to be lost - no server messages received');
      showDisconnectionOverlay();
    }
  }

  // Check connection every 5 seconds
  setInterval(monitorConnection, 5000);

  // Handle successful reconnection
  socket.on('connect', () => {
    console.log('Socket connected/reconnected');
    lastServerMessage = Date.now(); // Reset the timer
    
    // Hide disconnection warnings if they were showing
    disconnectionOverlay.classList.add('hidden');
    if (menu.style.display !== 'none') {
      hideMenuDisconnectionWarning();
    }
  });

  // Spectator rendering function
  function drawSpectatorView() {
    if (!spectatorState || !isSpectating) {
      // Show "waiting for game" message when no spectator data
      spectatorCtx.clearRect(0, 0, spectatorCanvas.width, spectatorCanvas.height);
      spectatorCtx.fillStyle = 'rgba(20, 20, 30, 0.3)';
      spectatorCtx.fillRect(0, 0, spectatorCanvas.width, spectatorCanvas.height);
      spectatorCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      spectatorCtx.font = '24px Arial';
      spectatorCtx.textAlign = 'center';
      spectatorCtx.fillText('Connecting to server...', spectatorCanvas.width / 2, spectatorCanvas.height / 2);
      return;
    }

    // Use unified renderGame function for spectator view (even with empty player list)
    renderGame(spectatorCanvas, spectatorCtx, spectatorState, {
      mode: 'spectator',
      centerPlayer: null,
      mapData: spectatorState.map,
      showHUD: false,
      alpha: 1,
      showCheckpoints: false,
      showAbilityObjects: true
    });
    
    // If no players, show a subtle overlay message
    if (!spectatorState.players || spectatorState.players.length === 0) {
      spectatorCtx.font = '22px Quicksilver';
      spectatorCtx.textAlign = 'center';
      
      // Black outline for better readability
      spectatorCtx.lineWidth = 3;
      spectatorCtx.strokeStyle = '#000000';
      spectatorCtx.strokeText('Waiting for players...', spectatorCanvas.width / 2, spectatorCanvas.height - 50);
      
      // White fill text
      spectatorCtx.fillStyle = 'rgba(255, 255, 255, 1)';
      spectatorCtx.fillText('Waiting for players...', spectatorCanvas.width / 2, spectatorCanvas.height - 50);
    }
  }

  // Continuous rendering for smooth interpolation
  function renderLoop() {
    // Update performance metrics
    updateFPS();
    updatePing();
    
    if (sendInputInterval) { // Only render when in game
      drawGame();
    } else if (isSpectating) { // Render spectator view when in menu
      drawSpectatorView();
    }
    requestAnimationFrame(renderLoop);
  }
  renderLoop();

  // Handle upgrade card clicks
  upgradeCardsContainer.addEventListener('click', (e) => {
    const upgradeCard = e.target.closest('.upgrade-card');
    if (upgradeCard && !upgradeCardsContainer.classList.contains('hidden')) {
      const stat = upgradeCard.getAttribute('data-stat');
      
      // Visual feedback
      upgradeCard.style.transform = 'translateY(-3px) scale(1.1)';
      
      setTimeout(() => {
        upgradeCard.style.transform = '';
      }, 200);
      
      // Send upgrade request
      socket.emit('upgrade', { stat });
    }
  });

  // Interpolate between two game states
  function interpolateStates(state1, state2, t) {
    if (!state1 || !state2 || t <= 0) return state1;
    if (t >= 1) return state2;

    const interpolatedPlayers = state2.players.map((p2, i) => {
      const p1 = state1.players.find(p => p.id === p2.id);
      if (!p1) return p2;

      return {
        ...p2,
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
        angle: p1.angle + (p2.angle - p1.angle) * t
      };
    });

    return {
      ...state2,
      players: interpolatedPlayers
    };
  }


  // Get interpolated game state for current time
  function getInterpolatedState() {
    if (gameStates.length === 0) return null;
    
    const now = Date.now();
    const renderTime = now - interpolationDelay;

    // For single state, use it directly
    if (gameStates.length < 2) {
      return gameStates[gameStates.length - 1];
    }

    // Find the two states to interpolate between
    let state1 = null, state2 = null;
    for (let i = 0; i < gameStates.length - 1; i++) {
      if (gameStates[i].timestamp <= renderTime && gameStates[i + 1].timestamp > renderTime) {
        state1 = gameStates[i];
        state2 = gameStates[i + 1];
        break;
      }
    }

    if (!state1 || !state2) {
      // Use latest state if we can't find interpolation bounds
      return gameStates[gameStates.length - 1];
    }

    // Calculate interpolation factor
    const t = Math.max(0, Math.min(1, (renderTime - state1.timestamp) / (state2.timestamp - state1.timestamp)));
    return interpolateStates(state1, state2, t);
  }

  // Camera system functions
  function calculateMapBounds(mapShapes) {
    if (!mapShapes || !Array.isArray(mapShapes)) {
      return { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    }
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    mapShapes.forEach(shape => {
      if (Array.isArray(shape.vertices)) {
        shape.vertices.forEach(v => {
          minX = Math.min(minX, v.x);
          maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y);
          maxY = Math.max(maxY, v.y);
        });
      }
    });
    
    return { minX, maxX, minY, maxY };
  }
  
  function calculateScale(canvas, mapBounds, mode = 'player') {
    const { minX, maxX, minY, maxY } = mapBounds;
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const size = Math.max(sizeX, sizeY) || 1;
    
    if (mode === 'spectator') {
      // Zoom out more to fit entire map in spectator view
      return (Math.min(canvas.width, canvas.height) * 0.9) / size;
    } else {
      // Player mode - closer zoom
      return (Math.min(canvas.width, canvas.height) * 2.5) / size;
    }
  }
  
  function getCameraTransform(options) {
    const { canvas, mapBounds, mode, centerPlayer } = options;
    
    let centerX = canvas.width / 2;
    let centerY = canvas.height / 2;
    let focusX = 0;
    let focusY = 0;
    
    if (mode === 'player' && centerPlayer) {
      // Player-centered camera
      focusX = centerPlayer.x;
      focusY = centerPlayer.y;
    } else if (mode === 'spectator' && mapBounds) {
      // Map-centered camera
      focusX = (mapBounds.minX + mapBounds.maxX) / 2;
      focusY = (mapBounds.minY + mapBounds.maxY) / 2;
    }
    
    const scale = calculateScale(canvas, mapBounds, mode);
    
    return { centerX, centerY, focusX, focusY, scale };
  }

  // Unified rendering function for both player and spectator modes
  function renderGame(canvas, ctx, gameState, options = {}) {
    const {
      mode = 'player',
      centerPlayer = null,
      mapData = null,
      showHUD = true,
      alpha = 1.0,
      showCheckpoints = true,
      showAbilityObjects = true
    } = options;
    
    if (!gameState) return;
    
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    
    // Set global alpha for spectator mode
    ctx.globalAlpha = alpha;
    
    // Get map data (prioritize passed mapData, fallback to currentMap)
    const mapToUse = mapData || currentMap;
    
    // Calculate camera transform
    const mapBounds = calculateMapBounds(mapToUse?.shapes);
    const { centerX, centerY, focusX, focusY, scale } = getCameraTransform({
      canvas,
      mapBounds,
      mode,
      centerPlayer
    });
    
    // Extract game objects
    const players = gameState.players || [];
    const abilityObjects = gameState.abilityObjects || [];
    const dynamicObjects = gameState.dynamicObjects || [];
    
    // Render map
    if (mapToUse && Array.isArray(mapToUse.shapes)) {
      for (const shape of mapToUse.shapes) {
        ctx.beginPath();
        
        const color = Array.isArray(shape.fillColor)
          ? `rgb(${shape.fillColor[0]}, ${shape.fillColor[1]}, ${shape.fillColor[2]})`
          : 'rgb(50, 50, 50)';
        ctx.fillStyle = color;
        
        if (Array.isArray(shape.vertices)) {
          const verts = shape.vertices.map(v => ({
            x: centerX + (v.x - focusX) * scale,
            y: centerY - (v.y - focusY) * scale
          }));
          ctx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) {
            ctx.lineTo(verts[i].x, verts[i].y);
          }
          ctx.closePath();
          ctx.fill();
          
          // Draw border stripes if available
          if (Array.isArray(shape.borderColors) && shape.borderColors.length > 0) {
            const lineWidth = (shape.borderWidth || 8) * scale;
            const stripeLength = (shape.stripeLength || shape.borderWidth * 1.8 || 25) * scale;
            const baseColor = shape.borderColors[0] || '#ff0000';
            
            for (let i = 0; i < verts.length; i++) {
              const a = verts[i];
              const b = verts[(i + 1) % verts.length];
              
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
                
                ctx.beginPath();
                ctx.moveTo(x0 + offsetX, y0 + offsetY);
                ctx.lineTo(x1 + offsetX, y1 + offsetY);
                ctx.lineTo(x1 - offsetX, y1 - offsetY);
                ctx.lineTo(x0 - offsetX, y0 - offsetY);
                ctx.closePath();
                
                const isLastStripe = s === steps - 1;
                ctx.fillStyle = isLastStripe
                  ? baseColor
                  : shape.borderColors[s % shape.borderColors.length];
                ctx.fill();
              }
              
              const radius = lineWidth / 2;
              ctx.beginPath();
              ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
              ctx.fillStyle = baseColor;
              ctx.fill();
            }
          }
        }
      }
    }

    // Start/finish checkerboard (only show in player mode or if centerPlayer exists)
    if (showCheckpoints && mapToUse && mapToUse.start && mapToUse.start.vertices) {
      const screenVerts = mapToUse.start.vertices.map(v => ({
        x: centerX + (v.x - focusX) * scale,
        y: centerY - (v.y - focusY) * scale
      }));
      drawCheckerboard(ctx, screenVerts, 20, { x: 0, y: 0 }, scale, { x: focusX, y: focusY }, centerX, centerY);
    }

    // Checkpoints (only show in player mode and if we have a center player)
    if (showCheckpoints && mapToUse && mapToUse.checkpoints && centerPlayer) {
      for (const cp of mapToUse.checkpoints) {
        if (cp.type === 'line' && cp.vertices.length >= 2) {
          const a = cp.vertices[0];
          const b = cp.vertices[1];
          ctx.beginPath();
          ctx.moveTo(centerX + (a.x - focusX) * scale, centerY - (a.y - focusY) * scale);
          ctx.lineTo(centerX + (b.x - focusX) * scale, centerY - (b.y - focusY) * scale);
          
          // Color checkpoints based on visit status
          const isVisited = centerPlayer && centerPlayer.checkpointsVisited && centerPlayer.checkpointsVisited.includes(cp.id);
          ctx.strokeStyle = isVisited ? '#00ff00' : '#ffff00'; // Green if visited, yellow if not
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Dynamic objects
    dynamicObjects.forEach((obj) => {
      if (obj.vertices && obj.vertices.length) {
        ctx.save();
        ctx.translate(centerX, centerY);
        
        ctx.beginPath();
        obj.vertices.forEach((v, i) => {
          const x = (obj.position.x + v.x - focusX) * scale;
          const y = (obj.position.y + v.y - focusY) * scale;
          if (i === 0) ctx.moveTo(x, -y);
          else ctx.lineTo(x, -y);
        });
        ctx.closePath();
        
        // Adjust colors based on damage
        let fillColor = obj.fillColor || [139, 69, 19];
        let strokeColor = obj.strokeColor || [101, 67, 33];
        
        // Visual damage feedback
        if (obj.health !== undefined && obj.maxHealth !== undefined) {
          const healthRatio = obj.health / obj.maxHealth;
          if (healthRatio <= 0) {
            // Destroyed - make it darker and more transparent
            fillColor = [69, 34, 9]; // Much darker brown
            strokeColor = [50, 33, 16];
            ctx.globalAlpha = 0.5; // Semi-transparent
          } else if (healthRatio < 0.5) {
            // Damaged - darken the colors
            fillColor = fillColor.map(c => Math.floor(c * (0.5 + healthRatio * 0.5)));
            strokeColor = strokeColor.map(c => Math.floor(c * (0.5 + healthRatio * 0.5)));
          }
        }
        
        // Fill color
        if (fillColor && Array.isArray(fillColor)) {
          ctx.fillStyle = `rgb(${fillColor[0]}, ${fillColor[1]}, ${fillColor[2]})`;
          ctx.fill();
        }
        
        // Stroke color
        if (strokeColor && Array.isArray(strokeColor)) {
          ctx.strokeStyle = `rgb(${strokeColor[0]}, ${strokeColor[1]}, ${strokeColor[2]})`;
          ctx.lineWidth = (obj.strokeWidth || 2) * scale;
          ctx.stroke();
        }
        
        ctx.restore();
        
        // Draw health bar for dynamic objects
        if (obj.health !== undefined && obj.maxHealth !== undefined && obj.health < obj.maxHealth) {
          const objScreenX = centerX + (obj.position.x - focusX) * scale;
          const objScreenY = centerY - (obj.position.y - focusY) * scale;
          
          const barWidth = 30 * scale;
          const barHeight = 4 * scale;
          const barX = objScreenX - barWidth / 2;
          const barY = objScreenY - 40 * scale;
          
          const healthRatio = Math.max(0, obj.health / obj.maxHealth);
          
          // Background
          ctx.fillStyle = '#333';
          ctx.fillRect(barX, barY, barWidth, barHeight);
          
          // Health bar
          ctx.fillStyle = healthRatio > 0.5 ? '#0a0' : healthRatio > 0.25 ? '#aa0' : '#a00';
          ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
          
          // Border
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
      }
    });

    // Spike traps and ability objects
    if (showAbilityObjects) {
      abilityObjects.forEach((obj) => {
        if (obj.type === 'spike_trap' && obj.vertices && obj.vertices.length) {
          ctx.save();
          ctx.translate(centerX, centerY);
          
          ctx.beginPath();
          obj.vertices.forEach((v, i) => {
            const x = (obj.position.x + v.x - focusX) * scale;
            const y = (obj.position.y + v.y - focusY) * scale;
            if (i === 0) ctx.moveTo(x, -y);
            else ctx.lineTo(x, -y);
          });
          ctx.closePath();
          
          ctx.fillStyle = obj.render?.fillStyle || '#888888';
          ctx.fill();
          ctx.strokeStyle = obj.render?.strokeStyle || '#444444';
          ctx.lineWidth = (obj.render?.lineWidth || 2) * scale;
          ctx.stroke();
          
          ctx.restore();
        }
      });
    }

    // Combine current players with crashed cars for rendering
    const allPlayersToRender = [...players];
    
    // Add crashed cars with fade effect
    const now = Date.now();
    for (const [carId, crashData] of crashedCars.entries()) {
      const fadeElapsed = now - crashData.fadeStartTime;
      if (fadeElapsed < CRASH_FADE_DURATION) {
        // Add crashed car with fade info
        allPlayersToRender.push({
          ...crashData.car,
          _isCrashed: true,
          _fadeAlpha: 1 - (fadeElapsed / CRASH_FADE_DURATION) // 1.0 to 0.0
        });
      }
    }
    
    // Players (including fading crashed cars)
    allPlayersToRender.forEach((p) => {
      const dx = p.x - focusX;
      const dy = p.y - focusY;
      const screenX = centerX + dx * scale;
      const screenY = centerY - dy * scale;
      
      ctx.save();
      
      // Apply fade alpha for crashed cars or player's own crashed car
      if (p._isCrashed && p._fadeAlpha !== undefined) {
        ctx.globalAlpha = p._fadeAlpha;
      } else if (playerCrashTime && p.socketId === mySocketId) {
        // Apply fade to player's own crashed car
        const fadeElapsed = Date.now() - playerCrashTime;
        if (fadeElapsed < CRASH_FADE_DURATION) {
          ctx.globalAlpha = 1 - (fadeElapsed / CRASH_FADE_DURATION);
        }
      }
      
      // Get vertices - either from player object or look up from CAR_TYPES
      let vertices = p.vertices;
      if (!vertices && p.type && CAR_TYPES[p.type]) {
        vertices = CAR_TYPES[p.type].shape.vertices;
      }
      
      if (vertices && vertices.length) {
        ctx.beginPath();
        
        vertices.forEach((v, i) => {
          // In spectator mode, vertices are from CAR_TYPES and need manual rotation
          // In player mode, vertices are from body.vertices and are already rotated by Matter.js
          let rotatedX, rotatedY;
          if (mode === 'spectator' && p.angle !== undefined) {
            // Apply manual rotation for spectator mode
            const cos = Math.cos(p.angle);
            const sin = Math.sin(p.angle);
            rotatedX = v.x * cos - v.y * sin;
            rotatedY = v.x * sin + v.y * cos;
          } else {
            // Use vertices as-is (already rotated by Matter.js in player mode)
            rotatedX = v.x;
            rotatedY = v.y;
          }
          
          const x = (p.x + rotatedX - focusX) * scale;
          const y = (p.y + rotatedY - focusY) * scale;
          if (i === 0) ctx.moveTo(centerX + x, centerY - y);
          else ctx.lineTo(centerX + x, centerY - y);
        });
        ctx.closePath();
        ctx.fillStyle = `rgb(${p.color.fill[0]},${p.color.fill[1]},${p.color.fill[2]})`;
        ctx.fill();
      } else if (p.radius) {
        ctx.beginPath();
        ctx.arc(screenX, screenY, p.radius * scale, 0, 2 * Math.PI);
        ctx.fillStyle = `rgb(${p.color.fill[0]},${p.color.fill[1]},${p.color.fill[2]})`;
        ctx.fill();
      }

      if (p.color && p.color.stroke) {
        ctx.strokeStyle = `rgb(${p.color.stroke[0]}, ${p.color.stroke[1]}, ${p.color.stroke[2]})`;
        ctx.lineWidth = (p.color.strokeWidth || 2) * scale;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      ctx.restore();

      // Apply fade effect to name and health bar too
      if (p._isCrashed && p._fadeAlpha !== undefined) {
        ctx.globalAlpha = p._fadeAlpha;
      } else if (playerCrashTime && p.socketId === mySocketId) {
        // Apply fade to player's own crashed car name/health
        const fadeElapsed = Date.now() - playerCrashTime;
        if (fadeElapsed < CRASH_FADE_DURATION) {
          ctx.globalAlpha = 1 - (fadeElapsed / CRASH_FADE_DURATION);
        }
      }

      // Player name with black outline and smooth font
      const fontSize = Math.max(6, 10 * scale);
      ctx.font = `bold ${fontSize}px 'Tahoma', 'Arial', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      
      // Black outline for better readability
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(p.name || '', screenX, screenY + 20 * scale);
      
      // White fill text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(p.name || '', screenX, screenY + 20 * scale);

      if (p.health < p.maxHealth) {
        // Scale bar width based on max health (base 20px for 10 health, scales up)
        const baseWidth = 20;
        const healthMultiplier = p.maxHealth / 10; // Normalize to base health of 10
        const barWidth = (baseWidth + (healthMultiplier - 1) * 8) * scale; // +8px per 10 extra health
        const barHeight = 4 * scale;
        const barX = screenX - barWidth / 2;
        const barY = screenY + 32 * scale;
        const cornerRadius = barHeight / 2;

        const healthRatio = p.health / p.maxHealth;
        
        // Smooth color transition based on health
        let healthColor;
        if (healthRatio > 0.7) {
          healthColor = '#4CAF50'; // Green
        } else if (healthRatio > 0.4) {
          healthColor = '#FF9800'; // Orange
        } else if (healthRatio > 0.2) {
          healthColor = '#FF5722'; // Red-orange
        } else {
          healthColor = '#F44336'; // Red
        }

        // Background (rounded rectangle)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
        ctx.fill();

        // Health fill (rounded rectangle)
        if (healthRatio > 0) {
          ctx.fillStyle = healthColor;
          ctx.beginPath();
          ctx.roundRect(barX, barY, barWidth * healthRatio, barHeight, cornerRadius);
          ctx.fill();
        }

        // Subtle border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
        ctx.stroke();
      }
      
      // Reset global alpha for next player
      ctx.globalAlpha = 1.0;
    });

    // Update HUD elements (only in player mode)
    if (showHUD && centerPlayer && mode === 'player') {
      lapsSpan.textContent = `Lap ${centerPlayer.laps} of ${centerPlayer.maxLaps}`;
      
      // Update upgrade points counter beside cards
      const upgradePointsCounter = document.getElementById('upgradePointsCounter');
      if (upgradePointsCounter) {
        upgradePointsCounter.textContent = centerPlayer.upgradePoints;
      }
      
      // Handle lap timer
      const now = Date.now();
      
      // Check if a new lap was completed
      if (centerPlayer.laps > previousLapCount) {
        // A lap was just completed
        if (currentLapStartTime > 0) {
          const lapTime = now - currentLapStartTime;
          
          // Update best lap time if this is better or first lap
          if (!bestLapTime || lapTime < bestLapTime) {
            bestLapTime = lapTime;
            bestLapTimeSpan.textContent = formatTime(bestLapTime);
          }
        }
        
        // Start timing the new lap
        currentLapStartTime = now;
        previousLapCount = centerPlayer.laps;
      } else if (centerPlayer.laps < previousLapCount) {
        // Laps reset (new game/crashed) - reset timer
        currentLapStartTime = now;
        bestLapTime = null;
        bestLapTimeSpan.textContent = '';
        previousLapCount = centerPlayer.laps;
      } else if (currentLapStartTime === 0 && centerPlayer.laps === 0) {
        // First time in game - start timing
        currentLapStartTime = now;
        previousLapCount = 0;
      }
      
      // Update current lap time display
      if (currentLapStartTime > 0) {
        const currentLapTime = now - currentLapStartTime;
        currentLapTimeSpan.textContent = formatTime(currentLapTime);
        lapTimer.classList.remove('hidden');
      } else {
        lapTimer.classList.add('hidden');
      }
      
      // Show upgrades if player has points OR has ever earned upgrade points
      const hasEverHadUpgrades = centerPlayer.upgradePoints > 0 || Object.keys(centerPlayer.upgradeUsage || {}).length > 0;
      const shouldShowUpgrades = hasEverHadUpgrades;
      const isCompactMode = hasEverHadUpgrades && centerPlayer.upgradePoints === 0;
      
      // Show lap counter and timer whenever in game
      lapCounter.classList.remove('hidden');
      lapTimer.classList.remove('hidden');
      
      if (shouldShowUpgrades) {
        upgradeCardsContainer.classList.remove('hidden');
        upgradeCardsContainer.classList.toggle('compact', isCompactMode);
      } else {
        upgradeCardsContainer.classList.add('hidden');
        upgradeCardsContainer.classList.remove('compact');
      }
      
      // Update upgrade display if we have car type info
      const selectedCar = document.querySelector('input[name="car"]:checked');
      if (selectedCar) {
        updateUpgradeDisplay(centerPlayer, selectedCar.value);
      }
    }
    
    // Reset global alpha
    ctx.globalAlpha = 1.0;
  }

  // Wrapper function for player mode (maintains compatibility)
  function drawGame() {
    // Don't render until we've received our first state from server
    if (!hasReceivedFirstState) {
      return;
    }
    
    const currentState = getInterpolatedState();
    if (!currentState) return;

    // Update global state for rendering
    players = currentState.players || [];
    abilityObjects = currentState.abilityObjects || [];
    mySocketId = currentState.mySocketId || mySocketId;
    
    const me = players.find((p) => p.socketId === mySocketId);
    
    renderGame(gameCanvas, ctx, currentState, {
      mode: 'player',
      centerPlayer: me,
      mapData: currentMap,
      showHUD: true,
      alpha: 1.0,
      showCheckpoints: true,
      showAbilityObjects: true
    });
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
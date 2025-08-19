(() => {
  let socket = io();
  let currentMap = null;
  let currentUser = null;

  // Authentication elements
  const authScreen = document.getElementById('authScreen');
  const authSelection = document.getElementById('authSelection');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const guestForm = document.getElementById('guestForm');
  const authLoading = document.getElementById('authLoading');

  // Toolbar elements
  const topToolbar = document.getElementById('topToolbar');
  const toolbarHoverZone = document.getElementById('toolbarHoverZone');
  const toolbarPlayerName = document.getElementById('toolbarPlayerName');
  const toolbarLogoutBtn = document.getElementById('toolbarLogoutBtn');
  const toolbarSettingsBtn = document.getElementById('toolbarSettingsBtn');

  const menu = document.getElementById('menu');
  const joinButton = document.getElementById('joinButton');
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
  
  // Get boost display elements
  const boostDisplay = document.getElementById('boostDisplay');
  const boostBar = document.getElementById('boostBar');
  const boostText = document.getElementById('boostText');
  
  // Get kill feed element
  const killFeed = document.getElementById('killFeed');
  
  // Get leaderboard elements
  const miniLeaderboard = document.getElementById('miniLeaderboard');
  const miniLeaderboardContent = document.getElementById('miniLeaderboard').querySelector('.mini-leaderboard-content');
  const detailedLeaderboard = document.getElementById('detailedLeaderboard');
  const leaderboardTableBody = document.getElementById('leaderboardTableBody');
  
  // Get spectator canvas
  const spectatorCanvas = document.getElementById('spectatorCanvas');
  const spectatorCtx = spectatorCanvas.getContext('2d');

  // Get references to template elements
  const loadingScreen = document.getElementById('loadingScreen');
  const disconnectionOverlay = document.getElementById('disconnectionOverlay');
  const menuDisconnectionWarning = document.getElementById('menuDisconnectionWarning');
  
  // Get settings elements
  const settingsModal = document.getElementById('settingsModal');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const fpsToggle = document.getElementById('fpsToggle');
  const pingToggle = document.getElementById('pingToggle');
  const performanceOverlay = document.getElementById('performanceOverlay');
  const fpsDisplay = document.getElementById('fpsDisplay');
  const pingDisplay = document.getElementById('pingDisplay');
  
  // Get room browser elements
  const roomBrowserButton = document.getElementById('roomBrowserButton');
  const roomBrowserModal = document.getElementById('roomBrowserModal');
  const roomBrowserCloseBtn = document.getElementById('roomBrowserCloseBtn');
  const refreshRoomsButton = document.getElementById('refreshRoomsButton');
  const roomsList = document.getElementById('roomsList');
  const createRoomName = document.getElementById('createRoomName');
  const createRoomMap = document.getElementById('createRoomMap');
  const createRoomMaxPlayers = document.getElementById('createRoomMaxPlayers');

  // Map editor elements
  const mapEditorButton = document.getElementById('mapEditorButton');
  const mapEditorContainer = document.getElementById('mapEditorContainer');
  const maxPlayersValue = document.getElementById('maxPlayersValue');
  const createRoomPrivate = document.getElementById('createRoomPrivate');
  const createRoomButton = document.getElementById('createRoomButton');
  
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

  // Authentication functionality
  async function checkAuthSession() {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();
      
      if (data.authenticated) {
        // Check if user is a guest - if so, make them re-authenticate
        if (data.user.isGuest) {
          console.log('Guest user detected - requiring re-authentication');
          currentUser = null; // Clear the current user
          showAuthScreen();
        } else {
          // Registered user - auto-login
          console.log('Registered user detected - auto-login');
          currentUser = data.user;
          refreshSocketSession();
          showMainMenu();
          updatePlayerInfo();
        }
      } else {
        showAuthScreen();
      }
    } catch (error) {
      console.error('Session check failed:', error);
      showAuthScreen();
    }
  }

  function showAuthScreen() {
    authScreen.classList.remove('hidden');
    menu.classList.add('hidden');
    miniLeaderboard.classList.add('hidden');
    showAuthSelection();
  }

  function showMainMenu() {
    authScreen.classList.add('hidden');
    menu.classList.remove('hidden');
    miniLeaderboard.classList.remove('hidden');
  }

  function refreshSocketSession() {
    console.log('Refreshing socket session after authentication...');
    // Add a small delay to ensure the HTTP session is properly set
    setTimeout(() => {
      socket.emit('refreshSession');
    }, 100);
  }

  async function validateCurrentSession() {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();
      
      if (data.authenticated) {
        // Check if current user is a guest - if so, make them re-authenticate
        if (data.user.isGuest && currentUser) {
          console.log('Guest user session expired - requiring re-authentication');
          currentUser = null;
          showAuthScreen();
          return false;
        }
        return true;
      } else {
        currentUser = null;
        showAuthScreen();
        return false;
      }
    } catch (error) {
      console.error('Session validation failed:', error);
      currentUser = null;
      showAuthScreen();
      return false;
    }
  }

  function showAuthSelection() {
    authSelection.classList.remove('hidden');
    loginForm.classList.add('hidden');
    registerForm.classList.add('hidden');
    guestForm.classList.add('hidden');
    authLoading.classList.add('hidden');
  }

  function showLoginForm() {
    authSelection.classList.add('hidden');
    loginForm.classList.remove('hidden');
    document.getElementById('loginEmail').focus();
  }

  function showRegisterForm() {
    authSelection.classList.add('hidden');
    registerForm.classList.remove('hidden');
    document.getElementById('registerUsername').focus();
  }

  function showGuestForm() {
    authSelection.classList.add('hidden');
    guestForm.classList.remove('hidden');
    document.getElementById('guestName').focus();
  }

  function showAuthLoading() {
    authSelection.classList.add('hidden');
    loginForm.classList.add('hidden');
    registerForm.classList.add('hidden');
    guestForm.classList.add('hidden');
    authLoading.classList.remove('hidden');
  }

  function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
  }

  function hideError(elementId) {
    const errorElement = document.getElementById(elementId);
    errorElement.classList.add('hidden');
  }

  function updatePlayerInfo() {
    if (currentUser) {
      const displayName = currentUser.username + (currentUser.isGuest ? ' (Guest)' : '');
      toolbarPlayerName.textContent = displayName;
    }
  }

  async function handleLogin(email, password) {
    try {
      showAuthLoading();
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        currentUser = data.user;
        refreshSocketSession();
        showMainMenu();
        updatePlayerInfo();
      } else {
        showLoginForm();
        showError('loginError', data.error);
      }
    } catch (error) {
      console.error('Login failed:', error);
      showLoginForm();
      showError('loginError', 'Login failed. Please try again.');
    }
  }

  async function handleRegister(username, email, password) {
    try {
      showAuthLoading();
      
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        currentUser = data.user;
        refreshSocketSession();
        showMainMenu();
        updatePlayerInfo();
      } else {
        showRegisterForm();
        showError('registerError', data.error);
      }
    } catch (error) {
      console.error('Registration failed:', error);
      showRegisterForm();
      showError('registerError', 'Registration failed. Please try again.');
    }
  }

  async function handleGuestLogin(name) {
    try {
      showAuthLoading();
      
      const response = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      
      const data = await response.json();
      
      if (data.success) {
        currentUser = data.user;
        refreshSocketSession();
        showMainMenu();
        updatePlayerInfo();
      } else {
        showGuestForm();
        showError('guestError', data.error);
      }
    } catch (error) {
      console.error('Guest login failed:', error);
      showGuestForm();
      showError('guestError', 'Guest login failed. Please try again.');
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      currentUser = null;
      showAuthScreen();
    } catch (error) {
      console.error('Logout failed:', error);
      // Still show auth screen even if logout request failed
      currentUser = null;
      showAuthScreen();
    }
  }

  // Authentication event listeners
  document.getElementById('showLoginBtn').addEventListener('click', showLoginForm);
  document.getElementById('showRegisterBtn').addEventListener('click', showRegisterForm);
  document.getElementById('showGuestBtn').addEventListener('click', showGuestForm);
  
  document.getElementById('backFromLoginBtn').addEventListener('click', showAuthSelection);
  document.getElementById('backFromRegisterBtn').addEventListener('click', showAuthSelection);
  document.getElementById('backFromGuestBtn').addEventListener('click', showAuthSelection);

  document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('loginError');
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    await handleLogin(email, password);
  });

  document.getElementById('registerFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('registerError');
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    await handleRegister(username, email, password);
  });

  document.getElementById('guestFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('guestError');
    const name = document.getElementById('guestName').value;
    await handleGuestLogin(name);
  });

  // Toolbar event listeners
  toolbarLogoutBtn.addEventListener('click', handleLogout);
  toolbarSettingsBtn.addEventListener('click', openSettings);

  // Check authentication on page load
  checkAuthSession();

  // Periodic session validation for guest users (every 5 minutes)
  setInterval(() => {
    if (currentUser && currentUser.isGuest) {
      validateCurrentSession();
    }
  }, 5 * 60 * 1000);

  // Toolbar functionality
  let toolbarVisible = false;
  let toolbarTimeout = null;

  function showToolbar() {
    if (!toolbarVisible && currentUser) {
      toolbarVisible = true;
      topToolbar.classList.add('visible');
    }
    // Clear any existing hide timeout
    if (toolbarTimeout) {
      clearTimeout(toolbarTimeout);
      toolbarTimeout = null;
    }
  }

  function hideToolbar() {
    // Set a delay before hiding to prevent flickering
    if (toolbarTimeout) {
      clearTimeout(toolbarTimeout);
    }
    toolbarTimeout = setTimeout(() => {
      if (toolbarVisible) {
        toolbarVisible = false;
        topToolbar.classList.remove('visible');
      }
    }, 300); // 300ms delay
  }

  function handleMouseMove(e) {
    // Only show toolbar if user is authenticated and not on auth screen
    if (!currentUser || !authScreen.classList.contains('hidden')) {
      return;
    }
    
    // Show toolbar when cursor is near top of screen (within 80px)
    if (e.clientY <= 80) {
      showToolbar();
    } else if (e.clientY > 120) {
      // Hide toolbar when cursor moves away from top area
      hideToolbar();
    }
  }

  // Mouse move tracking for toolbar
  document.addEventListener('mousemove', handleMouseMove);
  
  // Keep toolbar visible when hovering over it
  topToolbar.addEventListener('mouseenter', showToolbar);
  topToolbar.addEventListener('mouseleave', () => {
    // Check if cursor is still in top area
    setTimeout(() => {
      const rect = topToolbar.getBoundingClientRect();
      const isInTopArea = window.event && window.event.clientY <= 120;
      if (!isInTopArea) {
        hideToolbar();
      }
    }, 100);
  });

  // Settings event listeners
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
  
  // Room browser event listeners
  roomBrowserButton.addEventListener('click', openRoomBrowser);
  roomBrowserCloseBtn.addEventListener('click', closeRoomBrowser);
  refreshRoomsButton.addEventListener('click', loadRooms);
  createRoomButton.addEventListener('click', handleCreateRoom);

  // Map editor button
  mapEditorButton.addEventListener('click', () => {
    if (socket && socket.connected) {
      socket.disconnect();
    }
    menu.classList.add('hidden');
    mapEditorContainer.classList.remove('hidden');
    if (typeof initMapEditor === 'function') {
      initMapEditor();
    }
  });
  
  // Close room browser when clicking outside modal
  roomBrowserModal.addEventListener('click', (e) => {
    if (e.target === roomBrowserModal) {
      closeRoomBrowser();
    }
  });
  
  // Update max players value display
  createRoomMaxPlayers.addEventListener('input', (e) => {
    maxPlayersValue.textContent = e.target.value;
  });

  const ctx = gameCanvas.getContext('2d');
  let players = [];
  let mySocketId = null;
  let abilityObjects = [];
  let currentRoomId = null;
  
  // Interpolation state
  let gameStates = []; // Buffer of recent game states
  let interpolationDelay = 50; // ms behind server for smoother interpolation
  
  let inputState = { cursor: { x: 0, y: 0 }, boostActive: false };
  let sendInputInterval = null;
  let hasReceivedFirstState = false; // Flag to prevent rendering before first server data
  
  // Binary encoding support
  let useBinaryEncoding = false;
  let inputSequenceNumber = 0;
  
  // Binary input encoding function
  function encodeBinaryInput(inputData) {
    // Create a compact binary format for input data
    // Structure: [cursorX(4)] [cursorY(4)] [boost(1)] [timestamp(8)] [sequence(4)]
    const buffer = new ArrayBuffer(21);
    const view = new DataView(buffer);
    let offset = 0;
    
    // Cursor position (8 bytes)
    view.setFloat32(offset, inputData.cursor.x, true); offset += 4;
    view.setFloat32(offset, inputData.cursor.y, true); offset += 4;
    
    // Boost state (1 byte)
    view.setUint8(offset, inputData.boostActive ? 1 : 0); offset += 1;
    
    // Timestamp (8 bytes)
    view.setBigUint64(offset, BigInt(inputData.timestamp), true); offset += 8;
    
    // Sequence number (4 bytes)
    view.setUint32(offset, inputData.sequence, true); offset += 4;
    
    return buffer;
  }
  
  // Binary state decoder for server-to-client game state
  function decodeBinaryState(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    
    try {
      // Decode timestamp (8 bytes)
      const timestamp = Number(view.getBigUint64(offset, true)); offset += 8;
      
      // Decode player count (1 byte)
      const playerCount = view.getUint8(offset); offset += 1;
      
      const players = [];
      for (let i = 0; i < playerCount; i++) {
        // Decode basic player data
        const socketId = view.getUint32(offset, true); offset += 4;
        const id = view.getUint32(offset, true); offset += 4;
        const type = view.getUint8(offset); offset += 1; // Car type as number
        
        // Position and rotation (12 bytes)
        const x = view.getFloat32(offset, true); offset += 4;
        const y = view.getFloat32(offset, true); offset += 4;
        const angle = view.getFloat32(offset, true); offset += 4;
        
        // Health data (4 bytes)
        const health = view.getUint16(offset, true); offset += 2;
        const maxHealth = view.getUint16(offset, true); offset += 2;
        
        // Lap data (2 bytes)
        const laps = view.getUint8(offset); offset += 1;
        const maxLaps = view.getUint8(offset); offset += 1;
        
        // Boost data (4 bytes)
        const currentBoost = view.getUint16(offset, true); offset += 2;
        const maxBoost = view.getUint16(offset, true); offset += 2;
        
        // Game state flags (1 byte)
        const upgradePoints = view.getUint8(offset); offset += 1;
        const flags = view.getUint8(offset); offset += 1;
        const crashed = (flags & 1) === 1;
        
        // Crash timestamp (8 bytes) - only if crashed
        let crashedAt = null;
        if (crashed) {
          crashedAt = Number(view.getBigUint64(offset, true)); offset += 8;
        }
        
        // Stats (4 bytes)
        const kills = view.getUint16(offset, true); offset += 2;
        const deaths = view.getUint16(offset, true); offset += 2;
        
        // Convert type number to type string (assuming 0=Stream, 1=Tank, 2=Bullet, 3=Prankster)
        const typeNames = ['Stream', 'Tank', 'Bullet', 'Prankster'];
        const typeName = typeNames[type] || 'Stream';
        
        // Reconstruct full player object with proper property names
        const player = {
          socketId: socketId,
          id: id,
          type: typeName,
          x: x,
          y: y,
          angle: angle,
          health: health, // Ensure this matches client expectations
          maxHealth: maxHealth,
          laps: laps,
          maxLaps: maxLaps,
          currentBoost: currentBoost, // Ensure this matches client expectations
          maxBoost: maxBoost,
          upgradePoints: upgradePoints,
          crashed: crashed,
          crashedAt: crashedAt, // Critical for client crash detection
          kills: kills,
          deaths: deaths,
          // Add default values for properties that client expects
          color: CAR_TYPES[typeName] ? CAR_TYPES[typeName].color : { fill: [100, 100, 100], stroke: [50, 50, 50], strokeWidth: 2 },
          shape: CAR_TYPES[typeName] ? CAR_TYPES[typeName].shape : null,
          vertices: [], // Will be calculated client-side if needed
          checkpointsVisited: [], // Default value
          upgradeUsage: {}, // Default value
          abilityCooldownReduction: 0, // Default value
          name: `Player ${id}` // Default name, will be overridden by server
        };
        
        players.push(player);
      }
      
      // For now, return simplified state structure
      return {
        players: players,
        timestamp: timestamp,
        abilityObjects: [], // Will decode later
        dynamicObjects: [], // Will decode later
        mySocketId: null // Will be set by caller
      };
      
    } catch (error) {
      console.error('Failed to decode binary state:', error);
      return null;
    }
  }
  
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
      
      // Don't stop input interval here - we need it for the fade detection
      // Just zero out the cursor to stop car movement
      inputState.cursor.x = 0;
      inputState.cursor.y = 0;
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
    
    // Also check for players currently marked as crashed (but still in game state)
    for (const currentPlayer of currentPlayers) {
      if (currentPlayer.crashed && !crashedCars.has(currentPlayer.id)) {
        // Car just crashed - add to fade queue
        crashedCars.set(currentPlayer.id, {
          car: currentPlayer,
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
    //console.log(`detecting crashes`)
  }
  
  // Handle returning to menu after player crash fade
  function returnToMenu() {
    console.log('Returning to menu');
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
    boostDisplay.classList.add('hidden');
    
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
    
    // Reset socket ID to avoid confusion on rejoin
    mySocketId = null;
    
    // Hide loading screen when returning to menu
    loadingScreen.classList.add('hidden');
    
    // Restart spectating when back in menu
    setTimeout(() => startSpectating(), 100); // Small delay to ensure UI is ready
  }

  function returnToMenuAfterCrash() {
    console.log('Crash fade completed, returning to menu');
    returnToMenu();
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

  // ============ LEADERBOARD FUNCTIONS ============
  
  function updateMiniLeaderboard(players) {
    if (!players || players.length === 0) {
      miniLeaderboardContent.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); font-size: 10px;">No players</div>';
      return;
    }

    // Sort players by laps (descending), then by best lap time (ascending)
    const sortedPlayers = [...players].sort((a, b) => {
      if (a.laps !== b.laps) return b.laps - a.laps;
      if (a.bestLapTime && b.bestLapTime) return a.bestLapTime - b.bestLapTime;
      if (a.bestLapTime && !b.bestLapTime) return -1;
      if (!a.bestLapTime && b.bestLapTime) return 1;
      return 0;
    });

    // Limit to top 8 players for mini leaderboard
    const topPlayers = sortedPlayers.slice(0, 8);
    
    miniLeaderboardContent.innerHTML = topPlayers.map(player => `
      <div class="mini-leaderboard-entry">
        <div class="mini-leaderboard-player">
          <div class="mini-leaderboard-color" style="background-color: ${player.color}"></div>
          <div class="mini-leaderboard-name">${player.name || 'Unnamed'}</div>
        </div>
        <div class="mini-leaderboard-laps">${player.laps}</div>
      </div>
    `).join('');
  }

  function updateDetailedLeaderboard(players) {
    if (!players || players.length === 0) {
      leaderboardTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: rgba(255,255,255,0.5);">No players in game</td></tr>';
      return;
    }

    // Sort players by laps (descending), then by best lap time (ascending)
    const sortedPlayers = [...players].sort((a, b) => {
      if (a.laps !== b.laps) return b.laps - a.laps;
      if (a.bestLapTime && b.bestLapTime) return a.bestLapTime - b.bestLapTime;
      if (a.bestLapTime && !b.bestLapTime) return -1;
      if (!a.bestLapTime && b.bestLapTime) return 1;
      return 0;
    });

    leaderboardTableBody.innerHTML = sortedPlayers.map((player, index) => {
      const rank = index + 1;
      const kdr = player.kdr;
      let kdrText = '--';
      let kdrClass = '';
      
      if (player.deaths === 0 && player.kills > 0) {
        kdrText = '∞';
        kdrClass = 'stat-kdr-perfect';
      } else if (player.deaths === 0) {
        kdrText = '0.00';
      } else {
        kdrText = kdr.toFixed(2);
        if (kdr >= 2.0) kdrClass = 'stat-kdr-high';
      }

      const bestLapText = player.bestLapTime ? formatTime(player.bestLapTime) : '--';
      const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';

      return `
        <tr>
          <td class="${rankClass}">#${rank}</td>
          <td>
            <div class="leaderboard-player-cell">
              <div class="leaderboard-player-color" style="background-color: ${player.color}"></div>
              <div class="leaderboard-player-name">${player.name || 'Unnamed'}</div>
            </div>
          </td>
          <td>${player.laps}/${player.maxLaps || 3}</td>
          <td class="stat-kills">${player.kills || 0}</td>
          <td class="stat-deaths">${player.deaths || 0}</td>
          <td class="${kdrClass}">${kdrText}</td>
          <td class="stat-best-lap">${bestLapText}</td>
        </tr>
      `;
    }).join('');
  }

  function toggleDetailedLeaderboard() {
    const isHidden = detailedLeaderboard.classList.contains('hidden');
    if (isHidden) {
      detailedLeaderboard.classList.remove('hidden');
    } else {
      detailedLeaderboard.classList.add('hidden');
    }
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
  
  // Room browser variables
  let roomsRefreshInterval = null;
  let availableMaps = [];
  let availableRooms = [];
  
  // Room browser functions
  function openRoomBrowser() {
    roomBrowserModal.classList.remove('hidden');
    loadMaps();
    loadRooms();
    
    // Start auto-refresh
    if (roomsRefreshInterval) {
      clearInterval(roomsRefreshInterval);
    }
    roomsRefreshInterval = setInterval(loadRooms, 3000); // Refresh every 3 seconds
  }
  
  function closeRoomBrowser() {
    roomBrowserModal.classList.add('hidden');
    
    // Stop auto-refresh
    if (roomsRefreshInterval) {
      clearInterval(roomsRefreshInterval);
      roomsRefreshInterval = null;
    }
  }
  
  async function loadMaps() {
    try {
      const response = await fetch('/api/maps');
      if (!response.ok) throw new Error('Failed to load maps');
      
      availableMaps = await response.json();
      
      // Populate map dropdown
      createRoomMap.innerHTML = '';
      availableMaps.forEach(map => {
        const option = document.createElement('option');
        option.value = map.key;
        option.textContent = map.name || map.key;
        if (map.description) {
          option.title = map.description;
        }
        createRoomMap.appendChild(option);
      });
      
      // Select first map by default
      if (availableMaps.length > 0) {
        createRoomMap.value = availableMaps[0].key;
      }
    } catch (error) {
      console.error('Failed to load maps:', error);
    }
  }
  
  async function loadRooms() {
    try {
      const response = await fetch('/api/rooms');
      if (!response.ok) throw new Error('Failed to load rooms');
      
      availableRooms = await response.json();
      displayRooms(availableRooms);
    } catch (error) {
      console.error('Failed to load rooms:', error);
      roomsList.innerHTML = '<div class="error-message">Failed to load rooms. Please try again.</div>';
    }
  }
  
  function displayRooms(rooms) {
    if (rooms.length === 0) {
      roomsList.innerHTML = '<div class="no-rooms-message">No rooms available. Create one below!</div>';
      return;
    }
    
    roomsList.innerHTML = '';
    
    rooms.forEach(room => {
      const roomCard = document.createElement('div');
      roomCard.className = 'room-card';
      
      const isJoinable = room.isJoinable && !room.isPrivate;
      const isFull = room.totalOccupancy >= room.maxPlayers;
      
      roomCard.innerHTML = `
        <div class="room-name">
          ${escapeHtml(room.name)}
          ${room.isPrivate ? '<span class="room-private-badge">Private</span>' : ''}
          ${isFull ? '<span class="room-full-badge">Full</span>' : ''}
        </div>
        <div class="room-info">
          <div class="room-info-row">
            <span>Map:</span>
            <span>${escapeHtml(room.currentMap || 'Unknown')}</span>
          </div>
          <div class="room-info-row">
            <span>Players:</span>
            <span>${room.totalOccupancy || room.playerCount || 0}/${room.maxPlayers}</span>
          </div>
        </div>
        <button class="room-join-button" 
                ${!isJoinable || isFull ? 'disabled' : ''}
                data-room-id="${room.id}">
          ${isFull ? 'Room Full' : isJoinable ? 'Join Room' : 'Private'}
        </button>
      `;
      
      roomsList.appendChild(roomCard);
      
      // Add event listener to join button
      const joinButton = roomCard.querySelector('.room-join-button');
      if (joinButton && !joinButton.disabled) {
        joinButton.addEventListener('click', () => {
          const roomId = joinButton.dataset.roomId;
          joinSpecificRoom(roomId);
        });
      }
    });
  }
  
  function joinSpecificRoom(roomId) {
    closeRoomBrowser();
    
    // Track the room we're joining for crash handling
    currentRoomId = roomId;
    
    // Start spectating the specific room
    socket.emit('requestSpectator', { roomId });
  }
  
  async function handleCreateRoom() {
    const roomName = createRoomName.value.trim();
    const mapKey = createRoomMap.value;
    const maxPlayers = parseInt(createRoomMaxPlayers.value);
    const isPrivate = createRoomPrivate.checked;
    
    // Validation
    if (!roomName) {
      alert('Please enter a room name');
      return;
    }
    
    if (roomName.length > 50) {
      alert('Room name must be 50 characters or less');
      return;
    }
    
    if (!mapKey) {
      alert('Please select a map');
      return;
    }
    
    // Disable button during creation
    createRoomButton.disabled = true;
    createRoomButton.textContent = 'Creating...';
    
    try {
      const response = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: roomName,
          mapKey: mapKey,
          maxPlayers: maxPlayers,
          isPrivate: isPrivate
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create room');
      }
      
      const newRoom = await response.json();
      
      // Clear form
      createRoomName.value = '';
      createRoomMaxPlayers.value = 8;
      maxPlayersValue.textContent = '8';
      createRoomPrivate.checked = false;
      
      // Refresh rooms list
      await loadRooms();
      
      // Auto-join the created room
      joinSpecificRoom(newRoom.id);
      
    } catch (error) {
      console.error('Failed to create room:', error);
      alert(`Failed to create room: ${error.message}`);
    } finally {
      // Re-enable button
      createRoomButton.disabled = false;
      createRoomButton.textContent = 'Create Room';
    }
  }
  
  // Utility function to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
  function startSpectating(roomId) {
    if (!isSpectating) {
      isSpectating = true;
      // Use provided roomId or currentRoomId, or no roomId for default room
      const spectatorData = roomId || currentRoomId ? { roomId: roomId || currentRoomId } : {};
      socket.emit('requestSpectator', spectatorData);
      resizeSpectatorCanvas();
      console.log('Started spectating mode', roomId || currentRoomId ? `in room ${roomId || currentRoomId}` : '');
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
    console.log('Join button clicked', { currentUser, currentRoomId });
    
    // Check if user is authenticated
    if (!currentUser || !currentUser.username) {
      console.error('Cannot join game: User not authenticated or no username');
      alert('Please log in or play as guest first');
      return;
    }
    
    const selected = document.querySelector('input[name="car"]:checked');
    const carType = selected ? selected.value : 'Speedster';
    const name = currentUser.username;
    
    console.log('Emitting joinGame', { carType, name, roomId: currentRoomId });
    socket.emit('joinGame', { carType, name, roomId: currentRoomId });
  });

  socket.on('joinError', (data) => {
    console.error('Join error:', data);
    alert('Could not join game: ' + (data.error || 'Unknown error'));
  });

  socket.on('joined', (data) => {
    console.log('Successfully joined game:', data);
    stopSpectating(); // Stop spectating when joining game
    
    // Track the current room ID for crash handling
    currentRoomId = data.roomId;
    
    // Enable binary encoding if server supports it
    if (data.binarySupport) {
      useBinaryEncoding = true;
      console.log('Binary input encoding enabled');
    } else {
      useBinaryEncoding = false;
    }
    
    // Set player name for chat (we'll get it from the first state update)
    setTimeout(() => {
      const mySocketId = socket.id;
      const latestState = gameStates[gameStates.length - 1];
      if (latestState && latestState.players) {
        const myPlayer = latestState.players.find(p => p.socketId === mySocketId);
        if (myPlayer && myPlayer.name) {
          playerName = myPlayer.name;
          console.log('Player name set for chat:', playerName);
        }
      }
    }, 100);
    
    // Reset crash state immediately when joining new game
    crashedCars.clear();
    lastKnownPlayers = [];
    playerCrashTime = null;
    
    // Clear game state buffers to prevent camera confusion
    gameStates = [];
    hasReceivedFirstState = false;
    
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
      inputSequenceNumber++;
      const timestampedInput = {
        ...inputState,
        timestamp: Date.now(),
        sequence: inputSequenceNumber
      };
      
      if (useBinaryEncoding) {
        try {
          // Use compact binary encoding
          const binaryData = encodeBinaryInput(timestampedInput);
          socket.emit('binaryInput', binaryData);
        } catch (error) {
          console.warn('Binary encoding failed, falling back to JSON:', error);
          socket.emit('input', timestampedInput);
        }
      } else {
        // Fallback to JSON encoding
        socket.emit('input', timestampedInput);
      }
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
    
    // Update leaderboards with latest player data
    updateMiniLeaderboard(data.players);
    updateDetailedLeaderboard(data.players);
    
    // Update player name for chat if not already set
    if (!playerName && data.players) {
      const mySocketId = socket.id;
      const myPlayer = data.players.find(p => p.socketId === mySocketId);
      if (myPlayer && myPlayer.name) {
        playerName = myPlayer.name;
        console.log('Player name updated from state:', playerName);
      }
    }
  });
  
  // Handle binary state updates
  socket.on('binaryState', (buffer, mySocketId) => {
    // Update last message timestamp for connection monitoring
    lastServerMessage = Date.now();
    
    try {
      // Decode binary state data
      const data = decodeBinaryState(buffer);
      if (!data) return; // Failed to decode
      
      // Set the socket ID for this client
      data.mySocketId = mySocketId;
      
      // Detect crashed cars for fade effect
      detectCrashedCars(data.players || []);
      
      // Buffer the state with timestamp for interpolation
      gameStates.push({
        players: data.players,
        abilityObjects: data.abilityObjects || [],
        dynamicObjects: data.dynamicObjects || [],
        timestamp: data.timestamp,
        mySocketId: mySocketId,
        map: currentMap // Use existing map data
      });
      
      // Update myAbility cooldown if player data is available
      const me = data.players.find(p => p.socketId === mySocketId);
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
      
      // Update leaderboards with latest player data
      updateMiniLeaderboard(data.players);
      updateDetailedLeaderboard(data.players);
      
    } catch (error) {
      console.error('Error handling binary state:', error);
    }
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
    
    // Update leaderboards with latest player data
    updateMiniLeaderboard(newPlayers);
    updateDetailedLeaderboard(newPlayers);
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
    
    // Update leaderboards with spectator data
    updateMiniLeaderboard(data.players);
    updateDetailedLeaderboard(data.players);
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
    boostDisplay.classList.add('hidden');
    
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
  });

  gameCanvas.addEventListener('mousemove', (e) => {
    const rect = gameCanvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    inputState.cursor.x = e.clientX - cx;
    inputState.cursor.y = e.clientY - cy;
  });

  // Right-click boost handling
  gameCanvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    inputState.boostActive = true;
  });

  gameCanvas.addEventListener('mouseup', (e) => {
    e.preventDefault();
    inputState.boostActive = false;
  });

  // Chat functionality
  let isChatFocused = false;
  let playerName = '';
  const chatInputArea = document.getElementById('chatInputArea');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');

  function toggleChatInput() {
    isChatFocused = !isChatFocused;
    if (isChatFocused) {
      chatInputArea.classList.remove('hidden');
      chatInput.focus();
    } else {
      chatInputArea.classList.add('hidden');
      chatInput.blur();
      chatInput.value = '';
    }
  }

  function sendChatMessage() {
    const message = chatInput.value.trim();
    console.log('Attempting to send chat message:', { message, playerName, hasMessage: !!message, hasPlayerName: !!playerName });
    
    if (!message) {
      console.log('Chat message blocked: empty message');
      return;
    }
    
    if (!playerName) {
      console.log('Chat message blocked: no player name set');
      // Try to get player name from current game state
      const mySocketId = socket.id;
      const latestState = gameStates[gameStates.length - 1];
      if (latestState && latestState.players) {
        const myPlayer = latestState.players.find(p => p.socketId === mySocketId);
        if (myPlayer && myPlayer.name) {
          playerName = myPlayer.name;
          console.log('Retrieved player name from game state:', playerName);
        }
      }
      
      // Still no name? Block the message
      if (!playerName) {
        console.log('Still no player name available, blocking message');
        return;
      }
    }
    
    console.log('Sending chat message:', { playerName, message });
    socket.emit('chatMessage', { message: message });
    chatInput.value = '';
    toggleChatInput();
  }

  function addChatMessage(playerName, message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `<span class="chat-player-name">${playerName}:</span><span class="chat-message-text">${message}</span>`;
    
    chatMessages.appendChild(messageElement);
    
    // Auto-scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Remove old messages if too many (keep last 50)
    while (chatMessages.children.length > 50) {
      chatMessages.removeChild(chatMessages.firstChild);
    }
  }

  // Socket event for receiving chat messages
  socket.on('chatMessageReceived', (data) => {
    addChatMessage(data.playerName, data.message);
  });

  // Socket event for chat errors
  socket.on('chatError', (data) => {
    console.error('Chat error:', data.error);
  });

  // Chat input specific event handlers
  chatInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      sendChatMessage();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      toggleChatInput();
    }
  });

  // Ability and upgrade input handling
  document.addEventListener('keydown', (e) => {
    // Handle ENTER key for chat
    if (e.code === 'Enter') {
      e.preventDefault();
      
      // If chat input is focused, let its event handler deal with it
      if (e.target === chatInput) {
        return; // Let the chatInput event handler handle this
      }
      
      // Otherwise, toggle chat if not focused
      if (!isChatFocused) {
        toggleChatInput();
      }
      return;
    }

    // Handle ESC key for chat and leaderboard
    if (e.code === 'Escape') {
      if (isChatFocused) {
        toggleChatInput();
        return;
      } else if (!detailedLeaderboard.classList.contains('hidden')) {
        detailedLeaderboard.classList.add('hidden');
        return;
      }
    }

    // Don't process game inputs when chat is focused
    if (isChatFocused) return;

    // Handle TAB key for leaderboard toggle
    if (e.code === 'Tab') {
      e.preventDefault();
      toggleDetailedLeaderboard();
      return;
    }
    
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
      upgradeCard.style.backgroundColor = upgrade.color;
      
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
    
    // Hide lap counter, lap timer, and boost display
    lapCounter.classList.add('hidden');
    lapTimer.classList.add('hidden');
    boostDisplay.classList.add('hidden');
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
    boostDisplay.classList.add('hidden');
    
    showDisconnectionOverlay();
  });

  socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
    hideUpgradeCards();
    
    // Hide all game-specific UI elements on connection error
    abilityHud.classList.add('hidden');
    lapCounter.classList.add('hidden');
    lapTimer.classList.add('hidden');
    boostDisplay.classList.add('hidden');
    
    showDisconnectionOverlay();
  });

  socket.on('reconnect_failed', () => {
    console.log('Reconnection failed');
    hideUpgradeCards();
    
    // Hide all game-specific UI elements on reconnection failure
    abilityHud.classList.add('hidden');
    lapCounter.classList.add('hidden');
    lapTimer.classList.add('hidden');
    boostDisplay.classList.add('hidden');
    
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
    carCard.style.display = 'none';
    switchButton.style.display = 'none';
    joinButton.style.display = 'none';
    
    // Show the menu disconnection warning template
    menuDisconnectionWarning.classList.remove('hidden');
  }

  function hideMenuDisconnectionWarning() {
    // Show the interactive menu elements
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
  
  function calculateScale(canvas, mapBounds, mode = 'player', mapData = null) {
    // If mapData has predefined scale, use it
    if (mapData && mapData.scale && mapData.scale[mode]) {
      return mapData.scale[mode] * Math.min(canvas.width, canvas.height);
    }
    
    // Fallback to dynamic calculation if no predefined scale
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
    const { canvas, mapBounds, mode, centerPlayer, mapData } = options;
    
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
    
    const scale = calculateScale(canvas, mapBounds, mode, mapData);
    
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
      centerPlayer,
      mapData: mapToUse
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

    // Area effects
    if (mapToUse && Array.isArray(mapToUse.areaEffects)) {
      for (const areaEffect of mapToUse.areaEffects) {
        if (Array.isArray(areaEffect.vertices)) {
          ctx.beginPath();
          
          // Set fill color with transparency
          const fillColor = Array.isArray(areaEffect.fillColor) 
            ? `rgba(${areaEffect.fillColor[0]}, ${areaEffect.fillColor[1]}, ${areaEffect.fillColor[2]}, 0.3)`
            : 'rgba(173, 216, 230, 0.3)'; // Default light blue with transparency
          ctx.fillStyle = fillColor;
          
          // Draw area effect shape
          const screenVerts = areaEffect.vertices.map(v => ({
            x: centerX + (v.x - focusX) * scale,
            y: centerY - (v.y - focusY) * scale
          }));
          
          if (screenVerts.length > 0) {
            ctx.moveTo(screenVerts[0].x, screenVerts[0].y);
            for (let i = 1; i < screenVerts.length; i++) {
              ctx.lineTo(screenVerts[i].x, screenVerts[i].y);
            }
            ctx.closePath();
            ctx.fill();
          }
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

    // Start with all active players (non-crashed)
    const allPlayersToRender = [];
    
    // Add active players (not crashed)
    for (const player of players) {
      if (!player.crashed) {
        allPlayersToRender.push(player);
      }
    }
    
    // Add crashed cars with fade effect (only render these, don't use server crashed cars)
    const now = Date.now();
    for (const [carId, crashData] of crashedCars.entries()) {
      const fadeElapsed = now - crashData.fadeStartTime;
      if (fadeElapsed < CRASH_FADE_DURATION) {
        // Add crashed car with fade info - use the stored car data, not server data
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
      } else if (playerCrashTime && p.socketId === mySocketId && p.crashed) {
        // Apply fade to player's own crashed car (only if server says it's crashed)
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
      } else if (playerCrashTime && p.socketId === mySocketId && p.crashed) {
        // Apply fade to player's own crashed car name/health (only if server says it's crashed)
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
      lapsSpan.textContent = `Lap ${centerPlayer.laps + 1} / ${centerPlayer.maxLaps}`;
      
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
      
      // Show lap counter, timer, and boost display whenever in game
      lapCounter.classList.remove('hidden');
      lapTimer.classList.remove('hidden');
      boostDisplay.classList.remove('hidden');
      
      // Update boost display
      if (centerPlayer.currentBoost !== undefined && centerPlayer.maxBoost !== undefined) {
        const currentBoost = Math.round(centerPlayer.currentBoost);
        const maxBoost = centerPlayer.maxBoost;
        const boostPercentage = (currentBoost / maxBoost) * 100;
        
        // Update boost text
        boostText.textContent = `${currentBoost}`;
        
      }
      
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

    if (!me || !players.map(p => p.id).includes(me.id)) {
      console.log(players)
      returnToMenu();
      return;
    }
    
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
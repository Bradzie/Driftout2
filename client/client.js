(() => {
  // DOM helper functions
  function show(element) {
    if (element) element.classList.remove('hidden');
  }

  function hide(element) {
    if (element) element.classList.add('hidden');
  }

  function toggle(element, visible) {
    if (element) element.classList.toggle('hidden', !visible);
  }

  const DEFAULT_FAKE_PING_LATENCY = 100;
  const PING_ONE_WAY_DIVISOR = 2;
  const BASE_XP_LEVEL_1 = 10;
  const XP_SCALE_PER_LEVEL = 1.2;

  let socket = io({
    transports: ['websocket'],
    upgrade: false,
  });
  let currentMap = null;
  let currentUser = null;

  let fakePingEnabled = false;
  let fakePingLatency = DEFAULT_FAKE_PING_LATENCY;
  const originalSocketEmit = socket.emit.bind(socket);

  socket.emit = function(...args) {
    if (fakePingEnabled && fakePingLatency > 0) {
      setTimeout(() => {
        originalSocketEmit(...args);
      }, fakePingLatency / PING_ONE_WAY_DIVISOR);
    } else {
      originalSocketEmit(...args);
    }
  };

  const originalSocketOn = socket.on.bind(socket);
  const wrappedHandlers = new Map();

  socket.on = function(event, handler) {
    if (wrappedHandlers.has(handler)) {
      return originalSocketOn(event, wrappedHandlers.get(handler));
    }

    const wrappedHandler = function(...args) {
      if (fakePingEnabled && fakePingLatency > 0 && event !== 'ping') {
        setTimeout(() => {
          handler(...args);
        }, fakePingLatency / PING_ONE_WAY_DIVISOR);
      } else {
        handler(...args);
      }
    };

    wrappedHandlers.set(handler, wrappedHandler);
    return originalSocketOn(event, wrappedHandler);
  };

  let settings = {
    showFPS: false,
    showPing: false
  };

  function getXPRequiredForLevel(level) {
    // level 1 requires 10 XP, each subsequent level requires 20% more XP
    return Math.round(BASE_XP_LEVEL_1 * Math.pow(XP_SCALE_PER_LEVEL, level - 1));
  }
  
  function calculateLevel(totalXP) {
    if (totalXP < 10) return 1;
    
    let level = 1;
    let xpForCurrentLevel = 0;
    
    while (true) {
      const xpRequiredForNextLevel = getXPRequiredForLevel(level);
      if (xpForCurrentLevel + xpRequiredForNextLevel > totalXP) {
        break;
      }
      xpForCurrentLevel += xpRequiredForNextLevel;
      level++;
    }
    
    return level;
  }
  
  function getXPProgress(totalXP) {
    const currentLevel = calculateLevel(totalXP);
    
    let xpForCurrentLevel = 0;
    for (let i = 1; i < currentLevel; i++) {
      xpForCurrentLevel += getXPRequiredForLevel(i);
    }
    
    // XP needed for next level
    const xpRequiredForNextLevel = getXPRequiredForLevel(currentLevel);
    const xpInCurrentLevel = totalXP - xpForCurrentLevel;
    const progressPercent = (xpInCurrentLevel / xpRequiredForNextLevel) * 100;
    
    return {
      currentLevel,
      xpInCurrentLevel,
      xpRequiredForNextLevel,
      progressPercent: Math.min(100, Math.max(0, progressPercent))
    };
  }
  
  let lastFpsUpdate = 0;
  let frameCount = 0;
  let currentFPS = 0;
  let pingValue = 0;
  let lastPingTime = 0;
  let clockOffset = 0;

  const authScreen = document.getElementById('authScreen');
  const authSelection = document.getElementById('authSelection');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const authLoading = document.getElementById('authLoading');

  const topToolbar = document.getElementById('topToolbar');
  const toolbarPlayerName = document.getElementById('toolbarPlayerName');
  const toolbarLevelProgress = document.getElementById('toolbarLevelProgress');
  const levelProgressFill = document.getElementById('levelProgressFill');
  const toolbarLevelInfo = document.getElementById('toolbarLevelInfo');
  const toolbarBackBtn = document.getElementById('toolbarBackBtn');
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
  const abilityHud = document.getElementById('abilityHud');
  const abilityName = document.getElementById('abilityName');
  
  const lapCounter = document.getElementById('lapCounter');
  const lapTimer = document.getElementById('lapTimer');
  const currentLapTimeSpan = document.getElementById('currentLapTime');
  const bestLapTimeSpan = document.getElementById('bestLapTime');
  
  const boostDisplay = document.getElementById('boostDisplay');
  const boostText = document.getElementById('boostText');
  
  const killFeed = document.getElementById('killFeed');
  
  const miniLeaderboard = document.getElementById('miniLeaderboard');
  const miniLeaderboardContent = document.getElementById('miniLeaderboard').querySelector('.mini-leaderboard-content');
  const detailedLeaderboard = document.getElementById('detailedLeaderboard');
  const leaderboardTableBody = document.getElementById('leaderboardTableBody');
  
  const spectatorCanvas = document.getElementById('spectatorCanvas');
  const spectatorCtx = spectatorCanvas.getContext('2d');

  const loadingScreen = document.getElementById('loadingScreen');
  const disconnectionOverlay = document.getElementById('disconnectionOverlay');
  const menuDisconnectionWarning = document.getElementById('menuDisconnectionWarning');
  
  const settingsModal = document.getElementById('settingsModal');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const fpsToggle = document.getElementById('fpsToggle');
  const pingToggle = document.getElementById('pingToggle');
  const performanceOverlay = document.getElementById('performanceOverlay');
  const fpsDisplay = document.getElementById('fpsDisplay');
  const pingDisplay = document.getElementById('pingDisplay');
  
  const roomBrowserButton = document.getElementById('roomBrowserButton');
  const roomBrowserModal = document.getElementById('roomBrowserModal');
  const roomBrowserCloseBtn = document.getElementById('roomBrowserCloseBtn');
  const refreshRoomsButton = document.getElementById('refreshRoomsButton');
  const roomsList = document.getElementById('roomsList');
  const openCreateRoomButton = document.getElementById('openCreateRoomButton');
  
  const createRoomModal = document.getElementById('createRoomModal');
  const createRoomCloseBtn = document.getElementById('createRoomCloseBtn');
  const createRoomName = document.getElementById('createRoomName');
  const selectedMapDisplay = document.getElementById('selectedMapDisplay');
  const browseMapButton = document.getElementById('browseMapButton');
  const createRoomMaxPlayers = document.getElementById('createRoomMaxPlayers');

  const mapEditorButton = document.getElementById('mapEditorButton');
  const mapEditorContainer = document.getElementById('mapEditorContainer');
  const maxPlayersValue = document.getElementById('maxPlayersValue');
  const createRoomPrivate = document.getElementById('createRoomPrivate');
  const createRoomButton = document.getElementById('createRoomButton');

  const globalLeaderboardButton = document.getElementById('globalLeaderboardButton');
  const globalLeaderboardModal = document.getElementById('globalLeaderboardModal');
  const closeGlobalLeaderboard = document.getElementById('closeGlobalLeaderboard');
  const globalLeaderboardTableBody = document.getElementById('globalLeaderboardTableBody');
  const currentUserRow = document.getElementById('currentUserRow');
  const currentUserLeaderboardBody = document.getElementById('currentUserLeaderboardBody');
  
  const carRadioInput = document.querySelector('input[name="car"]');
  const carName = document.getElementById('carName');
  const carAbility = document.getElementById('carAbility');
  const carShape = document.getElementById('carShape');
  const speedFill = document.getElementById('speedFill');
  const healthFill = document.getElementById('healthFill');
  const handlingFill = document.getElementById('handlingFill');
  
  document.getElementById('disconnectRefreshBtn').addEventListener('click', () => location.reload());
  document.getElementById('menuRefreshBtn').addEventListener('click', () => location.reload());

  async function checkAuthSession() {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();
      
      if (data.authenticated) {
        if (data.user.isGuest) {
          // guests need to re-authenticate every session
          currentUser = null;
        } else {
          // auto-login if registered
          currentUser = data.user;
          refreshSocketSession();
          showMainMenu();
          updatePlayerInfo();
          updateToolbarVisibility();
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
    show(authScreen);
    hide(menu);
    hide(miniLeaderboard);
    showAuthSelection();
  }

  function showMainMenu() {
    hide(authScreen);
    show(menu);
    show(miniLeaderboard);
    
    // Hide map editor button for guest users
    if (currentUser && currentUser.isGuest) {
      mapEditorButton.disabled = true;
    } else {
      mapEditorButton.disabled = false;
    }
    
    loadSettings();
  }
  
  
  
  // fires after auth
  function refreshSocketSession() {
    console.log('Refreshing socket session after authentication...');
    updatePlayerInfo();
    setTimeout(() => {
      if (socket) {
        socket.emit('refreshSession');
        startSpectating();
      }
    }, 100);
  }

  function showAuthSelection() {
    show(authSelection);
    hide(loginForm);
    hide(registerForm);
    hide(authLoading);
    document.getElementById('quickPlayName').focus();
  }

  function showLoginForm() {
    hide(authSelection);
    show(loginForm);
    document.getElementById('loginEmail').focus();
  }

  function showRegisterForm() {
    hide(authSelection);
    show(registerForm);
    document.getElementById('registerUsername').focus();
  }

  function showAuthLoading() {
    hide(authSelection);
    hide(loginForm);
    hide(registerForm);
    show(authLoading);
  }

  function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    show(errorElement);
  }

  function hideError(elementId) {
    const errorElement = document.getElementById(elementId);
    hide(errorElement);
  }

  function updatePlayerInfo() {
    if (currentUser) {
      let displayName = currentUser.username;
      
      if (currentUser.isGuest) {
        displayName += ' (Guest)';
        // guests dont have levels
        hide(toolbarLevelProgress);
      } else {
        // handle xp and level
        const totalXP = currentUser.xp || 0;
        const progress = getXPProgress(totalXP);
        displayName += ` (Level ${progress.currentLevel})`;
        show(toolbarLevelProgress);
        levelProgressFill.style.width = `${progress.progressPercent}%`;
        toolbarLevelInfo.textContent = `${progress.xpInCurrentLevel}/${progress.xpRequiredForNextLevel}`;
      }
      toolbarPlayerName.textContent = displayName;
      playerName = currentUser.username;
      show(chatContainer);
    } else {
      hide(chatContainer);
      hide(toolbarLevelProgress);
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
        updateToolbarVisibility();
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
      const sanitizedUsername = sanitizeName(username);
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: sanitizedUsername, email, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        currentUser = data.user;
        refreshSocketSession();
        showMainMenu();
        updatePlayerInfo();
        updateToolbarVisibility();
      } else {
        showRegisterForm();
        showError('registerError', data.error);
      }
    } catch (error) {
      console.error('Registration failed:', error);
      showRegisterForm();
      // TODO: check styling for showerror, ensure it works with design
      showError('registerError', 'Registration failed. Please try again.');
    }
  }

  // TODO: remnant from old quick play idea, or the regular play btn code? needs to be clarified
  async function handleQuickPlay(name) {
    try {
      showAuthLoading();
      const sanitizedName = sanitizeName(name);

      const response = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: sanitizedName })
      });
      
      const data = await response.json();
      
      if (data.success) {
        currentUser = data.user;
        refreshSocketSession();
        showMainMenu();
        updatePlayerInfo();
        updateToolbarVisibility();
      } else {
        showAuthSelection();
        showError('quickPlayError', data.error);
      }
    } catch (error) {
      console.error('Quick play failed:', error);
      showAuthSelection();
      showError('quickPlayError', 'Quick play failed. Please try again.');
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      currentUser = null;
      showAuthScreen();
      updateToolbarVisibility();
    } catch (error) {
      // if logout fails, go back to auth and clear user anyway
      console.error('Logout failed:', error);
      currentUser = null;
      showAuthScreen();
      updateToolbarVisibility();
    }
  }

  function handleBackToGame() {
    hide(mapEditorContainer);
    show(menu);
    hide(toolbarBackBtn);
    
    try {
      currentRoomId = null;
      
      if (!socket || !socket.connected) {
        socket.connect();
        
        socket.once('connect', () => {
          startSpectating();
        });
        
        // give up connection after 3 seconds
        setTimeout(() => {
          if (!socket || !socket.connected) {
            showMenuDisconnectionWarning();
          }
        }, 3000);
      } else {
        startSpectating();
      }
    } catch (error) {
      console.error('Failed to start spectating after leaving map editor:', error);
      showMenuDisconnectionWarning();
    }
  }

  document.getElementById('showLoginBtn').addEventListener('click', showLoginForm);
  document.getElementById('showRegisterBtn').addEventListener('click', showRegisterForm);
  
  document.getElementById('backFromLoginBtn').addEventListener('click', showAuthSelection);
  document.getElementById('backFromRegisterBtn').addEventListener('click', showAuthSelection);
  
  // quick play handler TODO: is this used? can't remember if this is remnant from the old quick play idea
  document.getElementById('quickPlayForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('quickPlayError');
    const name = document.getElementById('quickPlayName').value;
    await handleQuickPlay(name);
  });

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


  toolbarBackBtn.addEventListener('click', handleBackToGame);
  toolbarLogoutBtn.addEventListener('click', handleLogout);
  toolbarSettingsBtn.addEventListener('click', openSettings);

  checkAuthSession();
  
  loadSettings();
  
  window.addEventListener('resize', updateKillFeedPosition);


  let toolbarVisible = false;
  let toolbarTimeout = null;

  function showToolbar() {
    if (!toolbarVisible && currentUser) {
      toolbarVisible = true;
      topToolbar.classList.add('visible');
    }
    if (toolbarTimeout) {
      clearTimeout(toolbarTimeout);
      toolbarTimeout = null;
    }
  }

  function updateRoomNameDisplay(roomName, map) {
    const roomNameDisplay = document.getElementById('roomNameDisplay');
    const roomNameText = document.getElementById('roomNameText');
    const roomMapText = document.getElementById('roomMapText');
    
    if (!roomNameDisplay || !roomNameText || !roomMapText) {
      return;
    }
    
    if (roomName && map && map.displayName && isSpectating) {
      roomNameText.textContent = roomName;
      roomMapText.textContent = `${map.displayName} by ${map.author || 'Unknown'}`;
      show(roomNameDisplay);
    } else {
      hide(roomNameDisplay);
    }
  }

  function updateToolbarVisibility() {
    if (typeof toolbarVisible === 'undefined' || !topToolbar || !performanceOverlay || !miniLeaderboard) {
      return;
    }
    
    const shouldAlwaysShow = currentUser && currentUser.username && isSpectating;
    
    if (shouldAlwaysShow) {
      // always show for authenticated spectators
      toolbarVisible = true;
      topToolbar.classList.add('visible', 'always-visible');
      performanceOverlay.classList.add('below-toolbar');
      miniLeaderboard.classList.add('below-toolbar');
      if (toolbarTimeout) {
        clearTimeout(toolbarTimeout);
        toolbarTimeout = null;
      }
    } else {
      // revert to hover behavior for active players
      topToolbar.classList.remove('always-visible');
      performanceOverlay.classList.remove('below-toolbar');
      miniLeaderboard.classList.remove('below-toolbar');
      // hide toolbar if not currently being hovered
      const rect = topToolbar.getBoundingClientRect();
      const isHovering = rect.bottom > 0;
      if (!isHovering) {
        toolbarVisible = false;
        topToolbar.classList.remove('visible');
      }
    }
  }

  function hideToolbar() {
    if (currentUser && currentUser.username && isSpectating) {
      return;
    }
    
    if (toolbarTimeout) {
      clearTimeout(toolbarTimeout);
    }
    toolbarTimeout = setTimeout(() => {
      if (toolbarVisible && !(currentUser && currentUser.username && isSpectating)) {
        toolbarVisible = false;
        topToolbar.classList.remove('visible');
      }
    }, 300); // 300ms delay
  }

  function handleMouseMove(e) {
    // only show toolbar if user is authenticated and not on auth screen
    if (!currentUser || !authScreen.classList.contains('hidden')) {
      return;
    }
    
    // show toolbar when cursor is within 80px, hide when beyond 120px
    if (e.clientY <= 80) {
      showToolbar();
    } else if (e.clientY > 120) {
      hideToolbar();
    }
  }

  // mouse move tracking for toolbar
  document.addEventListener('mousemove', handleMouseMove);
  // keep toolbar visible when hovering over it
  topToolbar.addEventListener('mouseenter', showToolbar);
  topToolbar.addEventListener('mouseleave', () => {
    setTimeout(() => {
      const isInTopArea = window.event && window.event.clientY <= 120;
      if (!isInTopArea) {
        hideToolbar();
      }
    }, 100);
  });

  updateToolbarVisibility();

  settingsCloseBtn.addEventListener('click', closeSettings);
  
  // close settings when clicking outside
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettings();
    }
  });
  
  function handleToggleChange(toggleElement, settingKey) {
    return (e) => {
      settings[settingKey] = e.target.checked;
      saveSettings();
      updatePerformanceOverlay();
      updateToolbarVisibility();
    };
  }
  
  function handleSliderClick(toggleElement, settingKey) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleElement.checked = !toggleElement.checked;
      toggleElement.dispatchEvent(new Event('change'));
    };
  }
  
  if (fpsToggle) {
    fpsToggle.addEventListener('change', handleToggleChange(fpsToggle, 'showFPS'));
    
    const fpsSlider = fpsToggle.parentElement?.querySelector('.toggle-slider');
    if (fpsSlider) {
      fpsSlider.addEventListener('click', handleSliderClick(fpsToggle, 'showFPS'));
    }
  } else {
    console.error('fpsToggle element not found!');
  }
  
  if (pingToggle) {
    pingToggle.addEventListener('change', handleToggleChange(pingToggle, 'showPing'));
    
    const pingSlider = pingToggle.parentElement?.querySelector('.toggle-slider');
    if (pingSlider) {
      pingSlider.addEventListener('click', handleSliderClick(pingToggle, 'showPing'));
    }
  } else {
    console.error('pingToggle element not found!');
  }
  
  roomBrowserButton.addEventListener('click', openRoomBrowser);
  roomBrowserCloseBtn.addEventListener('click', closeRoomBrowser);
  refreshRoomsButton.addEventListener('click', loadRooms);
  openCreateRoomButton.addEventListener('click', openCreateRoomModal);
  
  createRoomCloseBtn.addEventListener('click', closeCreateRoomModal);
  createRoomButton.addEventListener('click', handleCreateRoom);
  browseMapButton.addEventListener('click', openMapBrowserForRoom);

  mapEditorButton.addEventListener('click', () => {
    if (socket && socket.connected) {
      socket.disconnect();
    }
    hide(menu);
    show(mapEditorContainer);
    // back btn for map editor only
    show(toolbarBackBtn);
    if (typeof initMapEditor === 'function') {
      initMapEditor();
    }
  });

  globalLeaderboardButton.addEventListener('click', openGlobalLeaderboard);
  closeGlobalLeaderboard.addEventListener('click', closeGlobalLeaderboardModal);

  // close room browser when clicking outside
  roomBrowserModal.addEventListener('click', (e) => {
    if (e.target === roomBrowserModal) {
      closeRoomBrowser();
    }
  });
  
  // close create room dialog when clicking outside
  createRoomModal.addEventListener('click', (e) => {
    if (e.target === createRoomModal) {
      closeCreateRoomModal();
    }
  });

  // close global leaderboard when clicking outside
  globalLeaderboardModal.addEventListener('click', (e) => {
    if (e.target === globalLeaderboardModal) {
      closeGlobalLeaderboardModal();
    }
  });

  // close browse map dialog when clicking outside or ESC
  const browseMapModal = document.getElementById('browseMapModal');
  const closeBrowseModalBtn = document.getElementById('closeBrowseModal');
  
  if (browseMapModal && closeBrowseModalBtn) {
    closeBrowseModalBtn.addEventListener('click', () => {
      hide(browseMapModal);
    });
    
    browseMapModal.addEventListener('click', (e) => {
      if (e.target === browseMapModal) {
        hide(browseMapModal);
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !browseMapModal.classList.contains('hidden')) {
        hide(browseMapModal);
      }
    });
  }
  
  createRoomMaxPlayers.addEventListener('input', (e) => {
    maxPlayersValue.textContent = e.target.value;
  });

  const ctx = gameCanvas.getContext('2d');
  let players = [];
  let mySocketId = null;
  let currentRoomId = null;
  let gameStates = [];
  // ms behind server for smoother interpolation
  let interpolationDelay = 20;
  let inputState = { cursor: { x: 0, y: 0 }, boostActive: false };
  let sendInputInterval = null;
  // to stop any rendering before first state packet
  let hasReceivedFirstState = false;

  // Mobile detection and controls
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || ('ontouchstart' in window)
    || (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
  let joystickActive = false;
  let joystickStartPos = { x: 0, y: 0 };
  let joystickCurrentPos = { x: 0, y: 0 };

  // Function to show/hide mobile controls based on game state
  function updateMobileControlsVisibility() {
    const mobileControls = document.getElementById('mobileControls');
    if (!mobileControls) return;

    // Show mobile controls only when:
    // - Device is mobile
    // - Player is actively in game (sendInputInterval is running)
    // - Chat is not focused
    if (isMobile && sendInputInterval !== null && !isChatFocused) {
      mobileControls.classList.remove('hidden');
    } else {
      mobileControls.classList.add('hidden');
    }
  }
  // TODO: test using the binary encoder, could improve latency and bandwidth
  let useBinaryEncoding = false;
  let inputSequenceNumber = 0;
  // some inputs can be sent on execution (e.g. boost) so it responds slightly faster and isn't bound to the standard input frequency
  let lastInputSendTime = 0;
  const MIN_INPUT_INTERVAL = 1000 / 120; // ~8.33ms max 120Hz

  function encodeBinaryInput(inputData) {
    const buffer = new ArrayBuffer(21);
    const view = new DataView(buffer);
    let offset = 0;
    
    // cursor pos (8 bytes)
    view.setFloat32(offset, inputData.cursor.x, true); offset += 4;
    view.setFloat32(offset, inputData.cursor.y, true); offset += 4;
    
    // boost (1 byte)
    view.setUint8(offset, inputData.boostActive ? 1 : 0); offset += 1;
    
    // timestamp (8 bytes)
    view.setBigUint64(offset, BigInt(inputData.timestamp), true); offset += 8;
    
    // sequence number (4 bytes)
    view.setUint32(offset, inputData.sequence, true); offset += 4;
    
    return buffer;
  }
  
  function decodeBinaryState(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    
    try {
      // timestamp (8 bytes)
      const timestamp = Number(view.getBigUint64(offset, true)); offset += 8;
      
      // player count (1 byte)
      const playerCount = view.getUint8(offset); offset += 1;
      
      const players = [];
      for (let i = 0; i < playerCount; i++) {
        // fundamental info (9 bytes)
        const socketId = view.getUint32(offset, true); offset += 4;
        const id = view.getUint32(offset, true); offset += 4;
        const type = view.getUint8(offset); offset += 1; // car type as number
        
        // position/rotation (12 bytes)
        const x = view.getFloat32(offset, true); offset += 4;
        const y = view.getFloat32(offset, true); offset += 4;
        const angle = view.getFloat32(offset, true); offset += 4;
        
        // health (4 bytes)
        const health = view.getUint16(offset, true); offset += 2;
        const maxHealth = view.getUint16(offset, true); offset += 2;
        
        // laps (2 bytes)
        const laps = view.getUint8(offset); offset += 1;
        const maxLaps = view.getUint8(offset); offset += 1;
        
        // boost (4 bytes)
        const currentBoost = view.getUint16(offset, true); offset += 2;
        const maxBoost = view.getUint16(offset, true); offset += 2;
        
        // game state (1 byte)
        const upgradePoints = view.getUint8(offset); offset += 1;
        const flags = view.getUint8(offset); offset += 1;
        const crashed = (flags & 1) === 1;
        
        // crash timestamp (8 bytes)
        let crashedAt = null;
        if (crashed) {
          crashedAt = Number(view.getBigUint64(offset, true)); offset += 8;
        }
        
        const kills = view.getUint16(offset, true); offset += 2;
        const deaths = view.getUint16(offset, true); offset += 2;
        const typeNames = Object.keys(CAR_TYPES);
        const typeName = typeNames[type] || (typeNames.length > 0 ? typeNames[0] : 'Racer');
        
        // construct player object
        const player = {
          socketId: socketId,
          id: id,
          type: typeName,
          x: x,
          y: y,
          angle: angle,
          health: health,
          maxHealth: maxHealth,
          laps: laps,
          maxLaps: maxLaps,
          currentBoost: currentBoost,
          maxBoost: maxBoost,
          upgradePoints: upgradePoints,
          crashed: crashed,
          crashedAt: crashedAt,
          kills: kills,
          deaths: deaths,
          color: CAR_TYPES[typeName] ? CAR_TYPES[typeName].color : { fill: [100, 100, 100], stroke: [50, 50, 50], strokeWidth: 2 },
          shape: CAR_TYPES[typeName] ? CAR_TYPES[typeName].shape : null,
          vertices: [],
          checkpointsVisited: [],
          upgradeUsage: {},
          abilityCooldownReduction: 0,
          name: `Player ${id}` // default name placeholder, better than nothing, will be overriden by server anyways
        };
        
        players.push(player);
      }
      
      return {
        players: players,
        timestamp: timestamp,
        abilityObjects: [],
        dynamicObjects: [],
        mySocketId: null,
      };
      
    } catch (error) {
      console.error('Failed to decode binary state:', error);
      return null;
    }
  }

  let lastServerMessage = Date.now();
  let currentCarIndex = 0;
  let carTypes = [];
  let CAR_TYPES = {};
  let myAbility = null;
  let lastAbilityUse = 0;
  let abilityChargeState = null;
  let currentLapStartTime = 0;
  let bestLapTime = null;
  let previousLapCount = 0;
  let killFeedMessages = [];
  let messageIdCounter = 0;
  let isTabHeld = false;
  let currentMapKey = null;
  let spectatorState = null;
  let isSpectating = false;

  // crashed car fade effect tracking TODO: feels like this could absoluetely be cleaner
  let crashedCars = new Map(); // carId -> { car: carData, fadeStartTime: timestamp }
  let lastKnownPlayers = [];
  let playerCrashTime = null;
  const CRASH_FADE_DURATION = 500; // 500ms fade
  function detectCrashedCars(currentPlayers) {
    const now = Date.now();
    const currentPlayerIds = new Set(currentPlayers.map(p => p.id));
    
    const myPlayer = currentPlayers.find(p => p.socketId === mySocketId);
    if (myPlayer && myPlayer.crashed && !playerCrashTime) {
      playerCrashTime = now;
      // disable movement input
      inputState.cursor.x = 0;
      inputState.cursor.y = 0;
    }
    
    // find players that were in the last state but not in current state to render crash fade
    for (const previousPlayer of lastKnownPlayers) {
      if (!currentPlayerIds.has(previousPlayer.id) && !crashedCars.has(previousPlayer.id)) {
        crashedCars.set(previousPlayer.id, {
          car: previousPlayer,
          fadeStartTime: now
        });
      }
    }
    
    // also check for players currently marked as crashed (but still in game state)
    for (const currentPlayer of currentPlayers) {
      if (currentPlayer.crashed && !crashedCars.has(currentPlayer.id)) {
        crashedCars.set(currentPlayer.id, {
          car: currentPlayer,
          fadeStartTime: now
        });
      }
    }
    
    lastKnownPlayers = [...currentPlayers];
    
    for (const [carId, crashData] of crashedCars.entries()) {
      if (now - crashData.fadeStartTime > CRASH_FADE_DURATION) {
        crashedCars.delete(carId);
      }
    }
    
    if (playerCrashTime && (now - playerCrashTime) > CRASH_FADE_DURATION) {
      returnToMenuAfterCrash();
    }
  }
  
  // TODO: i've seen other return to menu functions, why do we need so many variations? this needs to be adapted into a unified version
  function returnToMenu() {
    clearInterval(sendInputInterval);
    sendInputInterval = null;
    menu.style.display = 'flex';
    gameCanvas.style.display = 'none';
    hud.style.display = 'none';
    players = [];
    inputState.cursor.x = 0;
    inputState.cursor.y = 0;
    hide(abilityHud);
    hide(lapCounter);
    hide(lapTimer);
    hide(boostDisplay);
    hideUpgradeCards();
    myAbility = null;
    lastAbilityUse = 0;
    // reset lap tracking except best lap time
    currentLapStartTime = 0;
    previousLapCount = 0;
    hasReceivedFirstState = false;
    gameStates = [];
    crashedCars.clear();
    lastKnownPlayers = [];
    playerCrashTime = null;
    mySocketId = null;
    hide(loadingScreen);

    // Hide mobile controls when returning to menu
    updateMobileControlsVisibility();

    setTimeout(() => startSpectating(), 100); // small delay to ensure UI is ready
  }

  function returnToMenuAfterCrash() {
    returnToMenu();
  }

  function formatTime(milliseconds) {
    if (!milliseconds || milliseconds <= 0) return '0:00.000';
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = milliseconds % 1000;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }
  
  function updateMiniLeaderboard(players) {
    if (!players || players.length === 0) {
      miniLeaderboardContent.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); font-size: 10px;">No players</div>';
      return;
    }

    // sort players by laps (descending), then by best lap time (ascending)
    const sortedPlayers = [...players].sort((a, b) => {
      if (a.laps !== b.laps) return b.laps - a.laps;
      if (a.bestLapTime && b.bestLapTime) return a.bestLapTime - b.bestLapTime;
      if (a.bestLapTime && !b.bestLapTime) return -1;
      if (!a.bestLapTime && b.bestLapTime) return 1;
      return 0;
    });

    // mini board caps at 8
    const topPlayers = sortedPlayers.slice(0, 8);
    
    miniLeaderboardContent.innerHTML = topPlayers.map(player => `
      <div class="mini-leaderboard-entry">
        <div class="mini-leaderboard-player">
          <div class="mini-leaderboard-color" style="background-color: ${player.color}"></div>
          <div class="leaderboard-player-color" style="background-color: rgb(${player.color.fill[0]}, ${player.color.fill[1]}, ${player.color.fill[2]}); border: 3px solid rgb(${player.color.stroke[0]}, ${player.color.stroke[1]}, ${player.color.stroke[2]})"></div>
          <div class="mini-leaderboard-name">${player.name || 'Nameless'}</div>
        </div>
        <div class="mini-leaderboard-laps">${player.laps}</div>
      </div>
    `).join('');
  }

  function updateDetailedLeaderboard(players, roomMembers) {
    const allEntries = [];
    const playerSocketIds = new Set();
    
    if (players && players.length > 0) {
      const sortedPlayers = [...players].sort((a, b) => {
        if (a.laps !== b.laps) return b.laps - a.laps;
        if (a.bestLapTime && b.bestLapTime) return a.bestLapTime - b.bestLapTime;
        if (a.bestLapTime && !b.bestLapTime) return -1;
        if (!a.bestLapTime && b.bestLapTime) return 1;
        return 0;
      });
      
      sortedPlayers.forEach((player, index) => {
        playerSocketIds.add(player.socketId);
        allEntries.push({
          type: 'player',
          player: player
        });
      });
    }
    
    if (roomMembers && roomMembers.length > 0) {
      const spectators = roomMembers
        .filter(member => member.state === 'spectating' && !playerSocketIds.has(member.socketId))
        .sort((a, b) => a.joinedAt - b.joinedAt);
      
      spectators.forEach(member => {
        allEntries.push({
          type: 'spectator',
          member: member
        });
      });
    }
    
    if (allEntries.length === 0) {
      leaderboardTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: rgba(255,255,255,0.5);">Room is empty? ):</td></tr>';
      return;
    }

    leaderboardTableBody.innerHTML = allEntries.map((entry) => {
      if (entry.type === 'player') {
        const player = entry.player;
        const rank = entry.rank;

        const kdr = player.deaths === 0 ? (player.kills > 0 ? 999 : 0) : player.kills / player.deaths;
        let kdrText = '--';

        if (player.deaths !== 0 && player.kills > 0) {
          kdrText = kdr.toFixed(2);
        }

        const bestLapText = player.bestLapTime ? formatTime(player.bestLapTime) : '--';
        return `
          <tr>
            <td>
              <div class="leaderboard-player-cell">
                <div class="leaderboard-player-color" style="background-color: rgb(${player.color.fill[0]}, ${player.color.fill[1]}, ${player.color.fill[2]}); border: 3px solid rgb(${player.color.stroke[0]}, ${player.color.stroke[1]}, ${player.color.stroke[2]})"></div>
                <div class="leaderboard-player-name">${player.level ? player.level + ' ' : ''}${player.name || 'Nameless'}</div>
              </div>
            </td>
            <td class="stat-laps">${player.laps || 0}</td>
            <td class="stat-kills">${player.kills || 0}</td>
            <td class="stat-deaths">${player.deaths || 0}</td>
            <td class="stat-kdr">${kdrText}</td>
            <td class="stat-best-lap">${bestLapText}</td>
          </tr>
        `;
      } else if (entry.type === 'spectator') {
        const member = entry.member;

        const kdr = member.deaths === 0 ? (member.kills > 0 ? 999 : 0) : member.kills / member.deaths;
        let kdrText = '--';

        if (member.deaths !== 0 && member.kills > 0) {
          kdrText = kdr.toFixed(2);
        }

        const bestLapText = member.bestLapTime ? formatTime(member.bestLapTime) : '--';

        return `
          <tr class="spectator-row">
            <td>
              <div class="leaderboard-player-cell">
                <div class="leaderboard-player-color spectator-indicator"></div>
                <div class="leaderboard-player-name spectator-name">${member.level ? member.level + ' ' : ''}${member.name || 'Nameless'}</div>
              </div>
            </td>
            <td class="spectator-status">In lobby...</td>
            <td class="stat-kills">${member.kills || 0}</td>
            <td class="stat-deaths">${member.deaths || 0}</td>
            <td class="stat-kdr">${kdrText}</td>
            <td class="stat-best-lap">${bestLapText}</td>
          </tr>
        `;
      }
    }).join('');
  }

  function showDetailedLeaderboard() {
    show(detailedLeaderboard);
  }
  
  function hideDetailedLeaderboard() {
    hide(detailedLeaderboard);
  }

  function loadSettings() {
    try {
      const savedSettings = localStorage.getItem('driftz-settings');
      if (savedSettings) {
        settings = { ...settings, ...JSON.parse(savedSettings) };
      }
    } catch (e) {
      console.error('Failed to load settings from localStorage:', e);
    }
    
    fpsToggle.checked = settings.showFPS;
    pingToggle.checked = settings.showPing;
    updatePerformanceOverlay();
  }
  
  // save to localstorage so we can get them back between sessions
  function saveSettings() {
    try {
      localStorage.setItem('driftz-settings', JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage:', e);
    }
  }
  
  function updatePerformanceOverlay() {
    // show/hide settings options TODO: why does this need to be specfically performance options, not just all settings?
    if (settings.showFPS || settings.showPing) {
      show(performanceOverlay);
    } else {
      hide(performanceOverlay);
    }
    
    if (settings.showFPS) {
      show(fpsDisplay);
    } else {
      hide(fpsDisplay);
    }
    
    if (settings.showPing) {
      show(pingDisplay);
    } else {
      hide(pingDisplay);
    }
    
    updateKillFeedPosition();
  }
  
  function updateKillFeedPosition() {
    requestAnimationFrame(() => {
      if (!killFeed) return;
      
      const hasOverlay = settings.showFPS || settings.showPing;
      
      if (hasOverlay && performanceOverlay && !performanceOverlay.classList.contains('hidden')) {
        const overlayRect = performanceOverlay.getBoundingClientRect();
        const overlayBottom = overlayRect.bottom;
        const killFeedTop = overlayBottom + 10; // 10px gap
        killFeed.style.top = `${killFeedTop}px`;
      } else {
        // default position, probably looks awful but we will also probably never see it
        killFeed.style.top = '20px';
      }
    });
  }
  
  function updateFPS() {
    frameCount++;
    const now = performance.now();
    
    if (now - lastFpsUpdate >= 1000) {
      currentFPS = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      frameCount = 0;
      lastFpsUpdate = now;
      
      if (settings.showFPS) {
        fpsDisplay.textContent = `FPS ${currentFPS}`;
        updateKillFeedPosition();
      }
    }
  }

  // Get current time synchronized with server
  function getServerTime() {
    return Date.now() + clockOffset;
  }

  function updatePing() {
    const now = Date.now();
    if (now - lastPingTime >= 2000 && socket.connected) { // send ping every 2 seconds
      lastPingTime = now;
      const startTime = now;

      socket.emit('ping', startTime, (serverTime) => {
        const endTime = Date.now();
        const realPing = endTime - startTime;
        pingValue = fakePingEnabled ? fakePingLatency : realPing;

        // calculate clock offset
        const estimatedServerTimeNow = serverTime + (realPing / 2);
        const newOffset = estimatedServerTimeNow - endTime;
        const oldOffset = clockOffset;
        clockOffset = clockOffset === 0 ? newOffset : (clockOffset * 0.8 + newOffset * 0.2);

        if (Math.abs(clockOffset) > 100 || (oldOffset === 0 && clockOffset !== 0)) {
          console.log(`clock sync, offset by ${Math.round(clockOffset)}ms`);
        }

        if (settings.showPing) {
          const pingText = fakePingEnabled ? `Ping ~${pingValue}ms` : `Ping ${pingValue}ms`;
          pingDisplay.textContent = pingText;
          updateKillFeedPosition();
        }
      });
    }
  }
  
  function openSettings() {
    show(settingsModal);
  }
  
  function closeSettings() {
    hide(settingsModal);
  }
  
  let roomsRefreshInterval = null;
  let availableRooms = [];
  let selectedMapForRoom = null;
  
  function openRoomBrowser() {
    show(roomBrowserModal);
    loadRooms();
    
    if (roomsRefreshInterval) {
      clearInterval(roomsRefreshInterval);
    }
    roomsRefreshInterval = setInterval(loadRooms, 3000); // refreshes every 3 seconds TODO: if we make this quicker, we probably dont need the manual refresh button anymore
  }
  
  function closeRoomBrowser() {
    hide(roomBrowserModal);
    
    if (roomsRefreshInterval) {
      clearInterval(roomsRefreshInterval);
      roomsRefreshInterval = null;
    }
  }
  
  function openCreateRoomModal() {
    show(createRoomModal);
    selectedMapForRoom = null;
    updateSelectedMapDisplay();
    document.getElementById('createRoomName').focus();
  }
  
  function closeCreateRoomModal() {
    hide(createRoomModal);
  }

  function openGlobalLeaderboard() {
    show(globalLeaderboardModal);
    loadGlobalLeaderboard();
  }

  function closeGlobalLeaderboardModal() {
    hide(globalLeaderboardModal);
  }

  function loadGlobalLeaderboard() {
    fetch('/api/leaderboard')
      .then(res => res.json())
      .then(data => {
        // Display top 100 players
        globalLeaderboardTableBody.innerHTML = '';
        data.leaderboard.forEach((player, index) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${index + 1}</td>
            <td>${player.username}</td>
            <td>${player.level}</td>
            <td>${player.kills || 0}</td>
            <td>${player.deaths || 0}</td>
            <td>${player.wins || 0}</td>
          `;
          globalLeaderboardTableBody.appendChild(row);
        });

        // Display current user row if they're a registered user
        if (data.currentUser) {
          currentUserLeaderboardBody.innerHTML = '';
          const userRow = document.createElement('tr');
          userRow.innerHTML = `
            <td>${data.currentUser.rank}</td>
            <td>${data.currentUser.username}</td>
            <td>${data.currentUser.level}</td>
            <td>${data.currentUser.kills || 0}</td>
            <td>${data.currentUser.deaths || 0}</td>
            <td>${data.currentUser.wins || 0}</td>
          `;
          currentUserLeaderboardBody.appendChild(userRow);
          currentUserRow.classList.remove('hidden');
        } else {
          currentUserRow.classList.add('hidden');
        }
      })
      .catch(error => {
        console.error('Failed to load leaderboard:', error);
        globalLeaderboardTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Failed to load leaderboard</td></tr>';
      });
  }

  let allMapsData = [];

  function openMapBrowserForRoom() {
    const modal = document.getElementById('browseMapModal');
    show(modal);

    // load maps
    fetch('/api/maps')
      .then(res => res.json())
      .then(maps => {
        allMapsData = maps;
        setupMapFilters();
        displayMapsForRoomCreation(maps);
      })
      .catch(error => {
        console.error('Error loading maps:', error);
        document.getElementById('mapsGrid').innerHTML = '<p class="no-maps-message">Error loading maps</p>';
      });
  }

  function setupMapFilters() {
    const searchInput = document.getElementById('mapSearchInput');
    const officialToggle = document.getElementById('showOfficialToggle');
    const communityToggle = document.getElementById('showCommunityToggle');
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    const newOfficialToggle = officialToggle.cloneNode(true);
    officialToggle.parentNode.replaceChild(newOfficialToggle, officialToggle);
    const newCommunityToggle = communityToggle.cloneNode(true);
    communityToggle.parentNode.replaceChild(newCommunityToggle, communityToggle);

    newSearchInput.addEventListener('input', filterAndDisplayMaps);
    newOfficialToggle.addEventListener('change', filterAndDisplayMaps);
    newCommunityToggle.addEventListener('change', filterAndDisplayMaps);
  }

  function filterAndDisplayMaps() {
    const searchTerm = document.getElementById('mapSearchInput').value.toLowerCase();
    const showOfficial = document.getElementById('showOfficialToggle').checked;
    const showCommunity = document.getElementById('showCommunityToggle').checked;

    const filteredMaps = allMapsData.filter(map => {
      const category = map.category || (map.key.includes('official/') ? 'official' : 'community');
      const categoryMatch = (category === 'official' && showOfficial) || (category === 'community' && showCommunity);

      if (!categoryMatch) return false;
      if (searchTerm) {
        const nameMatch = map.name.toLowerCase().includes(searchTerm);
        const descMatch = (map.description || '').toLowerCase().includes(searchTerm);
        const authorMatch = (map.author || '').toLowerCase().includes(searchTerm);
        return nameMatch || descMatch || authorMatch;
      }

      return true;
    });

    displayMapsForRoomCreation(filteredMaps);
  }

  function displayMapsForRoomCreation(maps) {
    const grid = document.getElementById('mapsGrid');
    const countText = document.getElementById('mapCountText');
    countText.textContent = `${maps.length} map${maps.length !== 1 ? 's' : ''}`;

    if (maps.length === 0) {
      grid.innerHTML = '<p class="no-maps-message">No maps found matching your filters</p>';
      return;
    }

    grid.innerHTML = maps.map(map => {
      const category = map.category || (map.key.includes('official/') ? 'official' : 'community');
      const author = map.author || (category === 'official' ? 'Official' : 'Community');
      const previewImageUrl = map.id ? `/previews/${map.id}.png` : `/previews/${map.key.replace(/\//g, '_')}.png`;

      return `
        <div class="map-entry" data-map-key="${map.key}" onclick="selectMapForRoom('${map.key}', '${map.name}')">
          <div class="map-preview">
            <img src="${previewImageUrl}" alt="${map.name} preview" class="preview-image"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="no-preview" style="display: none;">No preview</div>
          </div>
          <div class="map-info">
            <h4 class="map-name">${map.name}</h4>
            <p class="map-author">Author: ${author}</p>
            <p class="map-category">${category.charAt(0).toUpperCase() + category.slice(1)}</p>
          </div>
        </div>
      `;
    }).join('');
  }
  
  function selectMapForRoom(key, name) {
    selectedMapForRoom = { key, name };
    updateSelectedMapDisplay();
    document.getElementById('browseMapModal').classList.add('hidden');
  }
  
  function updateSelectedMapDisplay() {
    if (selectedMapForRoom) {
      selectedMapDisplay.innerHTML = `
        <div class="selected-map-info">
          <span class="selected-map-name">${selectedMapForRoom.name}</span>
          <button type="button" class="clear-map-btn" onclick="clearSelectedMap()">×</button>
        </div>
      `;
    } else {
      selectedMapDisplay.innerHTML = '<span class="no-map-selected">No map selected</span>';
    }
  }
  
  function clearSelectedMap() {
    selectedMapForRoom = null;
    updateSelectedMapDisplay();
  }
  
  // expose functions globally for HTML onclick handlers
  window.selectMapForRoom = selectMapForRoom;
  window.clearSelectedMap = clearSelectedMap;
  
  
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
      
      // generate players list in room browser TODO: needs testing, not even sure how it looks
      const playersList = room.playersList || [];
      let playersHtml = '';
      
      if (playersList.length === 0) {
        playersHtml = '<div class="no-players">No players online</div>';
      } else {
        playersHtml = playersList.map(player => escapeHtml(player)).join(', ');
        if (playersList.length > 5) {
          const displayedPlayers = playersList.slice(0, 5);
          const remainingCount = playersList.length - 5;
          playersHtml = displayedPlayers.map(player => escapeHtml(player)).join(', ') + `, +${remainingCount} more`;
        }
      }
      
      roomCard.innerHTML = `
        <div class="room-card-content">
          <div class="room-preview-container">
            <img class="room-map-preview" src="${room.mapPreviewUrl || ''}" alt="Map preview" 
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
            <div class="room-map-placeholder" style="display: none;">
              <span>No Preview</span>
            </div>
          </div>
          <div class="room-details">
            <div class="room-name">
              ${escapeHtml(room.name)}
              ${room.isPrivate ? '<span class="room-private-badge">Private</span>' : ''}
              ${isFull ? '<span class="room-full-badge">Full</span>' : ''}
            </div>
            <div class="room-info">
              <div class="room-info-row">
                <span>Map:</span>
                <span>${escapeHtml(room.mapDisplayName || 'Unknown')}</span>
              </div>
              <div class="room-info-row">
                <span>Players:</span>
                <span>${room.totalOccupancy || room.playerCount || 0}/${room.maxPlayers}</span>
              </div>
            </div>
            <div class="room-players-list">
              ${playersHtml}
            </div>
          </div>
        </div>
        <button class="room-join-button" 
                ${!isJoinable || isFull ? 'disabled' : ''}
                data-room-id="${room.id}">
          ${isFull ? 'Room Full' : isJoinable ? 'Join Room' : 'Private'}
        </button>
      `;
      
      roomsList.appendChild(roomCard);
      
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
    currentRoomId = roomId;
    currentMapKey = null;
    socket.emit('requestSpectator', { roomId });
  }
  
  async function handleCreateRoom() {
    const roomName = createRoomName.value.trim();
    const mapKey = selectedMapForRoom?.key;
    const maxPlayers = parseInt(createRoomMaxPlayers.value);
    const isPrivate = createRoomPrivate.checked;
    
    // :TODO these alerts are not nice, replace with in-dialog error display that follows design
    if (!roomName) {
      alert('Please enter a room name');
      return;
    }
    
    if (!selectedMapForRoom) {
      alert('Please select a map');
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
    
    // disable button during creation
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
      
      createRoomName.value = '';
      selectedMapForRoom = null;
      updateSelectedMapDisplay();
      createRoomMaxPlayers.value = 8;
      maxPlayersValue.textContent = '8';
      createRoomPrivate.checked = false;
      
      // close create room dialog
      closeCreateRoomModal();
      // refresh room list
      await loadRooms();
      // auto-join new room
      joinSpecificRoom(newRoom.id);
      
    } catch (error) {
      console.error('Failed to create room:', error);
    } finally {
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
  
  function addKillFeedMessage(text, type = 'info') {
    const messageId = messageIdCounter++;
    const message = {
      id: messageId,
      text: text,
      type: type,
      timestamp: Date.now()
    };
    
    killFeedMessages.unshift(message);
    
    // caps at 5
    if (killFeedMessages.length > 5) {
      killFeedMessages = killFeedMessages.slice(0, 5);
    }
    
    renderKillFeed();
    
    // messages last 5 seconds
    setTimeout(() => {
      removeKillFeedMessage(messageId);
    }, 5000);
  }
  
  function showMapNotification(map) {
    if (!map) return;
    
    const mapName = map.displayName || map.name || 'Unknown Map';
    const mapAuthor = map.author || 'Unknown Author';
    const message = `Map: ${mapName} by ${mapAuthor}`;
    
    addKillFeedMessage(message, 'info');
  }
  
  function removeKillFeedMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.classList.add('fade-out');
      setTimeout(() => {
        killFeedMessages = killFeedMessages.filter(msg => msg.id !== messageId);
        renderKillFeed();
      }, 300); // kill feed messages have a 300ms fade-out animation
    }
  }
  
  function renderKillFeed() {
    killFeed.innerHTML = '';
    
    if (killFeedMessages.length === 0) {
      hide(killFeed);
      return;
    }
    
    show(killFeed);
    
    killFeedMessages.forEach(message => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `kill-feed-message ${message.type}`;
      messageDiv.setAttribute('data-message-id', message.id);
      messageDiv.textContent = message.text;
      killFeed.appendChild(messageDiv);
    });
  }
  
  function startSpectating(roomId) {
    if (!isSpectating) {
      isSpectating = true;
      
      const targetRoomId = roomId || currentRoomId;
      if (targetRoomId) {
        currentRoomId = targetRoomId;
      }
      
      // TODO: defaulting to an empty object here feels like something could explode, needs testing
      const spectatorData = targetRoomId ? { roomId: targetRoomId } : {};
      socket.emit('requestSpectator', spectatorData);
      resizeSpectatorCanvas();
      updateToolbarVisibility();
    }
  }
  
  function stopSpectating() {
    isSpectating = false;
    spectatorState = null;
    spectatorCtx.clearRect(0, 0, spectatorCanvas.width, spectatorCanvas.height);
    updateToolbarVisibility();
    updateRoomNameDisplay(null, null);
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

  async function initCarSelection() {
    try {
      const response = await fetch('/api/carTypes');
      CAR_TYPES = await response.json();
      carTypes = Object.keys(CAR_TYPES);
      currentCarIndex = 0;
      updateCarCard();
      
      loadSettings();
    } catch (error) {
      console.error('Failed to load car types:', error);
      carCard.innerHTML = '<p>Failed to load car types. Please refresh the page.</p>';
    }
  }

  // render car TODO: can we get those smooth edges that the in-game canvas has?
  function updateCarCard() {
    const carType = carTypes[currentCarIndex];
    const car = CAR_TYPES[carType];
    
    carRadioInput.value = carType;
    carName.textContent = car.displayName || carType;
    carAbility.textContent = car.abilityName || 'No Ability';

    carShape.innerHTML = '';
    car.shapes.forEach((shape, index) => {
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const points = shape.vertices.map(v => `${v.x * 1.5},${-v.y * 1.5}`).join(' ');
      const shapeColor = shape.color || car.color;
      
      polygon.setAttribute('points', points);
      polygon.setAttribute('fill', `rgb(${shapeColor.fill.join(',')})`);
      polygon.setAttribute('stroke', `rgb(${shapeColor.stroke.join(',')})`);
      polygon.setAttribute('stroke-width', shapeColor.strokeWidth * 1.5 || 4);
      polygon.setAttribute('stroke-linejoin', 'round');
      polygon.setAttribute('stroke-linecap', 'round');
      
      carShape.appendChild(polygon);
    });
    
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
    let sanitized = name.replace(/[\x00-\x1F\x7F]/g, '');

    // regex targets unicode diacritical marks (U+0300 to U+036F) and similar spam
    sanitized = sanitized.replace(/[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]+/g, '');
    sanitized = sanitized.trim().substring(0, 20); // limit to 20 chars

    return sanitized || 'Unnamed';
  }

  joinButton.addEventListener('click', () => {
    
    if (!currentUser || !currentUser.username) {
      console.error('Cannot join game: User not authenticated or no username');
      return;
    }
    
    const selected = document.querySelector('input[name="car"]:checked');
    const carType = selected ? selected.value : 'Racer';
    const name = currentUser.username;

    socket.emit('joinGame', { carType, name, roomId: currentRoomId });
  });

  socket.on('joinError', (data) => {
    console.error('Join error:', data);
  });

  socket.on('joined', (data) => {
    stopSpectating();
    currentRoomId = data.roomId;
    
    // try binary encoding if decided by server
    if (data.binarySupport) {
      useBinaryEncoding = true;
    } else {
      useBinaryEncoding = false;
    }
    
    setTimeout(() => {
      const mySocketId = socket.id;
      const latestState = gameStates[gameStates.length - 1];
      if (latestState && latestState.players) {
        const myPlayer = latestState.players.find(p => p.socketId === mySocketId);
        if (myPlayer && myPlayer.name) {
          playerName = myPlayer.name;
        }
      }
    }, 100);
    
    // small cleanup when joining
    crashedCars.clear();
    lastKnownPlayers = [];
    playerCrashTime = null;
    gameStates = [];
    hasReceivedFirstState = false;
    
    menu.style.display = 'none';
    show(loadingScreen);
    gameCanvas.style.display = 'block';
    hud.style.display = 'flex';
    
    const selectedCar = document.querySelector('input[name="car"]:checked');
    if (selectedCar && CAR_TYPES[selectedCar.value]) {
      const carType = CAR_TYPES[selectedCar.value];
      const carTypeName = selectedCar.value;
      
      generateUpgradeCards(carTypeName);
      
      if (carType.ability) {
        myAbility = {
          name: carType.abilityName || carType.ability,
          cooldown: carType.abilityCooldown || 0,
        };
        show(abilityHud);
        updateAbilityHUD();
      } else {
        myAbility = null;
        hide(abilityHud);
      }
    }

    // send input instantly rather than waiting for frequency interval (could be up to 16ms faster)
    function sendInput() {
      const now = Date.now();
      if (now - lastInputSendTime < MIN_INPUT_INTERVAL) {
        return; // we do not tolerate spam, real gangsters wait for the frequency interval
      }

      lastInputSendTime = now;
      inputSequenceNumber++;
      const timestampedInput = {
        ...inputState,
        timestamp: now,
        sequence: inputSequenceNumber
      };

      if (useBinaryEncoding) {
        try {
          // binary encoding
          const binaryData = encodeBinaryInput(timestampedInput);
          socket.emit('binaryInput', binaryData);
        } catch (error) {
          console.warn('Binary encoding failed, trying JSON instead:', error);
          socket.emit('input', timestampedInput);
        }
      } else {
        // default to JSON instead of binary
        socket.emit('input', timestampedInput);
      }
    }

    // constant input send at 60Hz (every ~16.67ms per update)
    sendInputInterval = setInterval(() => {
      sendInput();
    }, 1000 / 60);

    // Show mobile controls when game starts
    updateMobileControlsVisibility();
  });

  socket.on('state', (data) => {
    lastServerMessage = Date.now();

    // process crash sequences
    detectCrashedCars(data.players || []);
  
    gameStates.push({
      players: data.players,
      abilityObjects: data.abilityObjects || [],
      dynamicObjects: data.dynamicObjects || [],
      timestamp: data.timestamp || Date.now(),
      mySocketId: data.mySocketId,
      map: data.map
    });

    const me = data.players.find(p => p.socketId === data.mySocketId);
    if (me && myAbility) {
      const carDef = CAR_TYPES[me.type];
      const baseCooldown = carDef.abilityCooldown || 0;
      myAbility.cooldown = Math.max(0, baseCooldown - (me.abilityCooldownReduction || 0));
      abilityChargeState = me.chargeState || null;
    }

    hasReceivedFirstState = true;
    hide(loadingScreen);

    // keep 1 second of game states
    const now = Date.now();
    gameStates = gameStates.filter(state => (now - state.timestamp) < 1000);

    if (data.map) {
      // we need a map key to handle the same map in different rooms
      const newMapKey = `${currentRoomId}_${generateMapKey(data.map)}`;
      if (newMapKey !== currentMapKey) {
        currentMapKey = newMapKey;
        bestLapTime = null;
        bestLapTimeSpan.textContent = '';
        showMapNotification(data.map);
      }
      currentMap = data.map;
    }
    
    updateMiniLeaderboard(data.players);
    updateDetailedLeaderboard(data.players, data.roomMembers);
    
    if (!playerName && data.players) {
      const mySocketId = socket.id;
      const myPlayer = data.players.find(p => p.socketId === mySocketId);
      if (myPlayer && myPlayer.name) {
        playerName = myPlayer.name;
      }
    }
  });
  
  socket.on('binaryState', (buffer, mySocketId) => {
    lastServerMessage = Date.now();
    
    try {
      const data = decodeBinaryState(buffer);
      if (!data) return;
      
      data.mySocketId = mySocketId;
      
      // process crash sequences
      detectCrashedCars(data.players || []);
      
      gameStates.push({
        players: data.players,
        abilityObjects: data.abilityObjects || [],
        dynamicObjects: data.dynamicObjects || [],
        timestamp: data.timestamp,
        mySocketId: mySocketId,
        map: currentMap
      });
      
      const me = data.players.find(p => p.socketId === mySocketId);
      if (me && myAbility) {
        const carDef = CAR_TYPES[me.type];
        const baseCooldown = carDef.abilityCooldown || 0;
        myAbility.cooldown = Math.max(0, baseCooldown - (me.abilityCooldownReduction || 0));
        // Update charge state
        cannonCharge = me.cannonCharge !== undefined ? me.cannonCharge : 100;
        cannonCharging = me.cannonCharging || false;
      }

      hasReceivedFirstState = true;
      hide(loadingScreen);

      // keep 1 second of game states
      const now = Date.now();
      gameStates = gameStates.filter(state => (now - state.timestamp) < 1000);
      
      updateMiniLeaderboard(data.players);
      updateDetailedLeaderboard(data.players, data.roomMembers);
      
    } catch (error) {
      console.error('Error handling binary state:', error);
    }
  });

  socket.on('delta', (data) => {
    lastServerMessage = Date.now();
    
    const lastState = gameStates[gameStates.length - 1];
    if (!lastState) return;

    const newPlayers = [...lastState.players];
    
    data.players.forEach(deltaPlayer => {
      const existingIndex = newPlayers.findIndex(p => p.id === deltaPlayer.id);
      
      if (deltaPlayer.isFullUpdate) {
        if (existingIndex >= 0) {
          newPlayers[existingIndex] = deltaPlayer;
        } else {
          newPlayers.push(deltaPlayer);
        }
      } else {
        if (existingIndex >= 0) {
          newPlayers[existingIndex] = { ...newPlayers[existingIndex], ...deltaPlayer };
        }
      }
    });
    
    // process crash sequences
    detectCrashedCars(newPlayers);

    gameStates.push({
      players: newPlayers,
      abilityObjects: data.abilityObjects || lastState.abilityObjects,
      dynamicObjects: data.dynamicObjects || lastState.dynamicObjects || [],
      timestamp: data.timestamp || Date.now(),
      mySocketId: data.mySocketId || lastState.mySocketId,
      map: lastState.map
    });

    const me = newPlayers.find(p => p.socketId === (data.mySocketId || lastState.mySocketId));
    if (me && myAbility) {
      const carDef = CAR_TYPES[me.type];
      const baseCooldown = carDef.abilityCooldown || 0;
      myAbility.cooldown = Math.max(0, baseCooldown - (me.abilityCooldownReduction || 0));
      abilityChargeState = me.chargeState || null;
    }

    hasReceivedFirstState = true;
    hide(loadingScreen);

    // keep 1 second of game states
    const now = Date.now();
    gameStates = gameStates.filter(state => (now - state.timestamp) < 1000);
    updateMiniLeaderboard(newPlayers);
    updateDetailedLeaderboard(newPlayers, data.roomMembers);

  });

  socket.on('heartbeat', (data) => {
    lastServerMessage = Date.now();
    // we need a time to keep the interpolation buffer synced
    const lastState = gameStates[gameStates.length - 1];
    if (lastState) {
      gameStates.push({
        ...lastState,
        timestamp: data.timestamp || Date.now()
      });
    }
  });

  socket.on('killFeedMessage', ({ text, type }) => {
    addKillFeedMessage(text, type);
  });

  socket.on('spectatorState', (data) => {
    spectatorState = data;
    
    if (data.roomId && data.roomId !== currentRoomId) {
      currentRoomId = data.roomId;
    }
    
    updateRoomNameDisplay(data.roomName, data.map);

    if (data.map) {
      // we need a map key to handle the same map in different rooms
      const newMapKey = `${currentRoomId}_${generateMapKey(data.map)}`;
      // we can also use it to detect map changes
      if (newMapKey !== currentMapKey) {
        currentMapKey = newMapKey;
        bestLapTime = null;
        bestLapTimeSpan.textContent = '';
        showMapNotification(data.map);
      }
      currentMap = data.map;
    }
    
    updateMiniLeaderboard(data.players);
    updateDetailedLeaderboard(data.players, data.roomMembers);
  });

  socket.on('returnToMenu', ({ winner, crashed }) => {
    // no returning until crash sequence is over
    if (crashed) return;
    // big ol cleanup
    clearInterval(sendInputInterval);
    sendInputInterval = null;
    menu.style.display = 'flex';
    gameCanvas.style.display = 'none';
    hud.style.display = 'none';
    players = [];
    inputState.cursor.x = 0;
    inputState.cursor.y = 0;
    myAbility = null;
    lastAbilityUse = 0;
    // reset all lap vars except bestLapTime
    currentLapStartTime = 0;
    previousLapCount = 0;
    hasReceivedFirstState = false;
    gameStates = [];
    crashedCars.clear();
    lastKnownPlayers = [];
    // hide all game-specific UI elements
    hideUpgradeCards();
    hide(abilityHud);
    hide(lapCounter);
    hide(lapTimer);
    hide(boostDisplay);
    hide(loadingScreen);
    
    // set to spectator, small delay to allow UI to catch up
    setTimeout(() => startSpectating(), 100);
  });

  gameCanvas.addEventListener('mousemove', (e) => {
    const rect = gameCanvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    inputState.cursor.x = e.clientX - cx;
    inputState.cursor.y = e.clientY - cy;
    // instant input send
    if (typeof sendInput === 'function') sendInput();
  });

  gameCanvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    inputState.boostActive = true;
    // instant input send
    if (typeof sendInput === 'function') sendInput();
  });

  gameCanvas.addEventListener('mouseup', (e) => {
    e.preventDefault();
    inputState.boostActive = false;
    // also instant input send
    if (typeof sendInput === 'function') sendInput();
  });

  document.addEventListener('mousemove', (e) => {
    if (isSpectating && !menu.classList.contains('hidden')) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const fadeStartDistance = 400;
      const fadeEndDistance = 600;

      let opacity = 1;
      if (distance > fadeStartDistance) {
        const fadeProgress = Math.min(1, (distance - fadeStartDistance) / (fadeEndDistance - fadeStartDistance));
        opacity = 1 - fadeProgress;
      }

      menu.style.opacity = opacity;
    } else if (!menu.classList.contains('hidden')) {
      menu.style.opacity = 1;
    }
  });

  // Mobile Virtual Joystick
  if (isMobile) {
    const joystick = document.getElementById('mobileJoystick');
    const joystickKnob = document.querySelector('.joystick-knob');
    const JOYSTICK_RADIUS = 75; // Half of 150px diameter
    const KNOB_RADIUS = 30; // Half of 60px diameter
    const MAX_DISTANCE = JOYSTICK_RADIUS - KNOB_RADIUS;

    function updateJoystickPosition(touch) {
      const rect = joystick.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Calculate distance from center
      const deltaX = touch.clientX - centerX;
      const deltaY = touch.clientY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Clamp to max distance
      const clampedDistance = Math.min(distance, MAX_DISTANCE);
      const angle = Math.atan2(deltaY, deltaX);

      // Update knob position
      const knobX = Math.cos(angle) * clampedDistance;
      const knobY = Math.sin(angle) * clampedDistance;
      joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

      // Convert to cursor coordinates (scale to reasonable game movement)
      const CURSOR_SCALE = 200; // Max cursor distance from center
      const normalizedDistance = clampedDistance / MAX_DISTANCE;
      inputState.cursor.x = Math.cos(angle) * normalizedDistance * CURSOR_SCALE;
      inputState.cursor.y = Math.sin(angle) * normalizedDistance * CURSOR_SCALE;

      // Instant input send
      if (typeof sendInput === 'function') sendInput();
    }

    joystick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      joystickActive = true;
      joystickKnob.classList.add('active');

      const touch = e.touches[0];
      joystickStartPos = { x: touch.clientX, y: touch.clientY };
      updateJoystickPosition(touch);
    }, { passive: false });

    joystick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!joystickActive) return;

      const touch = e.touches[0];
      joystickCurrentPos = { x: touch.clientX, y: touch.clientY };
      updateJoystickPosition(touch);
    }, { passive: false });

    joystick.addEventListener('touchend', (e) => {
      e.preventDefault();
      joystickActive = false;
      joystickKnob.classList.remove('active');

      // Reset knob to center
      joystickKnob.style.transform = 'translate(-50%, -50%)';

      // Reset cursor to neutral
      inputState.cursor.x = 0;
      inputState.cursor.y = 0;

      // Instant input send
      if (typeof sendInput === 'function') sendInput();
    }, { passive: false });

    joystick.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      joystickActive = false;
      joystickKnob.classList.remove('active');
      joystickKnob.style.transform = 'translate(-50%, -50%)';
      inputState.cursor.x = 0;
      inputState.cursor.y = 0;
      if (typeof sendInput === 'function') sendInput();
    }, { passive: false });

    // Mobile Boost Button
    const boostButton = document.getElementById('mobileBoostButton');
    boostButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      inputState.boostActive = true;
      if (typeof sendInput === 'function') sendInput();
    }, { passive: false });

    boostButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      inputState.boostActive = false;
      if (typeof sendInput === 'function') sendInput();
    }, { passive: false });

    boostButton.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      inputState.boostActive = false;
      if (typeof sendInput === 'function') sendInput();
    }, { passive: false });

    // Mobile Ability Button (charge-based)
    const abilityButton = document.getElementById('mobileAbilityButton');
    abilityButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      // Visual feedback
      abilityButton.style.transform = 'scale(0.9)';
      // Emit ability start for charge-based abilities
      socket.emit('abilityStart');
    }, { passive: false });

    abilityButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      // Reset visual
      abilityButton.style.transform = '';
      // Emit ability release for charge-based abilities
      socket.emit('abilityRelease');
    }, { passive: false });

    abilityButton.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      // Reset visual
      abilityButton.style.transform = '';
      // Emit ability release for charge-based abilities
      socket.emit('abilityRelease');
    }, { passive: false });
  }

  let isChatFocused = false;
  let playerName = '';
  const chatInputArea = document.getElementById('chatInputArea');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  const chatPrompt = document.getElementById('chatPrompt');

  function toggleChatInput() {
    isChatFocused = !isChatFocused;
    if (isChatFocused) {
      show(chatInputArea);
      hide(chatPrompt);
      chatInput.focus();
    } else {
      hide(chatInputArea);
      show(chatPrompt);
      chatInput.blur();
      chatInput.value = '';
    }
    // Update mobile controls visibility when chat focus changes
    updateMobileControlsVisibility();
  }

  function sendChatMessage() {
    const message = chatInput.value.trim();
    
    if (!message) {
      return;
    }
    
    if (!playerName) { // TODO: check if playername can just be set when joining a room or even on login, seems like its being set locally in functions instead
      if (currentUser)
        playerName = currentUser.name;
      
      if (!playerName) {
        const mySocketId = socket.id;
        const latestState = gameStates[gameStates.length - 1];
        if (latestState && latestState.players) {
          const myPlayer = latestState.players.find(p => p.socketId === mySocketId);
          if (myPlayer && myPlayer.name) {
            playerName = myPlayer.name;
          }
        }
      }
      
      if (!playerName) {
        console.error("Can't send message, no player name")
        return;
      }
    }
    
    socket.emit('chatMessage', { message: message });
    chatInput.value = '';
    toggleChatInput();
  }

  function addChatMessage(playerName, message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `<span class="chat-player-name">${playerName}:</span><span class="chat-message-text">${message}</span>`;
    
    chatMessages.appendChild(messageElement);
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // caps at 50
    while (chatMessages.children.length > 50) {
      chatMessages.removeChild(chatMessages.firstChild);
    }
  }

  // for receiving chat messages
  socket.on('chatMessageReceived', (data) => {
    addChatMessage(data.playerName, data.message);
  });

  // for chat errors, only use rn is for invalid player names
  socket.on('chatError', (data) => {
    console.error('Chat error:', data.error);
  });

  // chat input specific event handlers
  chatInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      sendChatMessage();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      toggleChatInput();
    }
  });

  function initializeChatState() {
    if (!isChatFocused) {
      show(chatPrompt);
      hide(chatInputArea);
    }
  }

  initializeChatState();

  // listen for input events
  document.addEventListener('keydown', (e) => {

    // open chat
    if (e.code === 'Enter') {
      e.preventDefault();
      
      // this closes the chat after pressing enter
      if (e.target === chatInput) {
        return;
      }
      
      // toggle chat if not focused
      if (!isChatFocused) {
        toggleChatInput();
      }
      return;
    }

    // listen for escape to unfocus chat
    if (e.code === 'Escape') {
      if (isChatFocused) {
        toggleChatInput();
        return;
      }
    }
    // don't process game inputs when chat is focused or typing in an input field
    if (isChatFocused || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // listen for leaderboard
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!isTabHeld) {
        isTabHeld = true;
        showDetailedLeaderboard();
      }
      return;
    }

    // listen for ability (charge-based)
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();

      // gives a 'press' effect
      abilityHud.style.transform = 'scale(0.95)';

      // Emit ability start for charge-based abilities
      socket.emit('abilityStart');
    }

    // listen for upgrade numbers
    if (e.key >= '1' && e.key <= '9' && !e.repeat) {
      e.preventDefault();
      if (!upgradeCardsContainer.classList.contains('hidden') && sendInputInterval) {
        console.log(e.key)
        const upgradeKey = parseInt(e.key);
        const upgradeCard = document.querySelector(`[data-key="${upgradeKey}"]`);
        
        if (upgradeCard) {
          console.log(upgradeCard)
          const stat = upgradeCard.getAttribute('data-stat');
          
          upgradeCard.style.transform = 'translateY(-3px) scale(1.1)';
          
          setTimeout(() => {
            upgradeCard.style.transform = '';
          }, 200);
          
          socket.emit('upgrade', { stat });
        }
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Tab' && isTabHeld) {
      isTabHeld = false;
      hideDetailedLeaderboard();
      return;
    }

    if (e.code === 'Space') {
      abilityHud.style.transform = 'scale(1)';
      socket.emit('abilityRelease');
    }
  });

  socket.on('abilityResult', (result) => {
    if (result.success) {
      lastAbilityUse = result.serverTime || Date.now();
      updateAbilityHUD();
    }
  });

  function updateAbilityHUD() {
    if (!myAbility) {
      hide(abilityHud);
      return;
    }

    abilityName.textContent = myAbility.name;
    show(abilityHud);

    const progressBg = abilityHud.querySelector('.ability-progress-bg');
    if (!progressBg) {
      return;
    }

    if (abilityChargeState) {
      const chargePercent = abilityChargeState.current / abilityChargeState.max;
      const hasCharge = abilityChargeState.current >= 30;
      if (hasCharge) {
        progressBg.classList.remove('on-cooldown');
        progressBg.style.transform = `scaleX(${chargePercent})`;
      } else {
        progressBg.classList.add('on-cooldown');
        progressBg.style.transform = `scaleX(${chargePercent})`;
      }

      if (abilityChargeState.isCharging) {
        abilityHud.style.opacity = '0.8';
        abilityHud.style.boxShadow = '0 0 10px rgba(255, 95, 95, 0.5)';
      } else {
        abilityHud.style.opacity = '1';
        abilityHud.style.boxShadow = '';
      }
    } else {
      const now = getServerTime();
      const timeSinceUse = now - lastAbilityUse;
      const remaining = Math.max(0, myAbility.cooldown - timeSinceUse);
      const isReady = remaining === 0;

      if (isReady) {
        progressBg.classList.remove('on-cooldown');
        progressBg.style.transform = 'scaleX(1)';
      } else {
        progressBg.classList.add('on-cooldown');
        const progress = remaining / myAbility.cooldown;
        progressBg.style.transform = `scaleX(${progress})`;
      }

      // Reset charge-specific styling
      abilityHud.style.opacity = '1';
      abilityHud.style.boxShadow = '';
    }
  }

  // upgrade rendering
  function generateUpgradeCards(carType) {
    upgradeCardsContainer.innerHTML = '';
    
    const car = CAR_TYPES[carType];
    if (!car || !car.upgrades) return;
    
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
      
      const progressBlocks = document.createElement('div');
      progressBlocks.className = 'upgrade-progress-blocks';
      
      for (let i = 0; i < upgrade.maxUpgrades; i++) {
        const block = document.createElement('div');
        block.className = 'upgrade-progress-block';
        block.style.backgroundColor = upgrade.color;
        progressBlocks.appendChild(block);
      }
      
      const upgradeCard = document.createElement('div');
      upgradeCard.className = 'upgrade-card';
      upgradeCard.setAttribute('data-stat', statName);
      upgradeCard.setAttribute('data-key', keyIndex.toString());
      
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
    hide(upgradeCardsContainer);
    upgradeCardsContainer.classList.remove('compact');
    
    // Hide lap counter, lap timer, and boost display TODO: kill this if it isn't causing issues, makes no sense why i put it here
    // hide(abilityHud);
    // hide(lapCounter);
    // hide(lapTimer);
    // hide(boostDisplay);
    // currentLapStartTime = 0;
    // previousLapCount = 0;
    // currentLapTimeSpan.textContent = '0:00.000';
  }

  function updateUpgradeDisplay(me, carType) {
    if (!me || !carType) return;
    
    const car = CAR_TYPES[carType];
    if (!car || !car.upgrades) return;
    
    const upgradeUsage = me.upgradeUsage || {};
    
    for (const [statName, upgrade] of Object.entries(car.upgrades)) {
      const currentUsage = upgradeUsage[statName] || 0;
      const maxUpgrades = upgrade.maxUpgrades;
      const isMaxed = currentUsage >= maxUpgrades;
      
      const upgradeCard = document.querySelector(`.upgrade-card[data-stat="${statName}"]`);
      if (upgradeCard) {
        upgradeCard.classList.toggle('maxed', isMaxed);
      }
      
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

  setInterval(updateAbilityHUD, 100);

  // debug panel
  let debugMode = false;
  let debugPanel = null;

  async function initDebugPanel() {
    try {
      const response = await fetch('/api/debug');
      const data = await response.json();
      debugMode = data.debugMode;
      
      if (debugMode) {
        debugPanel = document.getElementById('debugPanel');
        if (debugPanel) {
          setupDebugPanel();
          show(debugPanel);
        }
      }
    } catch (error) {
      console.error('debug menu init error:', error);
    }
  }

  function setupDebugPanel() {
    const debugToggle = document.getElementById('debugToggle');
    const debugContent = document.getElementById('debugContent');
    const healthSlider = document.getElementById('debugHealth');
    const healthValue = document.getElementById('debugHealthValue');
    const maxHealthSlider = document.getElementById('debugMaxHealth');
    const maxHealthValue = document.getElementById('debugMaxHealthValue');
    const speedSlider = document.getElementById('debugSpeed');
    const speedValue = document.getElementById('debugSpeedValue');
    const regenSlider = document.getElementById('debugRegen');
    const regenValue = document.getElementById('debugRegenValue');
    const fakePingSlider = document.getElementById('debugFakePingSlider');
    const fakePingValue = document.getElementById('debugFakePingValue');
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
    const toggleFakePingBtn = document.getElementById('debugToggleFakePing');
    
    debugToggle.addEventListener('click', () => {
      const isCollapsed = debugContent.classList.toggle('collapsed');
      debugToggle.textContent = isCollapsed ? '+' : '−';
    });

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
    fakePingSlider.addEventListener('input', () => {
      fakePingValue.textContent = fakePingSlider.value;
      fakePingLatency = parseInt(fakePingSlider.value);
    });

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

    toggleFakePingBtn.addEventListener('click', () => {
      fakePingEnabled = !fakePingEnabled;
      toggleFakePingBtn.textContent = fakePingEnabled ? 'Fake Ping: ON' : 'Fake Ping: OFF';
      toggleFakePingBtn.setAttribute('data-active', fakePingEnabled.toString());
      fakePingSlider.disabled = !fakePingEnabled;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '#' && debugMode) {
        e.preventDefault();
        debugPanel.classList.toggle('hidden');
      }
    });
  }

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

  initDebugPanel();

  socket.on('disconnect', () => {
    // hide all game-specific UI elements
    hideUpgradeCards();
    hide(abilityHud);
    hide(lapCounter);
    hide(lapTimer);
    hide(boostDisplay);
    // reset clock synchronization
    clockOffset = 0;
    // show disconnection info
    showDisconnectionOverlay();
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    // hide all game-specific UI elements
    hideUpgradeCards();
    hide(abilityHud);
    hide(lapCounter);
    hide(lapTimer);
    hide(boostDisplay);
    // show disconnection info
    showDisconnectionOverlay();
  });

  socket.on('reconnect_failed', () => {
    console.error('Reconnect failed');
    // hide all game-specific UI elements
    hideUpgradeCards();
    hide(abilityHud);
    hide(lapCounter);
    hide(lapTimer);
    hide(boostDisplay);
    // show disconnection info
    showDisconnectionOverlay();
  });

  function showDisconnectionOverlay() {
    if (menu.style.display === 'none') {
      // user is in game, show
      show(disconnectionOverlay);
      hide(loadingScreen); // make sure to hide loading screen if it was visible
    } else {
      // user is spectating, show warning in menu
      showMenuDisconnectionWarning();
    }
  }

  function showMenuDisconnectionWarning() {
    // hide the interactive menu elements
    carCard.style.display = 'none';
    switchButton.style.display = 'none';
    joinButton.style.display = 'none';
    roomBrowserButton.style.display = 'none';
    mapEditorButton.style.display = 'none';
    
    // finally, show warning template
    show(menuDisconnectionWarning);
  }

  function hideMenuDisconnectionWarning() {
    // show the interactive menu elements
    carCard.style.display = 'block';
    switchButton.style.display = 'block';
    joinButton.style.display = 'block';
    roomBrowserButton.style.display = 'block';
    
    // show Map Editor button for non-guest users
    if (currentUser && currentUser.isGuest) {
      mapEditorButton.style.display = 'none';
    } else {
      mapEditorButton.style.display = 'block';
    }
    
    // finally, hide warning template
    hide(menuDisconnectionWarning);
  }

  // monitor server messages to detect silent disconnections
  function monitorConnection() {
    const now = Date.now();
    if (now - lastServerMessage > 30000) { // 30 seconds without any server message
      console.error('no server message received for 30 seconds, assuming disconnected');
      showDisconnectionOverlay();
    }
  }

  setInterval(monitorConnection, 5000);

  // called when reconnecting
  socket.on('connect', () => {
    console.log('Socket connected/reconnected');
    lastServerMessage = Date.now();
    
    hide(disconnectionOverlay);
    if (menu.style.display !== 'none') {
      hideMenuDisconnectionWarning();
    }
  });

  // AFK warning TODO: tweak styling so it falls in line with the rest of the ui
  let afkWarningActive = false;
  let afkWarningElement = null;
  let afkCountdownInterval = null;
  function createAFKWarningOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'afkWarning';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      font-family: Arial, sans-serif;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: #ff4444;
      color: white;
      padding: 30px;
      border-radius: 15px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      max-width: 400px;
      border: 3px solid #ff6666;
    `;
    
    content.innerHTML = `
      <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">AFK WARNING</div>
      <div id="afkReason" style="font-size: 16px; margin-bottom: 15px;">Are you even still here?</div>
      <div style="font-size: 48px; font-weight: bold; color: #ffff00;" id="afkCountdown">5</div>
      <div style="font-size: 14px; margin-top: 10px;">Do something to stay connected</div>
    `;
    
    overlay.appendChild(content);
    return overlay;
  }

  function showAFKWarning(reason, countdown) {
    if (afkWarningActive) return;
    
    afkWarningActive = true;
    afkWarningElement = createAFKWarningOverlay();
    document.body.appendChild(afkWarningElement);
    
    const reasonElement = afkWarningElement.querySelector('#afkReason');
    if (reasonElement) {
      reasonElement.textContent = reason;
    }
    
    let timeLeft = countdown;
    const countdownElement = afkWarningElement.querySelector('#afkCountdown');
    
    afkCountdownInterval = setInterval(() => {
      timeLeft--;
      if (countdownElement) {
        countdownElement.textContent = timeLeft;
      }
      
      if (timeLeft <= 0) {
        clearInterval(afkCountdownInterval);
      }
    }, 1000);
    
    const dismissWarning = () => {
      socket.emit('activityPing');
      hideAFKWarning();
    };

    // set of actions that reset the afk warning
    document.addEventListener('keydown', dismissWarning, { once: true });
    document.addEventListener('mousedown', dismissWarning, { once: true });
    document.addEventListener('mousemove', dismissWarning, { once: true });
    document.addEventListener('touchstart', dismissWarning, { once: true });
  }

  // clear afk warning dom element and reset interval
  function hideAFKWarning() {
    if (!afkWarningActive) return;
    afkWarningActive = false;
    if (afkCountdownInterval) {
      clearInterval(afkCountdownInterval);
      afkCountdownInterval = null;
    }
    if (afkWarningElement) {
      document.body.removeChild(afkWarningElement);
      afkWarningElement = null;
    }
  }

  socket.on('afkWarning', (data) => {
    // TODO: not even sure if this still works and even if it did, we'd only want it to kick in spectator and only in official rooms (maybe even by a 'Kick AFK' room setting)
    showAFKWarning(data.reason, data.countdown);
  });

  socket.on('forceLogout', (data) => {
    hideAFKWarning();
    
    // TODO: we don't like alerts, only nerds use alerts, we want a cool pop up instead
    alert(`${data.reason}`);
    
    // clear user state and go back to auth screen (we don't need to make a call to server, it already did the logout)
    currentUser = null;
    showAuthScreen();

    // update toolbar to make it hide
    updateToolbarVisibility();
  });

  socket.on('xpGained', (data) => {
    // only listen if player has an account
    if (currentUser && !currentUser.isGuest) {
      const oldLevel = calculateLevel(currentUser.xp || 0);
      currentUser.xp = (currentUser.xp || 0) + data.amount;
      const newLevel = calculateLevel(currentUser.xp);
      updatePlayerInfo();
      
      if (newLevel > oldLevel) {
        levelProgressFill.style.background = 'linear-gradient(90deg, #FFD700, #FFA500)';
        setTimeout(() => {
          levelProgressFill.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
        }, 2000);
        
        // TODO: we need a cool level up animation/styling
      }
    }
  });

  // send activity ping while spectating to avoid being kicked TODO: is this even needed?
  setInterval(() => {
    if (isSpectating && socket.connected) {
      socket.emit('activityPing');
    }
  }, 30000); // every 30 seconds

  function drawSpectatorView() {
    if (!spectatorState || !isSpectating) {
      // show connecting message :TODO loading screen could change to run with the current styling
      spectatorCtx.clearRect(0, 0, spectatorCanvas.width, spectatorCanvas.height);
      spectatorCtx.fillStyle = 'rgba(20, 20, 30, 0.3)';
      spectatorCtx.fillRect(0, 0, spectatorCanvas.width, spectatorCanvas.height);
      spectatorCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      spectatorCtx.font = '24px Arial';
      spectatorCtx.textAlign = 'center';
      spectatorCtx.fillText('Connecting to server...', spectatorCanvas.width / 2, spectatorCanvas.height / 2);
      return;
    }

    // use renderGame for spectator
    renderGame(spectatorCanvas, spectatorCtx, spectatorState, {
      mode: 'spectator',
      centerPlayer: null,
      mapData: spectatorState.map,
      showHUD: false,
      alpha: 1,
      showCheckpoints: false,
      showAbilityObjects: true
    });
    
    // if no players on the map, show waiting message
    if (!spectatorState.players || spectatorState.players.length === 0) {
      spectatorCtx.font = '22px Quicksilver';
      spectatorCtx.textAlign = 'center';
      
      // black outline
      spectatorCtx.lineWidth = 3;
      spectatorCtx.strokeStyle = '#000000';
      spectatorCtx.strokeText('Waiting for players...', spectatorCanvas.width / 2, spectatorCanvas.height - 50);
      
      spectatorCtx.fillStyle = 'rgba(255, 255, 255, 1)';
      spectatorCtx.fillText('Waiting for players...', spectatorCanvas.width / 2, spectatorCanvas.height - 50);
    }
  }

  function renderLoop() {
    updateFPS();
    updatePing();
    
    if (sendInputInterval) { // only render when in game
      drawGame();
    } else if (isSpectating) { // render spectator view in menu
      drawSpectatorView();
    }
    requestAnimationFrame(renderLoop);
  }
  renderLoop();

  upgradeCardsContainer.addEventListener('click', (e) => {
    const upgradeCard = e.target.closest('.upgrade-card');
    if (upgradeCard && !upgradeCardsContainer.classList.contains('hidden')) {
      const stat = upgradeCard.getAttribute('data-stat');
      
      upgradeCard.style.transform = 'translateY(-3px) scale(1.1)';
      
      setTimeout(() => {
        upgradeCard.style.transform = '';
      }, 200);
      
      socket.emit('upgrade', { stat });
    }
  });

  // interpolate between two game states
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


  function getInterpolatedState() {
    if (gameStates.length === 0) return null;

    // use server-synced time for accurate interpol
    const now = Date.now() + clockOffset;
    const renderTime = now - interpolationDelay;

    if (gameStates.length < 2) {
      return gameStates[gameStates.length - 1];
    }

    // find the two states to interpolate between
    let state1 = null, state2 = null;
    for (let i = 0; i < gameStates.length - 1; i++) {
      if (gameStates[i].timestamp <= renderTime && gameStates[i + 1].timestamp > renderTime) {
        state1 = gameStates[i];
        state2 = gameStates[i + 1];
        break;
      }
    }

    if (!state1 || !state2) {
      // use latest state if we can't find interpolation bounds TODO: this essentially disables interpol, might need to keep an eye on this
      return gameStates[gameStates.length - 1];
    }

    // calculate interpolation factor
    const t = Math.max(0, Math.min(1, (renderTime - state1.timestamp) / (state2.timestamp - state1.timestamp)));
    return interpolateStates(state1, state2, t);
  }

  function calculateMapBounds(mapShapes) {
    if (!mapShapes || !Array.isArray(mapShapes)) {
      return { minX: -100, maxX: 100, minY: -100, maxY: 100 }; // default to small square TODO: better default?
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
    if (mapData && mapData.scale && mapData.scale[mode]) {
      return mapData.scale[mode] * Math.min(canvas.width, canvas.height);
    }
    
    const { minX, maxX, minY, maxY } = mapBounds;
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const size = Math.max(sizeX, sizeY) || 1;
    
    if (mode === 'spectator') {
      return (Math.min(canvas.width, canvas.height) * 0.9) / size;
    } else {
      return (Math.min(canvas.width, canvas.height) * 2.5) / size;
    }
  }
  
  // move camera
  function getCameraTransform(options) {
    const { canvas, mapBounds, mode, centerPlayer, mapData } = options;
    
    let centerX = canvas.width / 2;
    let centerY = canvas.height / 2;
    let focusX = 0;
    let focusY = 0;
    
    if (mode === 'player' && centerPlayer) {
      focusX = centerPlayer.x;
      focusY = centerPlayer.y;
    } else if (mode === 'spectator' && mapBounds) {
      focusX = (mapBounds.minX + mapBounds.maxX) / 2;
      focusY = (mapBounds.minY + mapBounds.maxY) / 2;
    }
    
    const scale = calculateScale(canvas, mapBounds, mode, mapData);
    
    return { centerX, centerY, focusX, focusY, scale };
  }

  // render function should be able to be called from both spectators and players (gameState)
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
    
    ctx.globalAlpha = alpha;
    
    // get map data default to current map TODO: does currentMap even work here?
    const mapToUse = mapData || currentMap;
    
    const mapBounds = calculateMapBounds(mapToUse?.shapes);
    const { centerX, centerY, focusX, focusY, scale } = getCameraTransform({
      canvas,
      mapBounds,
      mode,
      centerPlayer,
      mapData: mapToUse
    });
    
    const players = gameState.players || [];
    const abilityObjects = gameState.abilityObjects || [];
    const dynamicObjects = gameState.dynamicObjects || [];
    
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
          ctx.fill('evenodd');
        }
      }
    }

    // start/finish line (only show in player mode or if centerPlayer exists)
    if (showCheckpoints && mapToUse && mapToUse.start && mapToUse.start.vertices) {
      const screenVerts = mapToUse.start.vertices.map(v => ({
        x: centerX + (v.x - focusX) * scale,
        y: centerY - (v.y - focusY) * scale
      }));
      // create that cool finish line pattern
      drawCheckerboard(ctx, screenVerts, 20, { x: 0, y: 0 }, scale, { x: focusX, y: focusY }, centerX, centerY);
    }

    // checkpoints
    if (showCheckpoints && mapToUse && mapToUse.checkpoints && centerPlayer) {
      for (const cp of mapToUse.checkpoints) {
        if (cp.type === 'line' && cp.vertices.length >= 2) {
          const a = cp.vertices[0];
          const b = cp.vertices[1];
          ctx.beginPath();
          ctx.moveTo(centerX + (a.x - focusX) * scale, centerY - (a.y - focusY) * scale);
          ctx.lineTo(centerX + (b.x - focusX) * scale, centerY - (b.y - focusY) * scale);
          
          // color checkpoints based on visit status
          const isVisited = centerPlayer && centerPlayer.checkpointsVisited && centerPlayer.checkpointsVisited.includes(cp.id);
          ctx.strokeStyle = isVisited ? '#00ff00' : '#ffff00'; // green if visited, yellow if not
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // area effects
    if (mapToUse && Array.isArray(mapToUse.areaEffects)) {
      for (const areaEffect of mapToUse.areaEffects) {
        if (Array.isArray(areaEffect.vertices)) {
          ctx.beginPath();
          
          const fillColor = Array.isArray(areaEffect.fillColor) 
            ? `rgba(${areaEffect.fillColor[0]}, ${areaEffect.fillColor[1]}, ${areaEffect.fillColor[2]}, 0.3)`
            : 'rgba(0, 0, 0, 0.3)'; // default to simple darkening
          ctx.fillStyle = fillColor;
          
          // draw area effects
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
            ctx.fill('evenodd');
          }
        }
      }
    }

    // Third pass: Draw shape borders (on top of area effects)
    if (mapToUse && Array.isArray(mapToUse.shapes)) {
      for (const shape of mapToUse.shapes) {
        if (Array.isArray(shape.vertices)) {
          const verts = shape.vertices.map(v => ({
            x: centerX + (v.x - focusX) * scale,
            y: centerY - (v.y - focusY) * scale
          }));

          // draw map shape border stripes if they exist
          if (Array.isArray(shape.borderColors) && shape.borderColors.length > 0 && shape.borderWidth > 0) {
            const lineWidth = shape.borderWidth * scale;
            const baseColor = shape.borderColors[0] || '#ff0000'; // default to red

            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < verts.length; i++) {
              ctx.lineTo(verts[i].x, verts[i].y);
            }
            ctx.closePath();

            // Single color mode: draw solid border
            if (shape.borderColors.length === 1) {
              ctx.lineWidth = lineWidth;
              ctx.strokeStyle = baseColor;
              ctx.lineJoin = 'round';
              ctx.lineCap = 'round';
              ctx.stroke();
            }
            // Dual color mode: draw striped border
            else {
              const stripeLength = (shape.stripeLength || shape.borderWidth * 1.8 || 25) * scale;
              let cumulativeStripeCount = 0;

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
                    : shape.borderColors[cumulativeStripeCount % shape.borderColors.length];
                  ctx.fill();

                  cumulativeStripeCount++;
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
    }

    // dynamic objects
    dynamicObjects.forEach((obj) => {
      if (obj.vertices && obj.vertices.length) {
        ctx.save();
        
        const objX = obj.position.x;
        const objY = obj.position.y;

        ctx.beginPath();
        obj.vertices.forEach((v, i) => {
            const cos = Math.cos(obj.angle);
            const sin = Math.sin(obj.angle);
            const rotatedX = v.x * cos - v.y * sin;
            const rotatedY = v.x * sin + v.y * cos;

            const worldX = objX + rotatedX;
            const worldY = objY + rotatedY;

            const screenX = centerX + (worldX - focusX) * scale;
            const screenY = centerY - (worldY - focusY) * scale;

            if (i === 0) {
                ctx.moveTo(screenX, screenY);
            } else {
                ctx.lineTo(screenX, screenY);
            }
        });
        ctx.closePath();
        
        // default to brown crate colours if not defined
        let fillColor = obj.fillColor || [139, 69, 19];
        let strokeColor = obj.strokeColor || [101, 67, 33];
        
        if (obj.health !== undefined && obj.maxHealth !== undefined) {
          const healthRatio = obj.health / obj.maxHealth;
          if (healthRatio <= 0) {
            // destroyed - make it darker and more transparent
            fillColor = [69, 34, 9]; // Much darker brown TODO: needs to inherit color
            strokeColor = [50, 33, 16];
            ctx.globalAlpha = 0.5;
          } else if (healthRatio < 0.5) {
            // damaged - darken the colors
            fillColor = fillColor.map(c => Math.floor(c * (0.5 + healthRatio * 0.5)));
            strokeColor = strokeColor.map(c => Math.floor(c * (0.5 + healthRatio * 0.5)));
          }
        }
        
        if (fillColor && Array.isArray(fillColor)) {
          ctx.fillStyle = `rgb(${fillColor[0]}, ${fillColor[1]}, ${fillColor[2]})`;
          ctx.fill('evenodd');
        }
        
        if (strokeColor && Array.isArray(strokeColor)) {
          ctx.strokeStyle = `rgb(${strokeColor[0]}, ${strokeColor[1]}, ${strokeColor[2]})`;
          ctx.lineWidth = (obj.strokeWidth || 2) * scale;
          ctx.stroke();
        }
        
        ctx.restore();
        
        // draw health bar for dynamic objects TODO: fix health bar dynamic objects
        if (obj.health !== undefined && obj.maxHealth !== undefined && obj.health < obj.maxHealth) {
          const objScreenX = centerX + (objX - focusX) * scale;
          const objScreenY = centerY - (objY - focusY) * scale;
          
          const barWidth = 30 * scale;
          const barHeight = 4 * scale;
          const barX = objScreenX - barWidth / 2;
          const barY = objScreenY - 40 * scale;
          
          const healthRatio = Math.max(0, obj.health / obj.maxHealth);
          
          ctx.fillStyle = '#333';
          ctx.fillRect(barX, barY, barWidth, barHeight);
          
          ctx.fillStyle = healthRatio > 0.5 ? '#0a0' : healthRatio > 0.25 ? '#aa0' : '#a00';
          ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
          
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
      }
    });

    // ability objects TODO: fix ability objects
    if (showAbilityObjects) {//
      abilityObjects.forEach((obj) => {
        if (obj.type === 'spike_trap' && obj.vertices && obj.vertices.length) {
          ctx.save();
          
          const objX = obj.position.x;
          const objY = obj.position.y;

          ctx.beginPath();
          obj.vertices.forEach((v, i) => {
              const cos = Math.cos(obj.angle);
              const sin = Math.sin(obj.angle);
              const rotatedX = v.x * cos - v.y * sin;
              const rotatedY = v.x * sin + v.y * cos;

              const worldX = objX + rotatedX;
              const worldY = objY + rotatedY;

              const screenX = centerX + (worldX - focusX) * scale;
              const screenY = centerY - (worldY - focusY) * scale;

              if (i === 0) {
                  ctx.moveTo(screenX, screenY);
              } else {
                  ctx.lineTo(screenX, screenY);
              }
          });
          ctx.closePath();

          ctx.fillStyle = obj.render?.fillStyle || '#888888';
          ctx.fill('evenodd');
          ctx.strokeStyle = obj.render?.strokeStyle || '#444444';
          ctx.lineWidth = (obj.render?.lineWidth || 2) * scale;
          ctx.lineJoin = 'round';
          ctx.stroke();
          
          ctx.restore();
        }

        if (obj.type === 'cannonball' && obj.vertices && obj.vertices.length) {
          console.log('Rendering cannonball at', obj.position, 'angle:', obj.angle, 'vertices:', obj.vertices.length);
          ctx.save();

          const objX = obj.position.x;
          const objY = obj.position.y;

          ctx.beginPath();
          obj.vertices.forEach((v, i) => {
            const cos = Math.cos(obj.angle);
            const sin = Math.sin(obj.angle);
            const rotatedX = v.x * cos - v.y * sin;
            const rotatedY = v.x * sin + v.y * cos;

            const worldX = objX + rotatedX;
            const worldY = objY + rotatedY;

            const screenX = centerX + (worldX - focusX) * scale;
            const screenY = centerY - (worldY - focusY) * scale;

            if (i === 0) {
              console.log('First vertex screenX:', screenX, 'screenY:', screenY, 'centerX:', centerX, 'centerY:', centerY, 'scale:', scale);
              ctx.moveTo(screenX, screenY);
            } else {
              ctx.lineTo(screenX, screenY);
            }
          });
          ctx.closePath();

          ctx.fillStyle = obj.render?.fillStyle || '#2c3e50';
          ctx.fill('evenodd');
          ctx.strokeStyle = obj.render?.strokeStyle || '#34495e';
          ctx.lineWidth = (obj.render?.lineWidth || 2) * scale;
          ctx.lineJoin = 'round';
          ctx.stroke();

          ctx.restore();
        }

        // Portal projectile rendering
        if (obj.type === 'portal-projectile' && obj.vertices && obj.vertices.length) {
          ctx.save();

          const objX = obj.position.x;
          const objY = obj.position.y;

          ctx.beginPath();
          obj.vertices.forEach((v, i) => {
            const cos = Math.cos(obj.angle);
            const sin = Math.sin(obj.angle);
            const rotatedX = v.x * cos - v.y * sin;
            const rotatedY = v.x * sin + v.y * cos;

            const worldX = objX + rotatedX;
            const worldY = objY + rotatedY;

            const screenX = centerX + (worldX - focusX) * scale;
            const screenY = centerY - (worldY - focusY) * scale;

            if (i === 0) {
              ctx.moveTo(screenX, screenY);
            } else {
              ctx.lineTo(screenX, screenY);
            }
          });
          ctx.closePath();

          ctx.fillStyle = obj.render?.fillStyle || '#0088ff';
          ctx.fill('evenodd');
          ctx.strokeStyle = obj.render?.strokeStyle || '#64b4ff';
          ctx.lineWidth = (obj.render?.lineWidth || 3) * scale;
          ctx.lineJoin = 'round';
          ctx.stroke();

          ctx.restore();
        }

        // Explosion projectile rendering (just the projectile, no blast radius)
        if (obj.type === 'explosion-projectile' && obj.vertices && obj.vertices.length) {
          ctx.save();

          const objX = obj.position.x;
          const objY = obj.position.y;

          // Render projectile body
          ctx.beginPath();
          obj.vertices.forEach((v, i) => {
            const cos = Math.cos(obj.angle);
            const sin = Math.sin(obj.angle);
            const rotatedX = v.x * cos - v.y * sin;
            const rotatedY = v.x * sin + v.y * cos;

            const worldX = objX + rotatedX;
            const worldY = objY + rotatedY;

            const screenX = centerX + (worldX - focusX) * scale;
            const screenY = centerY - (worldY - focusY) * scale;

            if (i === 0) {
              ctx.moveTo(screenX, screenY);
            } else {
              ctx.lineTo(screenX, screenY);
            }
          });
          ctx.closePath();

          ctx.fillStyle = obj.render?.fillStyle || 'rgba(255, 136, 0, 0.5)';
          ctx.fill('evenodd');
          ctx.strokeStyle = obj.render?.strokeStyle || '#ff8800';
          ctx.lineWidth = (obj.render?.lineWidth || 3) * scale;
          ctx.lineJoin = 'round';
          ctx.stroke();

          ctx.restore();
        }

        // Explosion effect rendering (brief visual after impact)
        if (obj.type === 'explosion-effect') {
          ctx.save();

          const objX = obj.position.x;
          const objY = obj.position.y;
          const radiusScreenX = centerX + (objX - focusX) * scale;
          const radiusScreenY = centerY - (objY - focusY) * scale;
          const radiusSize = obj.explosionRadius * scale;

          // Calculate fade based on remaining lifetime
          const timeLeft = obj.expiresAt - Date.now();
          const totalDuration = 400; // 0.4 seconds
          const fadeProgress = Math.max(0, timeLeft / totalDuration);

          // Render expanding blast radius
          ctx.beginPath();
          ctx.arc(radiusScreenX, radiusScreenY, radiusSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 136, 0, ${0.3 * fadeProgress})`; // Fade out
          ctx.fill();
          ctx.strokeStyle = `rgba(255, 136, 0, ${0.8 * fadeProgress})`;
          ctx.lineWidth = Math.max(3, 4 * scale);
          ctx.stroke();

          ctx.restore();
        }

        // Portal orange rendering (static, no shadows/particles)
        if (obj.type === 'portal_orange' && obj.vertices && obj.vertices.length) {
          ctx.save();

          const objX = obj.position.x;
          const objY = obj.position.y;

          ctx.beginPath();
          obj.vertices.forEach((v, i) => {
            const cos = Math.cos(obj.angle);
            const sin = Math.sin(obj.angle);
            const rotatedX = v.x * cos - v.y * sin;
            const rotatedY = v.x * sin + v.y * cos;

            const worldX = objX + rotatedX;
            const worldY = objY + rotatedY;

            const screenX = centerX + (worldX - focusX) * scale;
            const screenY = centerY - (worldY - focusY) * scale;

            if (i === 0) {
              ctx.moveTo(screenX, screenY);
            } else {
              ctx.lineTo(screenX, screenY);
            }
          });
          ctx.closePath();

          ctx.fillStyle = obj.render?.fillStyle || '#ff8800';
          ctx.fill('evenodd');
          ctx.strokeStyle = obj.render?.strokeStyle || '#ffaa44';
          ctx.lineWidth = (obj.render?.lineWidth || 4) * scale;
          ctx.lineJoin = 'round';
          ctx.stroke();

          ctx.restore();
        }

        // Portal blue rendering (static, no shadows/particles)
        if (obj.type === 'portal_blue' && obj.vertices && obj.vertices.length) {
          ctx.save();

          const objX = obj.position.x;
          const objY = obj.position.y;

          ctx.beginPath();
          obj.vertices.forEach((v, i) => {
            const cos = Math.cos(obj.angle);
            const sin = Math.sin(obj.angle);
            const rotatedX = v.x * cos - v.y * sin;
            const rotatedY = v.x * sin + v.y * cos;

            const worldX = objX + rotatedX;
            const worldY = objY + rotatedY;

            const screenX = centerX + (worldX - focusX) * scale;
            const screenY = centerY - (worldY - focusY) * scale;

            if (i === 0) {
              ctx.moveTo(screenX, screenY);
            } else {
              ctx.lineTo(screenX, screenY);
            }
          });
          ctx.closePath();

          ctx.fillStyle = obj.render?.fillStyle || '#0088ff';
          ctx.fill('evenodd');
          ctx.strokeStyle = obj.render?.strokeStyle || '#64b4ff';
          ctx.lineWidth = (obj.render?.lineWidth || 4) * scale;
          ctx.lineJoin = 'round';
          ctx.stroke();

          ctx.restore();
        }
      });
    }

    // start with all active players (non-crashed)
    const allPlayersToRender = [];
    
    for (const player of players) {
      if (!player.crashed) {
        allPlayersToRender.push(player);
      }
    }
    
    const now = Date.now();
    for (const [carId, crashData] of crashedCars.entries()) {
      const fadeElapsed = now - crashData.fadeStartTime;
      if (fadeElapsed < CRASH_FADE_DURATION) {
        allPlayersToRender.push({
          ...crashData.car,
          _isCrashed: true,
          _fadeAlpha: 1 - (fadeElapsed / CRASH_FADE_DURATION) // 1.0 to 0.0
        });
      }
    }
    
    allPlayersToRender.forEach((p) => {
      const dx = p.x - focusX;
      const dy = p.y - focusY;
      const screenX = centerX + dx * scale;
      const screenY = centerY - dy * scale;
      
      ctx.save();
      
      if (p._isCrashed && p._fadeAlpha !== undefined) {
        ctx.globalAlpha = p._fadeAlpha;
      } else if (playerCrashTime && p.socketId === mySocketId && p.crashed) {
        const fadeElapsed = Date.now() - playerCrashTime;
        if (fadeElapsed < CRASH_FADE_DURATION) {
          ctx.globalAlpha = 1 - (fadeElapsed / CRASH_FADE_DURATION);
        }
      }
      
      const carDef = CAR_TYPES[p.type];
      if (!carDef) return;

      const isMultiShape = carDef.shapes && carDef.shapes.length > 1;
      const renderMultiShape = isMultiShape || !p.vertices || !p.vertices.length;

      if (!renderMultiShape) {
        // single-shape, use server-provided rotated vertices
        ctx.fillStyle = `rgb(${p.color.fill[0]},${p.color.fill[1]},${p.color.fill[2]})`;
        ctx.strokeStyle = `rgb(${p.color.stroke[0]}, ${p.color.stroke[1]}, ${p.color.stroke[2]})`;
        ctx.lineWidth = (p.color.strokeWidth || 2) * scale;
        
        ctx.beginPath();
        p.vertices.forEach((v, i) => {
          const x = (p.x + v.x - focusX) * scale;
          const y = (p.y + v.y - focusY) * scale;
          if (i === 0) ctx.moveTo(centerX + x, centerY - y);
          else ctx.lineTo(centerX + x, centerY - y);
        });
        ctx.closePath();
        ctx.fill();
        
        if (p.color && p.color.stroke) {
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      } else {
        // render each shape directly using original vertices (server handles positioning)
        carDef.shapes.forEach((shape, shapeIndex) => {
          // use shape-specific color if available, otherwise use car default
          const shapeColor = shape.color || carDef.color;
          
          ctx.fillStyle = `rgba(${shapeColor.fill.join(',')}, ${ctx.globalAlpha || 1})`;
          ctx.strokeStyle = `rgba(${shapeColor.stroke.join(',')}, ${ctx.globalAlpha || 1})`;
          ctx.lineWidth = (shapeColor.strokeWidth || 2) * scale;
          
          const vertices = shape.vertices;
          if (vertices && vertices.length) {
            ctx.beginPath();
            
            vertices.forEach((v, i) => {
              const originalX = v.x;
              const originalY = v.y;

              let rotatedX, rotatedY;
              if (p.angle !== undefined) {
                const cos = Math.cos(p.angle);
                const sin = Math.sin(p.angle);
                rotatedX = originalX * cos - originalY * sin;
                rotatedY = originalX * sin + originalY * cos;
              } else {
                rotatedX = originalX;
                rotatedY = originalY;
              }
            
              const x = (p.x + rotatedX - focusX) * scale;
              const y = (p.y + rotatedY - focusY) * scale;
              if (i === 0) ctx.moveTo(centerX + x, centerY - y);
              else ctx.lineTo(centerX + x, centerY - y);
            });
            ctx.closePath();
            ctx.fill();
            
            if (shapeColor.stroke) {
              ctx.lineJoin = 'round';
              ctx.stroke();
            }
          }
        });
      }

      ctx.restore();

      if (p._isCrashed && p._fadeAlpha !== undefined) {
        ctx.globalAlpha = p._fadeAlpha;
      } else if (playerCrashTime && p.socketId === mySocketId && p.crashed) {
        const fadeElapsed = Date.now() - playerCrashTime;
        if (fadeElapsed < CRASH_FADE_DURATION) {
          ctx.globalAlpha = 1 - (fadeElapsed / CRASH_FADE_DURATION);
        }
      }

      // draw player name
      const fontSize = Math.max(6, 10 * scale);
      ctx.font = `bold ${fontSize}px 'Tahoma', 'Arial', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      
      // black text border
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(p.name || '', screenX, screenY + 20 * scale);
      
      // fill
      ctx.fillStyle = '#ffffff';
      ctx.fillText(p.name || '', screenX, screenY + 20 * scale);

      if (p.health < p.maxHealth) {
        // scale health bar width based on max health (base 20px for 10 health, scales up)
        const baseWidth = 20;
        const healthMultiplier = p.maxHealth / 10; // Normalize to base health of 10
        const barWidth = (baseWidth + (healthMultiplier - 1) * 8) * scale; // +8px per 10 extra health
        const barHeight = 4 * scale;
        const barX = screenX - barWidth / 2;
        const barY = screenY + 32 * scale;
        const cornerRadius = barHeight / 2;

        const healthRatio = p.health / p.maxHealth;
        
        // color transition based on health
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

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
        ctx.fill();

        // health bar
        if (healthRatio > 0) {
          ctx.fillStyle = healthColor;
          ctx.beginPath();
          ctx.roundRect(barX, barY, barWidth * healthRatio, barHeight, cornerRadius);
          ctx.fill();
        }

        // subtle border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
        ctx.stroke();
      }
      
      // adjust alpha back to full for next car
      ctx.globalAlpha = 1.0;
    });

    if (showHUD && centerPlayer && mode === 'player') {
      lapsSpan.textContent = `Lap ${centerPlayer.laps + 1} / ${centerPlayer.maxLaps}`;
      
      const upgradePointsCounter = document.getElementById('upgradePointsCounter');
      if (upgradePointsCounter) {
        upgradePointsCounter.textContent = centerPlayer.upgradePoints;
      }
      
      const now = Date.now();
      
      if (centerPlayer.laps > previousLapCount) {
        // A lap was just completed
        if (currentLapStartTime > 0) {
          const lapTime = now - currentLapStartTime;
          if (!bestLapTime || lapTime < bestLapTime) {
            bestLapTime = lapTime;
            bestLapTimeSpan.textContent = formatTime(bestLapTime);
          }
        }
        
        // start timing the new lap
        currentLapStartTime = now;
        previousLapCount = centerPlayer.laps;
      } else if (centerPlayer.laps < previousLapCount) {
        // laps reset (new game/crashed) - reset current lap timer only (preserve bestLapTime)
        currentLapStartTime = now;
        previousLapCount = centerPlayer.laps;
      } else if (currentLapStartTime === 0 && centerPlayer.laps === 0) {
        // just joined, start timer
        currentLapStartTime = now;
        previousLapCount = 0;
      }
      
      if (currentLapStartTime > 0) {
        const currentLapTime = now - currentLapStartTime;
        currentLapTimeSpan.textContent = formatTime(currentLapTime);
        show(lapTimer);
      } else {
        hide(lapTimer);
      }
      
      // show upgrades if player has points OR has ever earned upgrade points
      const hasEverHadUpgrades = centerPlayer.upgradePoints > 0 || Object.keys(centerPlayer.upgradeUsage || {}).length > 0;
      const shouldShowUpgrades = hasEverHadUpgrades;
      const isCompactMode = hasEverHadUpgrades && centerPlayer.upgradePoints === 0;
      
      // show lap counter, timer, and boost elements whenever in game
      show(lapCounter);
      show(lapTimer);
      show(boostDisplay);
      
      if (centerPlayer.currentBoost !== undefined && centerPlayer.maxBoost !== undefined) {
        const currentBoost = Math.round(centerPlayer.currentBoost);
        boostText.textContent = `${currentBoost}`;
      }
      
      if (shouldShowUpgrades) {
        show(upgradeCardsContainer);
        upgradeCardsContainer.classList.toggle('compact', isCompactMode);
      } else {
        hide(upgradeCardsContainer);
        upgradeCardsContainer.classList.remove('compact');
      }
      
      const selectedCar = document.querySelector('input[name="car"]:checked');
      if (selectedCar) {
        updateUpgradeDisplay(centerPlayer, selectedCar.value);
      }
    }
    
    ctx.globalAlpha = 1.0;
  }

  function drawGame() {
    // hold off on rendering until we get that first state
    if (!hasReceivedFirstState) {
      return;
    }
    
    // add interpol to state
    const currentState = getInterpolatedState();
    if (!currentState) return;

    players = currentState.players || [];
    abilityObjects = currentState.abilityObjects || [];
    mySocketId = currentState.mySocketId || mySocketId;
    
    const me = players.find((p) => p.socketId === mySocketId);

    if (!me || !players.map(p => p.id).includes(me.id)) {
      console.error("Can't find player, returning to menu")
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


  // create map identifier
  function generateMapKey(map) {
    if (!map) return 'null';
    if (map.name) return map.name;
    if (map.key) return map.key;
    
    // generate hash of map structure
    const mapString = JSON.stringify({
      shapes: map.shapes || [],
      checkpoints: map.checkpoints || [],
      dynamicObjects: map.dynamicObjects || []
    });
    
    // simple but reliable hash
    let hash = 0;
    for (let i = 0; i < mapString.length; i++) {
      const char = mapString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // convert to 32-bit
    }
    return hash.toString();
  }

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
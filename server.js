const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const formidable = require('formidable');
const { Server } = require('socket.io');
const Matter = require('matter-js');
const decomp = require('poly-decomp');
Matter.Common.setDecomp(decomp);
const { v4: uuidv4, validate: isUUID } = require('uuid');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const FileType = require('file-type');
const UserDatabase = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  transports: ['websocket'],  // websocket only w/o extras for lowest latency
  perMessageDeflate: false,   // disables compression to hopefully reduce latency
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e6, // hex, 486
});

const DEBUG_MODE = false;

const userDb = new UserDatabase();

function isValidFilename(filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
  if (path.isAbsolute(filename)) return false;
  if (!isUUID(filename)) return false;
  return true;
}

// double check map data structure
function validateMapData(mapData) {
  if (!mapData || typeof mapData !== 'object') {
    return { valid: false, error: 'Map data is invalid or missing. CODE: 1' };
  }
  // ensure mapid
  if (!mapData.id || typeof mapData.id !== 'string') {
    return { valid: false, error: 'Map data is invalid or missing. CODE: 2' };
  }
  // ensure uuid
  if (!isUUID(mapData.id)) {
    return { valid: false, error: 'Map data is invalid or missing. CODE: 3' };
  }

  // other checks
  if (mapData.shapes && !Array.isArray(mapData.shapes)) {
    return { valid: false, error: 'Map data is invalid or missing. CODE: 4' };
  }
  if (mapData.shapes && mapData.shapes.length > 1000) {
    return { valid: false, error: 'Too many shapes (max 1000)' };
  }
  if (mapData.shapes) {
    for (const shape of mapData.shapes) {
      if (!shape || typeof shape !== 'object') {
        return { valid: false, error: 'Map data is invalid or missing. CODE: 5' };
      }
      if (shape.vertices && !Array.isArray(shape.vertices)) {
        return { valid: false, error: 'Map data is invalid or missing. CODE: 6' };
      }
      if (shape.vertices && shape.vertices.length > 100) {
        return { valid: false, error: 'Shape has too many vertices (max 100 per shape)' };
      }
    }
  }

  // validate name/description
  if (mapData.displayName && typeof mapData.displayName === 'string') {
    if (mapData.displayName.length > 100) {
      return { valid: false, error: 'Display name too long (max 100 characters)' };
    }
  }
  if (mapData.description && typeof mapData.description === 'string') {
    if (mapData.description.length > 500) {
      return { valid: false, error: 'Description too long (max 500 characters)' };
    }
  }

  // map can be too big, prevent spam maps
  const jsonSize = JSON.stringify(mapData).length;
  if (jsonSize > 1024 * 1024) { // 1MB limit
    return { valid: false, error: 'Map data too large (max 1MB)' };
  }

  return { valid: true };
}

const activeUserSessions = new Map();
const activeGuestSessions = new Map();
const sessionRegistrationLocks = new Set();

const DUPLICATE_LOGIN_POLICY = {
  KICK_EXISTING: 'kick_existing',
  REJECT_NEW: 'reject_new'
};
const currentDuplicateLoginPolicy = DUPLICATE_LOGIN_POLICY.KICK_EXISTING;

// code needs to match client-side for level calculations
const BASE_XP_LEVEL_1 = 10;
const XP_SCALE_PER_LEVEL = 1.2;
const KILL_XP_REWARD = 1;

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

if (!process.env.SESSION_SECRET) {
  const randomSecret = crypto.randomBytes(32).toString('hex');
  console.warn('random secret being used, fix me!');
  process.env.SESSION_SECRET = randomSecret;
}

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict' // CSRF protection
  }
});

// auth rate limits
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 attempts per window
  message: 'Too many auth attempts, try again soon.',
  standardHeaders: true,
  legacyHeaders: false,
});

const mapUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 map uploads per hour
  message: 'Too many map uploads, try again soon',
  standardHeaders: true,
  legacyHeaders: false,
});

const roomCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 room creations per 15 minutes
  message: 'Too many room creations, try again soon',
  standardHeaders: true,
  legacyHeaders: false,
});

const generalApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json());
app.use(sessionMiddleware);
app.use('/api/', generalApiLimiter);
app.use(express.static('client'));
app.use('/previews', express.static('maps/previews'));

// wrap session middleware for socket.io
const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));


// app api endpoints


app.get('/api/carTypes', (req, res) => {
  res.json(CAR_TYPES);
});

app.get('/api/maps', (req, res) => {
  try {
    const maps = mapManager.getAllMaps();
    const mapList = maps.map(map => {
      // Get world record for this map
      let worldRecord = null;
      try {
        const leaderboard = userDb.getMapLeaderboard(map.key, map.category, 1);
        if (leaderboard && leaderboard.length > 0) {
          worldRecord = {
            time: leaderboard[0].lap_time,
            username: leaderboard[0].username
          };
        }
      } catch (error) {
        // Silently fail for individual map records
        console.error(`Failed to get world record for ${map.category}/${map.key}:`, error);
      }

      return {
        key: `${map.category}/${map.key}`,
        name: map.name,
        description: map.description || '',
        category: map.category,
        author: map.author,
        id: map.id,
        worldRecord: worldRecord
      };
    });
    res.json(mapList);
  } catch (error) {
    console.error('Error getting maps:', error);
    sendError(res, 500, 'Failed to load maps');
  }
});

app.get('/api/maps/:category/:key', (req, res) => {
  const { category, key } = req.params;
  try {
    const map = mapManager.getMap(key, category);
    if (map) {
      res.json(map);
    } else {
      sendError(res, 404, 'Map not found');
    }
  } catch (error) {
    console.error('Error getting map:', error);
    sendError(res, 500, 'Failed to load map');
  }
});

app.post('/api/maps', mapUploadLimiter, requireAuth, async (req, res) => {
  try {
    const { name, mapData, directory, key } = req.body;

    if (!name || !mapData) {
      return sendError(res, 400, 'Name and map data are required');
    }

    if (typeof name !== 'string' || name.length < 1 || name.length > 100) {
      return sendError(res, 400, 'Map name must be between 1 and 100 characters');
    }

    const validation = validateMapData(mapData);
    if (!validation.valid) {
      return sendError(res, 400, validation.error);
    }

    let filename;
    let targetDirectory;
    let isNewMap = true;

    if (key) {
      // overwrite
      const keyParts = key.split('/');
      targetDirectory = keyParts[0];
      filename = keyParts.slice(1).join('/');
      isNewMap = false;

      if (!['official', 'community'].includes(targetDirectory)) {
        return sendError(res, 400, 'Invalid directory in key.');
      }

    } else {
      targetDirectory = directory || 'community';
      if (!['official', 'community'].includes(targetDirectory)) {
        return res.status(400).json({ error: 'Invalid directory. Must be "official" or "community"' });
      }
      if (!mapData.id) {
        return sendError(res, 400, 'Map data must include a UUID (id field)');
      }
      filename = mapData.id;
    }

    if (!isValidFilename(filename)) {
      return sendError(res, 400, 'Invalid filename: must be a valid UUID');
    }
    const sanitizedName = validator.escape(name);

    const enhancedMapData = {
      ...mapData,
      displayName: sanitizedName,
      author: mapData.author || req.session.username,
      author_id: req.session.userId,
      created_at: isNewMap ? new Date().toISOString() : (mapData.created_at || new Date().toISOString()),
      updated_at: new Date().toISOString(),
      category: targetDirectory
    };

    const saved = mapManager.saveMap(filename, targetDirectory, enhancedMapData);
    if (!saved) {
      return sendError(res, 500, 'Failed to save map');
    }

    if (isNewMap) {
      const dbResult = userDb.addMap(sanitizedName, req.session.userId, filename, targetDirectory);
      if (!dbResult.success) {
        mapManager.deleteMap(filename, targetDirectory);
        return res.status(500).json({ error: dbResult.error });
      }
       res.json({
        success: true,
        mapId: dbResult.mapId,
        filename: filename,
        key: `${targetDirectory}/${filename}`
      });
    } else {
         res.json({
            success: true,
            filename: filename,
            key: `${targetDirectory}/${filename}`
        });
    }
  } catch (error) {
    console.error('Map save error:', error);
    sendError(res, 500, 'Map save failed');
  }
});

app.put('/api/maps/:key', requireAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { name, mapData } = req.body;

    if (!isValidFilename(key)) {
      return sendError(res, 400, 'Invalid filename: path traversal not allowed');
    }
    
    const mapInfo = userDb.getMapByFilename(key);
    if (!mapInfo || mapInfo.author_id !== req.session.userId) {
      return sendError(res, 403, 'You can only edit your own maps');
    }

    const enhancedMapData = {
      ...mapData,
      displayName: name,
      author: req.session.username,
      author_id: req.session.userId,
      created_at: mapInfo.created_at,
      updated_at: new Date().toISOString(),
      category: 'community'
    };

    const saved = mapManager.saveMap(key, 'community', enhancedMapData);
    if (!saved) {
      return sendError(res, 500, 'Failed to update map');
    }

    const updated = userDb.updateMap(mapInfo.id, name, req.session.userId);
    if (!updated) {
      return sendError(res, 500, 'Failed to update map metadata');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Map update error:', error);
    sendError(res, 500, 'Map update failed');
  }
});

app.delete('/api/maps/:key', requireAuth, async (req, res) => {
  try {
    const { key } = req.params;

    if (!isValidFilename(key)) {
      return sendError(res, 400, 'Invalid filename: path traversal not allowed');
    }

    const mapInfo = userDb.getMapByFilename(key);
    if (!mapInfo || mapInfo.author_id !== req.session.userId) {
      return sendError(res, 403, 'You can only delete your own maps');
    }

    const deleted = mapManager.deleteMap(key, 'community');
    if (!deleted) {
      return sendError(res, 500, 'Failed to delete map file');
    }

    const dbDeleted = userDb.deleteMap(mapInfo.id, req.session.userId);
    if (!dbDeleted) {
      return sendError(res, 500, 'Failed to delete map metadata');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Map delete error:', error);
    sendError(res, 500, 'Map delete failed');
  }
});

app.get('/api/maps/my', requireAuth, async (req, res) => {
  try {
    const userMaps = userDb.getMapsByUser(req.session.userId);
    res.json(userMaps);
  } catch (error) {
    console.error('Get user maps error:', error);
    sendError(res, 500, 'Failed to get user maps');
  }
});

app.post('/api/maps/preview', mapUploadLimiter, requireAuth, async (req, res) => {
  try {
    const form = new formidable.IncomingForm();
    form.maxFileSize = 5 * 1024 * 1024; // 5MB limit
    form.keepExtensions = true;

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('Preview upload parse error:', err);
        return sendError(res, 400, 'Failed to parse upload');
      }
      const mapId = Array.isArray(fields.mapId) ? fields.mapId[0] : fields.mapId;
      if (!mapId) {
        return sendError(res, 400, 'Map ID is required');
      }
      if (!isUUID(mapId)) {
        return sendError(res, 400, 'Invalid map ID format');
      }
      const previewFile = files.preview;
      if (!previewFile) {
        return sendError(res, 400, 'No preview file provided');
      }

      try {
        const file = Array.isArray(previewFile) ? previewFile[0] : previewFile;
        const fileType = await FileType.fromFile(file.filepath);

        if (!fileType || !['image/png', 'image/jpeg', 'image/jpg'].includes(fileType.mime)) {
          fs.unlinkSync(file.filepath);
          return sendError(res, 400, 'Invalid file type. Only PNG and JPEG images are allowed');
        }
        const stats = fs.statSync(file.filepath);
        if (stats.size > 5 * 1024 * 1024) {
          fs.unlinkSync(file.filepath);
          return sendError(res, 400, 'File too large. Maximum size is 5MB');
        }

        const previewsDir = path.join(__dirname, 'maps', 'previews');
        if (!fs.existsSync(previewsDir)) {
          fs.mkdirSync(previewsDir, { recursive: true });
        }

        const extension = fileType.ext;
        const filename = mapId + '.' + extension;
        const targetPath = path.join(previewsDir, filename);

        // Ensure the target path is within the previews directory (prevent path traversal)
        const resolvedTarget = path.resolve(targetPath);
        const resolvedPreviewsDir = path.resolve(previewsDir);
        if (!resolvedTarget.startsWith(resolvedPreviewsDir)) {
          fs.unlinkSync(file.filepath);
          return sendError(res, 400, 'Invalid file path');
        }

        // Remove any existing preview files for this map ID (any extension)
        const possibleExtensions = ['png', 'jpg', 'jpeg'];
        for (const ext of possibleExtensions) {
          const oldPath = path.join(previewsDir, `${mapId}.${ext}`);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }

        fs.copyFileSync(file.filepath, targetPath);
        fs.unlinkSync(file.filepath);

        res.json({
          success: true,
          message: 'Preview image saved successfully',
          previewPath: `/previews/${filename}`,
          mapId: mapId
        });

      } catch (saveError) {
        console.error('Preview save error:', saveError);
        // Clean up file on error
        try {
          const file = Array.isArray(previewFile) ? previewFile[0] : previewFile;
          if (file && file.filepath && fs.existsSync(file.filepath)) {
            fs.unlinkSync(file.filepath);
          }
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
        sendError(res, 500, 'Failed to save preview image');
      }
    });

  } catch (error) {
    console.error('Preview upload error:', error);
    sendError(res, 500, 'Failed to upload preview');
  }
});

app.get('/api/debug', (req, res) => {
  res.json({ debugMode: DEBUG_MODE });
});

app.get('/api/rooms', (req, res) => {
  const roomList = rooms.map(room => {
    let mapDisplayName = room.currentMapKey || 'Unknown';
    let mapPreviewUrl = null;
    
    if (room.currentMapKey) {
      // Parse category and key from currentMapKey if it contains '/'
      let mapCategory = null;
      let mapKey = room.currentMapKey;
      if (room.currentMapKey.includes('/')) {
        const parts = room.currentMapKey.split('/');
        mapCategory = parts[0];
        mapKey = parts[1];
      }
      
      const mapData = mapManager.getMap(mapKey, mapCategory);
      if (mapData && mapData.displayName) {
        mapDisplayName = mapData.displayName;
      }
      
      mapPreviewUrl = `/previews/${mapKey}.png`;
    }
    
    const roomMembers = room.getRoomMembersData();
    
    if (roomMembers.length > 0) {
    }
    
    // const playersList = roomMembers
    //   .filter(member => member.name && member.name !== 'Connecting...' && member.name.trim() !== '')
    //   .map(member => {
    //     // Clean up the name by removing " in lobby..." suffix for display
    //     let displayName = member.name;
    //     if (displayName.endsWith(' in lobby...')) {
    //       displayName = displayName.replace(' in lobby...', '');
    //     }
    //     return displayName;
    //   });
    
    return {
      id: room.id,
      name: room.name,
      currentMap: room.currentMapKey,
      mapDisplayName: mapDisplayName,
      mapPreviewUrl: mapPreviewUrl,
      activePlayerCount: room.activePlayerCount,
      spectatorCount: room.spectatorCount,
      totalOccupancy: room.totalOccupancy,
      maxPlayers: room.maxPlayers,
      isPrivate: room.isPrivate,
      isOfficial: room.isOfficial,
      isJoinable: room.isJoinable,
      playerCount: room.activePlayerCount,
      gamemode: room.gamemode
    };
  });
  res.json(roomList);
});

app.post('/api/rooms/create', roomCreationLimiter, express.json(), (req, res) => {
  try {
    const { name, mapKey, maxPlayers, isPrivate, gamemode } = req.body;

    if (name && name.length > 50) {
      return sendError(res, 400, 'Room name too long');
    }
    if (mapKey) {
      const { category: categoryToCheck, key: keyToCheck } = HELPERS.parseMapKey(mapKey);

      if (!mapManager.mapExists(keyToCheck, categoryToCheck)) {
        return sendError(res, 400, 'Invalid map');
      }
    }
    if (maxPlayers && (maxPlayers < 1 || maxPlayers > 16)) {
      return sendError(res, 400, 'Invalid max players (1-16)');
    }

    if (gamemode && !['standard', 'time_trial'].includes(gamemode)) {
      return sendError(res, 400, 'Invalid gamemode');
    }

    if (gamemode === 'time_trial') {
      if (maxPlayers && maxPlayers !== 1) {
        return sendError(res, 400, 'Time Trial mode requires exactly 1 player');
      }
    }

    const roomId = uuidv4();
    const room = new Room(roomId, mapKey || null);

    if (name) room.name = name;
    if (maxPlayers) room.maxPlayers = maxPlayers;
    if (typeof isPrivate === 'boolean') room.isPrivate = isPrivate;
    if (gamemode) room.gamemode = gamemode;

    if (room.gamemode === 'time_trial') {
      room.maxPlayers = 1;
    }

    rooms.push(room);

    res.json({
      id: room.id,
      name: room.name,
      currentMap: room.currentMapKey,
      activePlayerCount: room.activePlayerCount,
      spectatorCount: room.spectatorCount,
      totalOccupancy: room.totalOccupancy,
      maxPlayers: room.maxPlayers,
      isPrivate: room.isPrivate,
      isOfficial: room.isOfficial,
      isJoinable: room.isJoinable,
      playerCount: room.activePlayerCount,
      gamemode: room.gamemode
    });
  } catch (error) {
    console.error('Error creating room:', error);
    sendError(res, 500, 'Failed to create room');
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return sendError(res, 400, 'Username, email, and password are required');
    }

    if (username.length < 2 || username.length > 20) {
      return sendError(res, 400, 'Username must be between 2 and 20 characters');
    }

    // Strengthened password requirements
    if (password.length < 12) {
      return sendError(res, 400, 'Password must be at least 12 characters long');
    }

    // Check for password complexity
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecial) {
      return sendError(res, 400, 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    }

    // Use validator library for better email validation
    if (!validator.isEmail(email)) {
      return sendError(res, 400, 'Please enter a valid email address');
    }

    const result = await userDb.registerUser(username, email, password);

    if (result.success) {
      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error after registration:', err);
          return sendError(res, 500, 'Registration failed');
        }

        // Log in the user immediately after registration
        req.session.userId = result.userId;
        req.session.username = username;
        req.session.isGuest = false;

        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error after registration:', saveErr);
          }
          res.json({
            success: true,
            user: {
              id: result.userId,
              username: username,
              email: email,
              isGuest: false
            }
          });
        });
      });
    } else {
      // Use generic error message to prevent user enumeration
      res.status(400).json({ error: 'Registration failed. Please check your information and try again.' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    sendError(res, 500, 'Registration failed');
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    const result = await userDb.loginUser(email, password);

    if (result.success) {
      const userId = result.user.id;
      const existingSessions = getUserActiveSessions(userId);

      if (existingSessions.size > 0) {

        if (currentDuplicateLoginPolicy === DUPLICATE_LOGIN_POLICY.REJECT_NEW) {
          return res.status(409).json({
            error: 'Account is already logged in from another location. Please log out from the other session first.',
            errorCode: 'ALREADY_LOGGED_IN'
          });
        } else if (currentDuplicateLoginPolicy === DUPLICATE_LOGIN_POLICY.KICK_EXISTING) {
          // We'll kick existing sessions after socket connection is established
        }
      }

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error after login:', err);
          return sendError(res, 500, 'Login failed');
        }

        req.session.userId = result.user.id;
        req.session.username = result.user.username;
        req.session.isGuest = false;

        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error after login:', saveErr);
          }
          res.json({
            success: true,
            user: {
              id: result.user.id,
              username: result.user.username,
              email: result.user.email,
              isGuest: false,
              xp: result.user.xp || 0
            }
          });
        });
      });
    } else {
      // Use generic error message to prevent user enumeration
      res.status(401).json({ error: 'Invalid credentials. Please try again.' });
    }
  } catch (error) {
    console.error('Login error:', error);
    sendError(res, 500, 'Login failed');
  }
});

app.post('/api/auth/guest', (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.length > 20) {
      return sendError(res, 400, 'Guest name must be between 1 and 20 characters');
    }
    
    // Generate guest session (allow multiple guests and guest name changes)
    req.session.userId = null;
    req.session.username = name;
    req.session.isGuest = true;
    
    req.session.save((err) => {
      if (err) {
        console.error('Session save error after guest login:', err);
      }
      res.json({ 
        success: true, 
        user: { 
          id: null, 
          username: name,
          email: null,
          isGuest: true
        } 
      });
    });
  } catch (error) {
    console.error('Guest login error:', error);
    sendError(res, 500, 'Guest login failed');
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (req.session && req.session.username) {
    const session = req.session;
    if (session.isGuest) {
      unregisterGuestSession(req.sessionID);
    } else if (session.userId) {
      const userId = session.userId;
      const activeSessions = getUserActiveSessions(userId);
      for (const socketId of activeSessions) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('forceLogout', { 
            reason: 'You have been logged out.' 
          });
          // Note: We don't disconnect the socket, just log them out gracefully
        }
      }
      // Clear all sessions for this user
      activeUserSessions.delete(userId);
    }
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return sendError(res, 500, 'Logout failed');
    }
    res.json({ success: true });
  });
});

app.get('/api/auth/session', (req, res) => {
  if (req.session.username) {
    let userResponse = {
      id: req.session.userId,
      username: req.session.username,
      isGuest: req.session.isGuest || false
    };

    if (req.session.userId && !req.session.isGuest) {
      const userData = userDb.getUserById(req.session.userId);
      if (userData) {
        userResponse.xp = userData.xp || 0;
        userResponse.isDev = !!userData.isDev;
      }
    }

    res.json({
      authenticated: true,
      user: userResponse
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.get('/api/leaderboard', (req, res) => {
  try {
    const topPlayers = userDb.getLeaderboard(100);

    const leaderboardData = topPlayers.map(player => ({
      username: player.username,
      level: calculateLevel(player.xp),
      xp: player.xp,
      kills: player.total_kills,
      deaths: player.total_deaths,
      wins: player.total_wins
    }));

    let currentUserData = null;
    if (req.session?.userId && !req.session.isGuest) {
      const userData = userDb.getUserById(req.session.userId);
      if (userData) {
        const rank = userDb.getUserRank(req.session.userId);
        currentUserData = {
          username: userData.username,
          level: calculateLevel(userData.xp),
          xp: userData.xp,
          kills: userData.total_kills,
          deaths: userData.total_deaths,
          wins: userData.total_wins,
          rank: rank
        };
      }
    }

    res.json({
      leaderboard: leaderboardData,
      currentUser: currentUserData
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

app.get('/api/time-trial/leaderboard/:category/:mapKey', (req, res) => {
  try {
    const { category, mapKey } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    if (!['official', 'community'].includes(category)) {
      return sendError(res, 400, 'Invalid category');
    }

    if (!mapManager.mapExists(mapKey, category)) {
      return sendError(res, 404, 'Map not found');
    }

    const leaderboard = userDb.getMapLeaderboard(mapKey, category, limit);

    res.json({
      mapKey: mapKey,
      category: category,
      leaderboard: leaderboard
    });
  } catch (error) {
    console.error('Time trial leaderboard error:', error);
    sendError(res, 500, 'Failed to retrieve leaderboard');
  }
});

app.get('/api/time-trial/rank/:category/:mapKey', requireAuth, (req, res) => {
  try {
    const { category, mapKey } = req.params;
    const userId = req.session.userId;

    if (!['official', 'community'].includes(category)) {
      return sendError(res, 400, 'Invalid category');
    }

    const rankInfo = userDb.getUserMapRank(userId, mapKey, category);

    if (!rankInfo) {
      return res.json({
        hasRecord: false,
        message: 'No time trial record for this map'
      });
    }

    const totalPlayers = userDb.getMapLeaderboard(mapKey, category, 1000).length;

    res.json({
      hasRecord: true,
      rank: rankInfo.rank,
      lapTime: rankInfo.lap_time,
      recordDate: rankInfo.created_at,
      totalPlayers: totalPlayers
    });
  } catch (error) {
    console.error('Time trial rank error:', error);
    sendError(res, 500, 'Failed to retrieve rank');
  }
});

if (DEBUG_MODE) {
  // Restrict debug endpoint to localhost only for security
  app.get('/api/debug/sessions', requireLocalhost, (req, res) => {
    const userSessionsInfo = {};
    for (const [userId, sockets] of activeUserSessions.entries()) {
      userSessionsInfo[userId] = Array.from(sockets);
    }

    const guestSessionsInfo = {};
    for (const [sessionId, socketId] of activeGuestSessions.entries()) {
      guestSessionsInfo[sessionId] = socketId;
    }

    res.json({
      userSessions: userSessionsInfo,
      guestSessions: guestSessionsInfo,
      totalUserSessions: activeUserSessions.size,
      totalGuestSessions: activeGuestSessions.size,
      currentPolicy: currentDuplicateLoginPolicy
    });
  });
}

const PORT = process.env.PORT || 3000;

const HELPERS = require('./helpers');
const CAR_TYPES = require('./carTypes');
const { abilityRegistry, SpikeTrapAbility, CannonAbility, PortalAbility } = require('./abilities');

const MapManager = require('./MapManager');
const mapManager = new MapManager('./maps');

// ============================================================================
// CONSTANTS
// ============================================================================

// Velocity-based collision damage constants
const BASE_VELOCITY_DAMAGE_SCALE = 2.0;  // Main damage tuning knob
const WALL_VELOCITY_DAMAGE_SCALE = 0.2;  // For static wall collisions
const MIN_DAMAGE_VELOCITY = 0;  // Ignore very slow collisions
const MAX_DAMAGE_MULTIPLIER = 5.0;  // Cap damage to prevent one-hit kills
const MIN_DAMAGE_MULTIPLIER = 1.0;  // Minimum damage scaling

// Angle-based collision damage constants
const MIN_ANGLE_MULTIPLIER = 0.12;  // Minimum damage for grazing impacts (20%)
const MAX_ANGLE_MULTIPLIER = 1.0;  // Maximum damage for head-on impacts (100%)
const ANGLE_CURVE_POWER = 1.0;     // Power for cosine curve shaping (1.0 = linear cosine)

// Timing constants
const SPAWN_PROTECTION_MS = 1000;
const RESPAWN_PROTECTION_MS = 1000;
const LAVA_DAMAGE_INTERVAL_MS = 100;
const WIN_MESSAGE_DELAY_MS = 1500;
const CRASH_CLEANUP_DELAY_MS = 300;
const AFK_CHECK_INTERVAL_MS = 15000;
const PLAYER_AFK_THRESHOLD_MS = 30 * 1000;
const AFK_WARNING_TIME_MS = 5 * 1000;

// Gameplay constants
const BOOST_CONSUMPTION_RATE = 10;
const LAVA_DAMAGE_SCALE = 0.1;
const CHECKPOINT_DETECTION_RADIUS = 10;
const FULL_STATE_BROADCAST_CHANCE = 0.1;


function registerUserSession(userId, socketId) {
  if (!activeUserSessions.has(userId)) {
    activeUserSessions.set(userId, new Set());
  }
  activeUserSessions.get(userId).add(socketId);
}

function unregisterUserSession(userId, socketId) {
  if (activeUserSessions.has(userId)) {
    activeUserSessions.get(userId).delete(socketId);
    if (activeUserSessions.get(userId).size === 0) {
      activeUserSessions.delete(userId);
    }
  }
}

function getUserActiveSessions(userId) {
  return activeUserSessions.get(userId) || new Set();
}

function registerGuestSession(sessionId, socketId) {
  activeGuestSessions.set(sessionId, socketId);
}

function unregisterGuestSession(sessionId) {
  if (activeGuestSessions.has(sessionId)) {
    const socketId = activeGuestSessions.get(sessionId);
    activeGuestSessions.delete(sessionId);
  }
}

function isGuestSessionActive(sessionId) {
  return activeGuestSessions.has(sessionId);
}

function sendError(res, statusCode, message) {
  return res.status(statusCode).json({ error: message });
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return sendError(res, 401, 'Authentication required');
  }
  next();
}

// Middleware to restrict debug endpoints to localhost only
function requireLocalhost(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

  if (!isLocalhost) {
    return sendError(res, 403, 'Access denied');
  }
  next();
}

function cleanupSocketSession(socket) {
  if (socket.request.session && socket.request.session.username) {
    const session = socket.request.session;
    if (session.isGuest) {
      unregisterGuestSession(socket.request.sessionID);
    } else if (session.userId) {
      unregisterUserSession(session.userId, socket.id);
    }
  }
}

function removeFromAllRooms(socketId) {
  for (const room of rooms) {
    if (room.hasMember(socketId)) {
      room.removeMember(socketId);
    }
  }
}

function emitToSocket(socketId, event, data) {
  const socket = io.sockets.sockets.get(socketId);
  if (socket) socket.emit(event, data);
}

function kickExistingSessions(userId, currentSocketId) {
  const existingSessions = getUserActiveSessions(userId);
  for (const socketId of existingSessions) {
    if (socketId !== currentSocketId) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('forceLogout', { 
          reason: 'Your account has been logged in from another location.' 
        });
        // Note: We don't disconnect the socket, just log them out gracefully
      }
      unregisterUserSession(userId, socketId);
    }
  }
}



function applyMotorForces(room) {
  try {
    for (const body of room.currentDynamicBodies) {
      if (body.dynamicObject &&
          body.dynamicObject.axis &&
          typeof body.dynamicObject.axis.motorSpeed === 'number') {

        const motorSpeed = body.dynamicObject.axis.motorSpeed;
        if (motorSpeed === 0) continue;

        const angularVelocity = motorSpeed * 0.01;

        Matter.Body.setAngularVelocity(body, angularVelocity);
      }
    }
  } catch (error) {
    console.error('Error applying motor forces:', error);
  }
}

function applyAreaEffects(room) {
  try {
    const { category: categoryToGet, key: keyToGet } = room.currentMapParsed;
    const map = mapManager.getMap(keyToGet, categoryToGet);

    if (!map || !map.areaEffects) return;

    for (const [sid, car] of room.players.entries()) {
      if (car.crashedAt) continue;

      const carX = car.body.position.x;
      const carY = car.body.position.y;

      if (!car._areaEffectsInit) {
        initAreaEffectsForCar(car);
      }

      let currentEffects = [];

      for (const areaEffect of map.areaEffects) {
        if (!areaEffect.vertices || !Array.isArray(areaEffect.vertices)) continue;

        const isInside = HELPERS.pointInPolygon(carX, carY, areaEffect.vertices);

        if (isInside)
          currentEffects.push(areaEffect);
      }

      applyCurrentEffects(car, currentEffects);
    }
  } catch (error) {
    console.error('Error applying area effects:', error);
  }
}

function initAreaEffectsForCar(car) {
  if (car._areaEffectsInit) return;
  
  const carType = CAR_TYPES[car.type];
  car._originalBodyProps = {
    frictionAir: carType && carType.bodyOptions ? carType.bodyOptions.frictionAir : 0.004, // fallback default
    acceleration: car.stats.acceleration // store original acceleration
  };
  car._activeAreaEffects = new Set();
  car._areaEffectsInit = true;
}

function applyCurrentEffects(car, currentEffects) {
  const originalFriction = car._originalBodyProps.frictionAir;
  const originalAcceleration = car._originalBodyProps.acceleration;
  if (typeof originalFriction !== 'number' || typeof originalAcceleration !== 'number') return;

  if (currentEffects.length === 0) {
    // No effects - restore original values
    car.body.frictionAir = originalFriction;
    car.stats.acceleration = originalAcceleration;
    car._activeAreaEffects.clear();
    return;
  }

  let maxIceStrength = 0;
  let maxLavaStrength = 0;
  let maxBoostStrength = 0;
  let maxSlowStrength = 0;
  
  for (const effect of currentEffects) {
    if (effect.effect === 'ice' && effect.strength > maxIceStrength) {
      maxIceStrength = effect.strength;
    }
    if (effect.effect === 'lava' && effect.strength > maxLavaStrength) {
      maxLavaStrength = effect.strength;
    }
    if (effect.effect === 'boost' && effect.strength > maxBoostStrength) {
      maxBoostStrength = effect.strength;
    }
    if (effect.effect === 'slow' && effect.strength > maxSlowStrength) {
      maxSlowStrength = effect.strength;
    }
  }

  if (maxIceStrength > 0) {
    const newFriction = originalFriction * (1 - maxIceStrength);
    car.body.frictionAir = newFriction;
    car._activeAreaEffects.add(`ice_${maxIceStrength}`);
  } else {
    // No ice effects - restore original
    car.body.frictionAir = originalFriction;
  }
  
  if (maxBoostStrength > 0 && maxBoostStrength >= maxSlowStrength) {
    const newAcceleration = originalAcceleration * maxBoostStrength;
    car.stats.acceleration = newAcceleration;
    car._activeAreaEffects.add(`boost_${maxBoostStrength}`);
  } else if (maxSlowStrength > 0) {
    const frictionMultiplier = 1 + (maxSlowStrength * 25);
    const newFriction = originalFriction * frictionMultiplier;
    car.body.frictionAir = newFriction;
    car.stats.acceleration = originalAcceleration;
    car._activeAreaEffects.add(`slow_${maxSlowStrength}`);
  } else {
    // No acceleration effects - restore original
    car.stats.acceleration = originalAcceleration;
  }
  
  // Clear area effects if no effects are active
  if (maxIceStrength === 0 && maxBoostStrength === 0 && maxLavaStrength === 0 && maxSlowStrength === 0) {
    car._activeAreaEffects.clear();
  }

  if (maxLavaStrength > 0) {
    const currentTime = Date.now();
    const effectKey = `lava_${maxLavaStrength}`;
    
    if (!car._lavaDamageTracking) {
      car._lavaDamageTracking = new Map();
    }
    
    // Check if we should apply damage (limit to once per 100ms to avoid excessive damage)
    const lastDamageTime = car._lavaDamageTracking.get(effectKey) || 0;
    if (currentTime - lastDamageTime >= LAVA_DAMAGE_INTERVAL_MS) {
      const damage = maxLavaStrength * LAVA_DAMAGE_SCALE;
      const oldHealth = car.currentHealth;
      car.currentHealth = Math.max(0, car.currentHealth - damage);
      car._lavaDamageTracking.set(effectKey, currentTime);

      
      if (car.currentHealth <= 0)
        car.justCrashed = true;
      
      car._activeAreaEffects.add(effectKey);
    }
  } else {
    // Clear lava damage tracking when not in lava
    if (car._lavaDamageTracking) {
      car._lavaDamageTracking.clear();
    }
  }
}

function calculateImpactAngle(relativeVelocity, collisionNormal) {
  const velMagnitude = Math.sqrt(relativeVelocity.x * relativeVelocity.x + relativeVelocity.y * relativeVelocity.y);
  
  // Avoid division by zero
  if (velMagnitude < 0.001) {
    return Math.PI / 2; // Assume 90-degree angle for very slow collisions
  }
  
  const dotProduct = relativeVelocity.x * collisionNormal.x + relativeVelocity.y * collisionNormal.y;
  
  const cosAngle = Math.abs(dotProduct) / velMagnitude;
  return Math.acos(Math.max(0, Math.min(1, cosAngle))); // Clamp to prevent NaN
}

function getAngleDamageMultiplier(impactAngle) {
  // Convert angle to damage multiplier using cosine curve
  // 0 degrees (head-on) = MAX_ANGLE_MULTIPLIER
  // 90 degrees (grazing) = MIN_ANGLE_MULTIPLIER
  const cosValue = Math.cos(impactAngle);
  const normalizedCos = Math.pow(Math.max(0, cosValue), ANGLE_CURVE_POWER);
  
  return MIN_ANGLE_MULTIPLIER + (MAX_ANGLE_MULTIPLIER - MIN_ANGLE_MULTIPLIER) * normalizedCos;
}

function getCollisionNormal(pair, bodyA, bodyB) {
  // Extract collision normal from Matter.js collision pair
  if (pair.collision && pair.collision.normal) {
    // Use the collision normal, ensuring it points from bodyA to bodyB
    let normal = pair.collision.normal;
    
    if (pair.bodyA === bodyB) {
      normal = { x: -normal.x, y: -normal.y };
    }
    
    return normal;
  }
  
  // Fallback: calculate normal from body positions (for static bodies like walls)
  if (bodyB.isStatic && !bodyA.isStatic) {
    if (pair.collision && pair.collision.supports && pair.collision.supports[0]) {
      const contactPoint = pair.collision.supports[0];
      const carCenter = bodyA.position;
      
      const dx = contactPoint.x - carCenter.x;
      const dy = contactPoint.y - carCenter.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      
      if (length > 0.001) {
        return { x: dx / length, y: dy / length };
      }
    }
  }
  
  // Final fallback: use vector between body centers
  const dx = bodyB.position.x - bodyA.position.x;
  const dy = bodyB.position.y - bodyA.position.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length > 0.001) {
    return { x: dx / length, y: dy / length };
  }
  
  // Default to horizontal normal if all else fails
  return { x: 1, y: 0 };
}

class Car {
  constructor(id, type, roomId, socketId, name, level, room = null) {
    this.id = id;
    this.roomId = roomId;
    this.socketId = socketId;
    this.name = name || '';
    this.level = level;
    this.type = type;
    this.room = room; // Reference to the room for accessing world and gameState
    this.stats = {
      maxHealth: CAR_TYPES[type].maxHealth,
      acceleration: CAR_TYPES[type].acceleration,
      regen: CAR_TYPES[type].regen
    };
    this.currentHealth = this.stats.maxHealth;
    this.laps = 0;
    this.maxLaps = 3; // Default number of laps to complete
    this.upgradePoints = 0;
    this.upgradeUsage = {}; // Track how many times each upgrade has been used
    
    const mapStats = room?.mapStats?.get(socketId);
    this.kills = mapStats?.kills || 0;
    this.deaths = mapStats?.deaths || 0;
    this.bestLapTime = mapStats?.bestLapTime || null;
    this.currentLapStartTime = 0;
    this.prevFinishCheck = null; // used for lap crossing on square track
    this.cursor = { x: 0, y: 0 }; // direction and intensity from client
    this.justCrashed = false;
    this.crashedByPlayer = false;
    this.killFeedSent = false;
    this.crashedAt = null;
    this.damageTagHistory = []; 
    this.godMode = true; // Spawn protection
    this.spawnProtectionEnd = Date.now() + SPAWN_PROTECTION_MS; // 1 second of spawn protection

    this.maxBoost = CAR_TYPES[type].boost;
    this.currentBoost = this.maxBoost;
    this.boostActive = false;

    const carDef = CAR_TYPES[type];
    this.ability = carDef.ability ? abilityRegistry.create(carDef.ability) : null;

    if (this.ability && this.ability.usesChargeSystem) {
      this.ability.initializeChargeState(this);
    } else {
      this.chargeState = null;
    }

    // Ability upgrade stats
    this.abilityCooldownReduction = 0;
    this.projectileSpeed = 0;
    this.projectileDensity = 0;

    this.isGhost = false;
    this.trapDamageHistory = new Map();

    // anchor ability
    this.isAnchored = false;
    this.anchorStartTime = 0;
    this.anchorResistance = 0;

    // Focus ability state
    this.isFocused = false;
    this.focusStartTime = 0;
    this.originalFrictionAir = null;
    this.originalAcceleration = null;

    // Trap ability upgrades
    this.trapDamage = 0;

    const roomMapKey = this.room ? this.room.currentMapKey : 'square';
    
    const { category: mapCategory, key: mapKey } = HELPERS.parseMapKey(roomMapKey);
    
    const mapDef = mapManager.getMap(mapKey, mapCategory);
    let startPos = { x: 0, y: 0 };
    this.checkpointsVisited = new Set()
    this._cpLastSides = new Map()
    this.hasLeftStartSinceLap = false
    
    if (mapDef && mapDef.start) {
      if (mapDef.start.vertices && mapDef.start.vertices.length) {
        const verts = mapDef.start.vertices;
        const avgX = verts.reduce((sum, v) => sum + v.x, 0) / verts.length;
        const avgY = verts.reduce((sum, v) => sum + v.y, 0) / verts.length;
        startPos = { x: avgX, y: avgY };
      } else if (typeof mapDef.start.x === 'number' && typeof mapDef.start.y === 'number') {
        startPos = mapDef.start;
      }
    } else if (mapDef) {
      // No start area defined, calculate a reasonable spawn position
      startPos = this.calculateFallbackSpawnPosition(mapDef);
    } else {
      // No map found at all, use safe default
      startPos = { x: 100, y: 0 }; // Better than (0,0)
    }
    this.checkpointsVisited = new Set();
    const def = CAR_TYPES[this.type]
    const bodyOpts = {
      ...(def.bodyOptions || {}),
      label: `car-${this.id}`
    }
  if (def.shapes && def.shapes.length > 0) {
    if (def.shapes.length === 1) {
      // Single shape - use simple body
      const shape = def.shapes[0]
      const shapeBodyOpts = {
        ...bodyOpts,
        ...(shape.bodyOptions || {})
      }
      this.body = Matter.Bodies.fromVertices(
        startPos.x,
        startPos.y,
        [shape.vertices],
        shapeBodyOpts,
        false
      )
    } else {
      // Multiple shapes - create compound body
      // First, calculate the overall center of mass for all shapes combined
      let totalArea = 0;
      let centerX = 0;
      let centerY = 0;
      
      def.shapes.forEach(shape => {
        const centroid = Matter.Vertices.centre(shape.vertices);
        // Rough area calculation for weighting (using bounding box area)
        const bounds = Matter.Bounds.create(shape.vertices);
        const area = (bounds.max.x - bounds.min.x) * (bounds.max.y - bounds.min.y);
        
        centerX += centroid.x * area;
        centerY += centroid.y * area;
        totalArea += area;
      });
      
      // Overall center of mass
      const overallCenter = { x: centerX / totalArea, y: centerY / totalArea };
      const bodies = def.shapes.map((shape, index) => {
        const shapeCentroid = Matter.Vertices.centre(shape.vertices);
        const offsetX = shapeCentroid.x - overallCenter.x;
        const offsetY = shapeCentroid.y - overallCenter.y;
        
        const shapePosition = {
          x: startPos.x + offsetX,
          y: startPos.y + offsetY
        };
        
        const shapeBodyOpts = {
          ...bodyOpts,
          ...(shape.bodyOptions || {}),
          label: `car-${this.id}-shape-${index}`
        }
        return Matter.Bodies.fromVertices(
          shapePosition.x,
          shapePosition.y,
          [shape.vertices],
          shapeBodyOpts,
          false
        )
      })
      this.body = Matter.Body.create({
        parts: bodies,
        ...bodyOpts,
        label: `car-${this.id}`
      })
      
    }
    this.displaySize = 15 // used for rendering hud around car (health bars, etc.)
  }
    Matter.Body.setAngle(this.body, 0);
    if (this.room && this.room.world) {
      Matter.World.add(this.room.world, this.body);
    } else {
      console.error(`Car ${this.id} created without proper room reference - this should not happen!`);
      throw new Error('Car must be created with valid room reference');
    }
    this.lastUpdate = Date.now();
  }
  update(dt) {
    this.updateSpawnProtection();
    this.cleanupExpiredTags();
    this.updateAbility(dt);
    this.updatePhysicsAndSteering(dt);
    this.regenerateHealth(dt);
    this.updateCheckpoints();
    this.checkLapCompletion();
  }

  updateSpawnProtection() {
    if (this.spawnProtectionEnd && Date.now() > this.spawnProtectionEnd) {
      this.godMode = false;
      this.spawnProtectionEnd = null;
    }
  }

  cleanupExpiredTags() {
    const now = Date.now();
    const TAG_WINDOW_MS = 2000;
    this.damageTagHistory = this.damageTagHistory.filter(
      tag => now - tag.timestamp <= TAG_WINDOW_MS
    );
  }

  updateAbility(dt) {
    if (this.ability) {
      const roomWorld = this.room.world;
      const roomGameState = this.room.gameState;
      this.ability.update(this, roomWorld, roomGameState, dt);
    }
  }

  updatePhysicsAndSteering(dt) {
    const CURSOR_MAX = 100
    const MAX_ROT_SPEED = Math.PI * 8
    const STEER_GAIN = 5.0
    const VEL_ALIGN = 0.05
    const ANGULAR_DAMP = 20.0

    const body = this.body
    const cx = this.cursor.x
    const cy = -this.cursor.y
    const mag = Math.hypot(cx, cy)

    if (mag > 1) {
      const normX = cx / mag
      const normY = cy / mag
      const throttle = Math.min(mag, CURSOR_MAX) / CURSOR_MAX
      const inputAngle = Math.atan2(normY, normX)
      const v = body.velocity
      const speed = Math.hypot(v.x, v.y)
      const velAngle = speed > 0.01 ? Math.atan2(v.y, v.x) : inputAngle
      const desiredAngle = HELPERS.lerpAngle(velAngle, inputAngle, 1 - VEL_ALIGN)
      let diff = HELPERS.shortestAngle(desiredAngle - body.angle)
      const targetAngVel = diff * STEER_GAIN
      let angVel = body.angularVelocity * Math.max(0, 1 - ANGULAR_DAMP * dt)
      const max = MAX_ROT_SPEED
      angVel = HELPERS.clamp(angVel + targetAngVel * dt, -max, max)
      Matter.Body.setAngularVelocity(body, angVel)

      let acceleration = this.stats.acceleration;
      if (this.boostActive && this.currentBoost > 0) {
        acceleration *= 2.0;
        this.currentBoost = Math.max(0, this.currentBoost - BOOST_CONSUMPTION_RATE * dt);

        if (this.currentBoost <= 0) {
          this.boostActive = false;
        }
      }

      const forceMag = acceleration * throttle
      const force = {
        x: Math.cos(body.angle) * forceMag,
        y: Math.sin(body.angle) * forceMag
      }
      Matter.Body.applyForce(body, body.position, force)
    }
  }

  regenerateHealth(dt) {
    this.currentHealth = Math.min(
      this.stats.maxHealth,
      this.currentHealth + this.stats.regen * dt
    );
  }

  updateCheckpoints() {
    const pos = this.body.position
    const roomMapKey = this.room ? this.room.currentMapKey : 'square';
    const { category: mapCategory, key: mapKey } = HELPERS.parseMapKey(roomMapKey);
    const map = mapManager.getMap(mapKey, mapCategory);
    const checkpoints = map?.checkpoints || []

    for (let i = 0; i < checkpoints.length; i++) {
      if (checkpoints[i].id == null)
        checkpoints[i].id = i
    }

    for (const cp of checkpoints) {
      if (cp.type !== 'line' || cp.vertices.length < 2 || !cp.id) continue

      const [a, b] = cp.vertices
      const abx = b.x - a.x
      const aby = b.y - a.y
      const apx = pos.x - a.x
      const apy = pos.y - a.y

      const abLen2 = abx * abx + aby * aby || 1
      let t = (apx * abx + apy * aby) / abLen2

      if (t < 0 || t > 1) continue

      const projx = a.x + t * abx
      const projy = a.y + t * aby
      const dx = pos.x - projx
      const dy = pos.y - projy
      const dist = Math.hypot(dx, dy)

      if (dist >= CHECKPOINT_DETECTION_RADIUS) continue

      const lastSide = this._cpLastSides.get(cp.id) ?? 0
      const side = HELPERS.segmentSide(a.x, a.y, b.x, b.y, pos.x, pos.y)

      if (lastSide !== 0 && side !== 0 && side !== lastSide) {
        this.checkpointsVisited.add(cp.id)
      }

      this._cpLastSides.set(cp.id, side)
    }
  }

  checkLapCompletion() {
    const roomMapKey = this.room ? this.room.currentMapKey : 'square';
    const { category: mapCategory, key: mapKey } = HELPERS.parseMapKey(roomMapKey);
    const mapDef = mapManager.getMap(mapKey, mapCategory);

    let insideStart = false
    if (mapDef?.start?.vertices?.length) {
      insideStart = HELPERS.pointInPolygon(this.body.position.x, this.body.position.y, mapDef.start.vertices)
    }

    if (!insideStart && !this.hasLeftStartSinceLap) {
      if (this.currentLapStartTime === 0) {
        this.currentLapStartTime = Date.now();
      }
    }

    if (!insideStart) this.hasLeftStartSinceLap = true

    const checkpoints = mapDef?.checkpoints || []
    if (
      insideStart &&
      this.hasLeftStartSinceLap &&
      checkpoints.length > 0 &&
      checkpoints.every(cp => this.checkpointsVisited.has(cp.id))
    ) {
      const lapTime = this.currentLapStartTime > 0 ? Date.now() - this.currentLapStartTime : null;
      if (lapTime && (!this.bestLapTime || lapTime < this.bestLapTime)) {
        this.bestLapTime = lapTime;
        this.saveStatsToRoom();

        if (this.room && this.room.gamemode === 'time_trial') {
          const socket = io.sockets.sockets.get(this.socketId);
          if (socket && socket.request.session && socket.request.session.userId && !socket.request.session.isGuest) {
            const userId = socket.request.session.userId;

            try {
              const hadPreviousTime = userDb.hasCompletedTimeTrialOnMap(userId, mapKey, mapCategory);
              const saved = userDb.saveLapTime(userId, mapKey, mapCategory, lapTime);

              if (saved) {
                const rankInfo = userDb.getUserMapRank(userId, mapKey, mapCategory);
                const leaderboard = userDb.getMapLeaderboard(mapKey, mapCategory, 1000);
                socket.emit('timeTrialRecord', {
                  lapTime: lapTime,
                  isNewBest: true,
                  rank: rankInfo?.rank || null,
                  totalPlayers: leaderboard.length,
                  isFirstCompletion: !hadPreviousTime
                });
              }
            } catch (error) {
              console.error('Failed to save time trial record:', error);
            }
          }
        }
      }

      this.currentLapStartTime = Date.now();
      this.laps += 1

      if (!this.room || this.room.gamemode !== 'time_trial') {
        this.upgradePoints += 1
      }

      this.currentHealth = this.stats.maxHealth;
      this.checkpointsVisited.clear()
      this.hasLeftStartSinceLap = false
      this.currentBoost = this.maxBoost
    }
  }
  resetCar() {
    const roomMapKey = this.room ? this.room.currentMapKey : 'square';
    
    const { category: mapCategory, key: mapKey } = HELPERS.parseMapKey(roomMapKey);
    
    const map = mapManager.getMap(mapKey, mapCategory);
    let startPos = { x: 0, y: 0 }
    if (map.start?.vertices?.length) {
      const verts = map.start.vertices
      startPos = {
        x: verts.reduce((sum, v) => sum + v.x, 0) / verts.length,
        y: verts.reduce((sum, v) => sum + v.y, 0) / verts.length
      }
    } else if (typeof map.start?.x === 'number' && typeof map.start?.y === 'number') {
      startPos = map.start
    }
    this.laps = 0;
    this.currentHealth = this.stats.maxHealth;
    this.prevFinishCheck = null;
    this.upgradeUsage = {};
    
    // Reset lap timing (preserve bestLapTime from map stats if available)
    const mapStats = this.room?.mapStats?.get(this.socketId);
    this.bestLapTime = mapStats?.bestLapTime || null;
    this.currentLapStartTime = 0;
    
    // Restore boost on new life
    this.currentBoost = this.maxBoost;
    this.boostActive = false;
    this.justCrashed = false;
    this.crashedByPlayer = false;
    this.killFeedSent = false;
    this.crashedAt = null;
    this.damageTagHistory = []; // Clear damage tags on respawn
    this.godMode = true; // Respawn protection
    this.spawnProtectionEnd = Date.now() + SPAWN_PROTECTION_MS; // 1 second of spawn protection
    Matter.Body.setPosition(this.body, { x: startPos.x, y: startPos.y });
    Matter.Body.setVelocity(this.body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(this.body, 0);
    Matter.Body.setAngle(this.body, 0);
  }
  applyCollisionDamage(otherBody, relativeSpeed, damageScale = 1.0, collisionPair = null) {
    // Don't take damage if god mode is enabled
    if (this.godMode) return;

    // Check portal invulnerability (brief grace period after teleporting)
    if (this.portalInvulnerable) {
      const now = Date.now();
      if (now < this.portalInvulnerableUntil) {
        return; // Still invulnerable
      } else {
        // Invulnerability expired, clear the flag
        this.portalInvulnerable = false;
        this.portalInvulnerableUntil = 0;
      }
    }

    if (relativeSpeed < MIN_DAMAGE_VELOCITY) return;
    
    const otherDensity = otherBody.density || 0.001;
    const thisDensity = this.body.density || 0.001;
    const densityRatio = otherDensity / thisDensity;
    
    // Cap the damage multiplier to prevent one-hit kills
    const damageMultiplier = Math.max(MIN_DAMAGE_MULTIPLIER, Math.min(MAX_DAMAGE_MULTIPLIER, densityRatio));
    
    let angleMultiplier = 1.0; // Default to full damage if no collision pair data
    if (collisionPair) {
      const thisVelocity = this.body.velocity;
      const otherVelocity = otherBody.velocity || { x: 0, y: 0 }; // Static bodies have no velocity
      const relativeVelocity = {
        x: thisVelocity.x - otherVelocity.x,
        y: thisVelocity.y - otherVelocity.y
      };
      
      const collisionNormal = getCollisionNormal(collisionPair, this.body, otherBody);
      const impactAngle = calculateImpactAngle(relativeVelocity, collisionNormal);
      angleMultiplier = getAngleDamageMultiplier(impactAngle);
    }
    
    // Velocity-based damage calculation with angle scaling
    let damage;
    if (otherBody.isStatic) {
      // Static wall collisions use different scale
      damage = (relativeSpeed * 1.5) * WALL_VELOCITY_DAMAGE_SCALE * damageMultiplier * damageScale * angleMultiplier;
    } else {
      // Dynamic body collisions (car vs car, car vs dynamic object)
      damage = (relativeSpeed * 1.5) * BASE_VELOCITY_DAMAGE_SCALE * damageMultiplier * damageScale * angleMultiplier;
    }

    // add anchor damage res
    if (this.anchorResistance && this.anchorResistance > 0) {
      damage *= (1 - this.anchorResistance);
    }

    this.currentHealth -= damage;

    if (this.currentHealth <= 0) {
      this.justCrashed = true;
    }
  }
  
  useAbility(gameState) {
    if (!this.ability) {
      return { success: false, reason: 'no_ability' };
    }
    
    const roomWorld = this.room ? this.room.world : world;
    const roomGameState = this.room ? this.room.gameState : (gameState || this.room?.gameState);
    return this.ability.activate(this, roomWorld, roomGameState);
  }
  
  // Save current statistics to room's per-map stats
  saveStatsToRoom() {
    if (this.room && this.socketId) {
      this.room.mapStats.set(this.socketId, {
        kills: this.kills,
        deaths: this.deaths,
        bestLapTime: this.bestLapTime,
        level: this.level
      });
    }
  }
  
  calculateFallbackSpawnPosition(mapDef) {
    if (!mapDef || !mapDef.shapes || !Array.isArray(mapDef.shapes)) {
      // No shapes to work with, use a safe default
      return { x: 100, y: 0 };
    }
    
    // Find all vertices from all shapes to calculate map bounds
    let allVertices = [];
    for (const shape of mapDef.shapes) {
      if (shape.vertices && Array.isArray(shape.vertices)) {
        allVertices = allVertices.concat(shape.vertices);
      }
    }
    
    if (allVertices.length === 0) {
      // No vertices found, use safe default
      return { x: 100, y: 0 };
    }
    
    const avgX = allVertices.reduce((sum, v) => sum + v.x, 0) / allVertices.length;
    const avgY = allVertices.reduce((sum, v) => sum + v.y, 0) / allVertices.length;
    
    const minX = Math.min(...allVertices.map(v => v.x));
    const maxX = Math.max(...allVertices.map(v => v.x));
    const minY = Math.min(...allVertices.map(v => v.y));
    const maxY = Math.max(...allVertices.map(v => v.y));
    
    // Try to find a position that's likely to be in open space
    // Use the center, but offset towards the top or bottom to avoid walls
    const mapWidth = maxX - minX;
    const mapHeight = maxY - minY;
    
    // Offset from center towards what's likely to be open space
    let spawnX = avgX;
    let spawnY = avgY - mapHeight * 0.2; // Offset towards top of map
    
    if (spawnY < minY + 50) {
      spawnY = avgY + mapHeight * 0.2; // Try bottom
    }
    
    spawnX = Math.max(minX + 100, Math.min(maxX - 100, spawnX));
    spawnY = Math.max(minY + 100, Math.min(maxY - 100, spawnY));
    
    
    return { x: spawnX, y: spawnY };
  }
}

class Room {
  constructor(id, mapKey = null, isOfficial = false) {
    this.id = id;
    this.name = `Room ${id.substring(0, 8)}`; // first 8 chars of uuid
    this.players = new Map(); // socket.id -> Car (active players)
    this.carIdMap = new Map(); // car.id -> Car
    this.carBodyMap = new Map(); // car.body -> Car (for collision detection)
    this.spectators = new Map(); // socket.id -> socket (spectators)
    this.allMembers = new Map(); // socket.id -> {socket, state, joinedAt} (all connected users)
    this.sockets = new Map();
    this.maxPlayers = 8;
    this.isPrivate = false;
    this.isOfficial = isOfficial;
    this.gamemode = 'standard'; // 'standard' or 'time_trial'

    this.engine = Matter.Engine.create();
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;
    this.world = this.engine.world;
    
    this.gameState = {
      abilityObjects: [],
      activeEffects: []
    };
    
    const mapKeys = mapManager.getAllMapKeys();
    this.currentMapIndex = 0;
    this.currentMapKey = mapKey || mapKeys[this.currentMapIndex] || 'square';
    this.currentMapParsed = HELPERS.parseMapKey(this.currentMapKey);
    this.currentTrackBodies = [];
    this.currentDynamicBodies = [];
    this.currentConstraints = [];

    this.playerIdMap = new Map();
    this.nextPlayerId = 1;

    this.winMessageSent = false;
    
    // Per-map statistics tracking (preserved until map changes)
    this.mapStats = new Map(); // socketId -> { kills, deaths, bestLapTime }
    
    this.setupCollisionDetection();
    
    this.setTrackBodies(this.currentMapKey);
  }
  
  static USER_STATES = {
    SPECTATING: 'spectating',
    PLAYING: 'playing',
    LOBBY: 'lobby'
  }
  
  // Computed properties for occupancy tracking
  get activePlayerCount() {
    return this.players.size;
  }
  
  get spectatorCount() {
    return this.spectators.size;
  }
  
  get totalOccupancy() {
    return this.allMembers.size;
  }
  
  get availableSlots() {
    return this.maxPlayers - this.totalOccupancy;
  }
  
  get isJoinable() {
    return !this.isPrivate && this.availableSlots > 0;
  }
  
  get isEmpty() {
    return this.totalOccupancy === 0;
  }
  
  get activityScore() {
    if (!this.isJoinable) return -1;
    if (!this.isOfficial) return -1; // Never auto-assign to non-official rooms
    
    const occupancyPercent = (this.totalOccupancy / this.maxPlayers) * 100;
    const idealPercent = 50; // Target 50% capacity for good activity
    
    // Score based on how close to ideal capacity (0-100 scale)
    let score = Math.max(0, 100 - Math.abs(occupancyPercent - idealPercent) * 2);
    
    // Bonus for rooms with active players (not just spectators)
    if (this.activePlayerCount > 0) {
      score += 20;
    }
    
    // Penalty for very empty rooms (less than 10% capacity)
    if (occupancyPercent < 10) {
      score -= 30;
    }
    
    return Math.max(0, score);
  }
  
  setupCollisionDetection() {
    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair
    
        const isCarA = bodyA.label?.startsWith?.('car-')
        const isCarB = bodyB.label?.startsWith?.('car-')
        
        const isSpikeA = bodyA.label === 'spike-trap'
        const isSpikeB = bodyB.label === 'spike-trap'

        const isCannonballA = bodyA.label === 'cannonball'
        const isCannonballB = bodyB.label === 'cannonball'

        const isPortalProjectileA = bodyA.label === 'portal-projectile'
        const isPortalProjectileB = bodyB.label === 'portal-projectile'

        const isExplosionProjectileA = bodyA.label === 'explosion-projectile'
        const isExplosionProjectileB = bodyB.label === 'explosion-projectile'

        const isPortalOrangeA = bodyA.label === 'portal_orange'
        const isPortalOrangeB = bodyB.label === 'portal_orange'

        const isPortalBlueA = bodyA.label === 'portal_blue'
        const isPortalBlueB = bodyB.label === 'portal_blue'

        const findCarFromBody = (body) => {
          let car = this.carBodyMap.get(body)
          if (car) {
            return car
          }

          if (body.label?.includes('car-') && body.label?.includes('shape-')) {
            const match = body.label.match(/^car-(.+)-shape-\d+$/)
            if (match) {
              const carId = match[1]
              car = this.carIdMap.get(carId)
              if (car) {
                return car
              }
            }
          }

          return null
        }
    
        const carA = isCarA ? findCarFromBody(bodyA) : null
        const carB = isCarB ? findCarFromBody(bodyB) : null
    
        if (isSpikeA && carB) {
          const trap = this.gameState.abilityObjects.find(obj => obj.body === bodyA)
          if (trap) {
            if (trap.createdBy !== carB.id) {
              SpikeTrapAbility.handleCollision(trap, carB)
            }
          }
        }
        if (isSpikeB && carA) {
          const trap = this.gameState.abilityObjects.find(obj => obj.body === bodyB)
          if (trap) {
            if (trap.createdBy !== carA.id) {
              SpikeTrapAbility.handleCollision(trap, carA)
            }
          }
        }

        if (isCannonballA && carB) {
          const projectile = this.gameState.abilityObjects.find(obj => obj.body === bodyA)
          if (projectile) {
            CannonAbility.handleCollision(projectile, carB)
          }
        }
        if (isCannonballB && carA) {
          const projectile = this.gameState.abilityObjects.find(obj => obj.body === bodyB)
          if (projectile) {
            CannonAbility.handleCollision(projectile, carA)
          }
        }

        // Portal projectile collisions - create portals on ANY collision
        if (isPortalProjectileA) {
          const projectile = this.gameState.abilityObjects.find(obj => obj.body === bodyA)
          if (projectile) {
            PortalAbility.handlePortalProjectileCollision(projectile, bodyB, this.world, this.gameState, this)
          }
        }
        if (isPortalProjectileB) {
          const projectile = this.gameState.abilityObjects.find(obj => obj.body === bodyB)
          if (projectile) {
            PortalAbility.handlePortalProjectileCollision(projectile, bodyA, this.world, this.gameState, this)
          }
        }

        // Explosion projectile collisions - create explosion on ANY collision
        if (isExplosionProjectileA) {
          const projectile = this.gameState.abilityObjects.find(obj => obj.body === bodyA)
          if (projectile) {
            PortalAbility.handleExplosionProjectileCollision(projectile, bodyB, this.world, this.gameState, this)
          }
        }
        if (isExplosionProjectileB) {
          const projectile = this.gameState.abilityObjects.find(obj => obj.body === bodyB)
          if (projectile) {
            PortalAbility.handleExplosionProjectileCollision(projectile, bodyA, this.world, this.gameState, this)
          }
        }

        // Portal teleportation - when cars touch portals
        if (isPortalOrangeA && carB) {
          const portal = this.gameState.abilityObjects.find(obj => obj.body === bodyA)
          if (portal) {
            PortalAbility.handlePortalTeleport(portal, carB, this.gameState)
          }
        }
        if (isPortalOrangeB && carA) {
          const portal = this.gameState.abilityObjects.find(obj => obj.body === bodyB)
          if (portal) {
            PortalAbility.handlePortalTeleport(portal, carA, this.gameState)
          }
        }
        if (isPortalBlueA && carB) {
          const portal = this.gameState.abilityObjects.find(obj => obj.body === bodyA)
          if (portal) {
            PortalAbility.handlePortalTeleport(portal, carB, this.gameState)
          }
        }
        if (isPortalBlueB && carA) {
          const portal = this.gameState.abilityObjects.find(obj => obj.body === bodyB)
          if (portal) {
            PortalAbility.handlePortalTeleport(portal, carA, this.gameState)
          }
        }

        if (!isSpikeA && !isSpikeB && !isCannonballA && !isCannonballB && !isPortalProjectileA && !isPortalProjectileB && !isExplosionProjectileA && !isExplosionProjectileB) {
          const bodyAVel = carA ? carA.body.velocity : bodyA.velocity;
          const bodyBVel = carB ? carB.body.velocity : bodyB.velocity;
          
          const relativeVelocityX = bodyAVel.x - bodyBVel.x;
          const relativeVelocityY = bodyAVel.y - bodyBVel.y;
          const relativeSpeed = Math.sqrt(relativeVelocityX * relativeVelocityX + relativeVelocityY * relativeVelocityY);
          
          
          if (carA && carB && !carA.isGhost && !carB.isGhost) {
            this.applyMutualCollisionDamage(carA, carB, relativeSpeed, pair);
          } else {
            if (carA && !carA.isGhost) {
              const damageScale = (bodyB.dynamicObject && typeof bodyB.dynamicObject.damageScale === 'number') 
                ? bodyB.dynamicObject.damageScale : 1.0;
              carA.applyCollisionDamage(bodyB, relativeSpeed, damageScale, pair);
            }
            if (carB && !carB.isGhost) {
              const damageScale = (bodyA.dynamicObject && typeof bodyA.dynamicObject.damageScale === 'number') 
                ? bodyA.dynamicObject.damageScale : 1.0;
              carB.applyCollisionDamage(bodyA, relativeSpeed, damageScale, pair);
            }
          }
          
          const isDynamicA = bodyA.label && bodyA.label.startsWith('dynamic-');
          const isDynamicB = bodyB.label && bodyB.label.startsWith('dynamic-');
          
          if (isDynamicA && carB) {
            this.applyDynamicObjectDamage(bodyA, bodyB, relativeSpeed);
          }
          if (isDynamicB && carA) {
            this.applyDynamicObjectDamage(bodyB, bodyA, relativeSpeed);
          }
        }
      }
    });
  }
  
  // Move collision damage methods from global scope to Room scope
  applyMutualCollisionDamage(carA, carB, relativeSpeed, collisionPair = null) {
    if (!carA || !carB || carA.godMode || carB.godMode || carA.isGhost || carB.isGhost) return;

    // Check portal invulnerability for both cars
    const now = Date.now();
    const carAInvulnerable = carA.portalInvulnerable && now < carA.portalInvulnerableUntil;
    const carBInvulnerable = carB.portalInvulnerable && now < carB.portalInvulnerableUntil;

    // Clear expired invulnerability
    if (carA.portalInvulnerable && now >= carA.portalInvulnerableUntil) {
      carA.portalInvulnerable = false;
      carA.portalInvulnerableUntil = 0;
    }
    if (carB.portalInvulnerable && now >= carB.portalInvulnerableUntil) {
      carB.portalInvulnerable = false;
      carB.portalInvulnerableUntil = 0;
    }

    // If either car is invulnerable, skip mutual damage
    if (carAInvulnerable || carBInvulnerable) return;

    if (relativeSpeed < MIN_DAMAGE_VELOCITY) return;
    
    const carAInitialHealth = carA.currentHealth;
    const carBInitialHealth = carB.currentHealth;
    
    const damageA = this.calculateCollisionDamage(carA, carB.body, relativeSpeed, collisionPair);
    const damageB = this.calculateCollisionDamage(carB, carA.body, relativeSpeed, collisionPair);

    carA.currentHealth -= damageA;
    carB.currentHealth -= damageB;
    
    const carACrashed = carA.currentHealth <= 0;
    const carBCrashed = carB.currentHealth <= 0;
    
    if (carACrashed) {
      carA.justCrashed = true;
      carA.crashedByPlayer = true; // Mark as player collision crash
    }
    if (carBCrashed) {
      carB.justCrashed = true;
      carB.crashedByPlayer = true; // Mark as player collision crash
    }
    
    // Award upgrade points for successful collision kills and broadcast crash events
    if (carACrashed && !carBCrashed) {
      carB.upgradePoints += 1;
      carB.kills += 1; // Track kill
      carA.deaths += 1; // Track death
      carB.saveStatsToRoom();
      carA.saveStatsToRoom();

      // Award XP for kill in official rooms
      if (this.isOfficial) {
        const killerSocket = io.sockets.sockets.get(carB.socketId);
        if (killerSocket && killerSocket.request.session && killerSocket.request.session.userId && !killerSocket.request.session.isGuest) {
          const userId = killerSocket.request.session.userId;
          const xpAwarded = userDb.addXP(userId, KILL_XP_REWARD);
          if (xpAwarded) {
            killerSocket.emit('xpGained', { amount: KILL_XP_REWARD, reason: 'Kill' });
          }
          userDb.addKill(userId);
        }

        const victimSocket = io.sockets.sockets.get(carA.socketId);
        if (victimSocket?.request?.session?.userId && !victimSocket.request.session.isGuest) {
          userDb.addDeath(victimSocket.request.session.userId);
        }
      }

      // Broadcast kill feed message to this room
      this.broadcastKillFeedMessage(`${carB.name} crashed ${carA.name}!`, 'crash');
    } else if (carBCrashed && !carACrashed) {
      carA.upgradePoints += 1;
      carA.kills += 1; // Track kill
      carB.deaths += 1; // Track death
      carA.saveStatsToRoom();
      carB.saveStatsToRoom();

      // Award XP for kill in official rooms
      if (this.isOfficial) {
        const killerSocket = io.sockets.sockets.get(carA.socketId);
        if (killerSocket && killerSocket.request.session && killerSocket.request.session.userId && !killerSocket.request.session.isGuest) {
          const userId = killerSocket.request.session.userId;
          const xpAwarded = userDb.addXP(userId, KILL_XP_REWARD);
          if (xpAwarded) {
            killerSocket.emit('xpGained', { amount: KILL_XP_REWARD, reason: 'Kill' });
          }
          userDb.addKill(userId);
        }

        const victimSocket = io.sockets.sockets.get(carB.socketId);
        if (victimSocket?.request?.session?.userId && !victimSocket.request.session.isGuest) {
          userDb.addDeath(victimSocket.request.session.userId);
        }
      }

      // Broadcast kill feed message to this room
      this.broadcastKillFeedMessage(`${carA.name} crashed ${carB.name}!`, 'crash');
    } else if (carACrashed && carBCrashed) {
      // Both crashed - mutual destruction (both get a death, no kills)
      carA.deaths += 1;
      carB.deaths += 1;
      carA.saveStatsToRoom();
      carB.saveStatsToRoom();

      if (this.isOfficial) {
        const socketA = io.sockets.sockets.get(carA.socketId);
        if (socketA?.request?.session?.userId && !socketA.request.session.isGuest) {
          userDb.addDeath(socketA.request.session.userId);
        }

        const socketB = io.sockets.sockets.get(carB.socketId);
        if (socketB?.request?.session?.userId && !socketB.request.session.isGuest) {
          userDb.addDeath(socketB.request.session.userId);
        }
      }

      this.broadcastKillFeedMessage(`${carA.name} and ${carB.name} crashed!`, 'crash');
    } else {
      // Both cars survived - add damage tags for potential delayed kill credit
      const now = Date.now();
      carA.damageTagHistory.push({ attackerId: carB.id, timestamp: now });
      carB.damageTagHistory.push({ attackerId: carA.id, timestamp: now });
    }
  }
  
  calculateCollisionDamage(car, otherBody, relativeSpeed, collisionPair = null, damageScale = 1.0) {
    if (relativeSpeed < MIN_DAMAGE_VELOCITY) return 0;
    
    const otherDensity = otherBody.density || 0.001;
    const thisDensity = car.body.density || 0.3;
    const densityRatio = otherDensity / thisDensity;
    
    // Cap the damage multiplier to prevent one-hit kills
    const damageMultiplier = Math.max(MIN_DAMAGE_MULTIPLIER, Math.min(MAX_DAMAGE_MULTIPLIER, densityRatio));
    
    let angleMultiplier = 1.0; // Default to full damage if no collision pair data
    if (collisionPair) {
      const thisVelocity = car.body.velocity;
      const otherVelocity = otherBody.velocity || { x: 0, y: 0 }; // Static bodies have no velocity
      const relativeVelocity = {
        x: thisVelocity.x - otherVelocity.x,
        y: thisVelocity.y - otherVelocity.y
      };
      
      const collisionNormal = getCollisionNormal(collisionPair, car.body, otherBody);
      const impactAngle = calculateImpactAngle(relativeVelocity, collisionNormal);
      angleMultiplier = getAngleDamageMultiplier(impactAngle);
    }
    
    // Velocity-based damage calculation with angle scaling
    if (otherBody.isStatic) {
      // Static wall collisions use different scale
      return relativeSpeed * WALL_VELOCITY_DAMAGE_SCALE * damageMultiplier * damageScale * angleMultiplier;
    } else {
      // Dynamic body collisions (car vs car, car vs dynamic object)
      return relativeSpeed * BASE_VELOCITY_DAMAGE_SCALE * damageMultiplier * damageScale * angleMultiplier;
    }
  }
  
  applyDynamicObjectDamage(dynamicBody, carBody, relativeSpeed) {
    // Implementation for dynamic object damage using velocity-based system
    if (!dynamicBody.dynamicObject) return;
    
    // Only apply damage if the object has maxHealth defined
    if (typeof dynamicBody.dynamicObject.maxHealth === 'undefined') {
      // No health system for this object - it's indestructible
      return;
    }
    
    if (typeof dynamicBody.health === 'undefined') {
      dynamicBody.health = dynamicBody.dynamicObject.maxHealth;
    }
    
    if (relativeSpeed < MIN_DAMAGE_VELOCITY) return;
    
    const otherDensity = carBody.density || 0.3;
    const thisDensity = dynamicBody.density || 0.01;
    const densityRatio = otherDensity / thisDensity;
    
    // Dynamic objects are more fragile than cars
    const DYNAMIC_VELOCITY_DAMAGE_SCALE = 0.2;
    const damageMultiplier = Math.min(20.0, densityRatio); // Higher cap for fragile objects
    const damage = relativeSpeed * DYNAMIC_VELOCITY_DAMAGE_SCALE * damageMultiplier;
    
    dynamicBody.health -= damage;
    
    // Visual feedback for damage (could reduce opacity, change color, etc.)
    if (dynamicBody.health <= 0) {
      // Mark as destroyed (could remove from world or change appearance)
      dynamicBody.isDestroyed = true;
      Matter.Body.setDensity(dynamicBody, 0.001);
    }
  }
  
  broadcastKillFeedMessage(text, type) {
    for (const [socketId, car] of this.players.entries()) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('killFeedMessage', { text, type });
      }
    }
  }
  
  setTrackBodies(mapKey) {
    this.mapStats.clear();

    for (const body of this.currentTrackBodies) {
      Matter.World.remove(this.world, body)
    }
    this.currentTrackBodies = []

    for (const body of this.currentDynamicBodies) {
      Matter.World.remove(this.world, body)
    }
    this.currentDynamicBodies = []

    if (this.currentConstraints) {
      for (const constraint of this.currentConstraints) {
        Matter.World.remove(this.world, constraint)
      }
      this.currentConstraints = []
    }

    for (const obj of this.gameState.abilityObjects) {
      if (obj.body) {
        Matter.World.remove(this.world, obj.body);
      }
    }
    this.gameState.abilityObjects = [];
    this.gameState.activeEffects = [];

    this.currentMapParsed = HELPERS.parseMapKey(mapKey);
    const { category: categoryToCheck, key: keyToCheck } = this.currentMapParsed;

    const map = mapManager.getMap(keyToCheck, categoryToCheck)
    if (!map) return

    if (map.shapes) {
      for (const shape of map.shapes) {
        if (!Array.isArray(shape.vertices)) continue

        const verts = shape.vertices
        if (verts.length < 3) continue

        if (shape.fillCollision === true) {
          const fillBodyOptions = HELPERS.getBodyOptionsFromShape(shape)

          try {
            let area = 0;
            for (let i = 0; i < verts.length; i++) {
              const v = verts[i];
              const vn = verts[(i + 1) % verts.length];
              area += (v.x * vn.y - vn.x * v.y) / 2;
            }

            let cx = 0, cy = 0;
            for (let i = 0; i < verts.length; i++) {
              const v = verts[i];
              const vn = verts[(i + 1) % verts.length];
              const cross = v.x * vn.y - vn.x * v.y;
              cx += (v.x + vn.x) * cross / (6 * area);
              cy += (v.y + vn.y) * cross / (6 * area);
            }

            const geometricCenter = { x: cx, y: cy };

            const relativeVertices = verts.map(v => ({
              x: v.x - geometricCenter.x,
              y: v.y - geometricCenter.y
            }));

            const fillBody = Matter.Bodies.fromVertices(
              geometricCenter.x,
              geometricCenter.y,
              [relativeVertices],
              fillBodyOptions
            );

            const inputBounds = {
              minX: Math.min(...verts.map(v => v.x)),
              minY: Math.min(...verts.map(v => v.y)),
              maxX: Math.max(...verts.map(v => v.x)),
              maxY: Math.max(...verts.map(v => v.y))
            };

            if (fillBody && fillBody.vertices && fillBody.vertices.length > 0) {
              const boundsOffset = {
                x: inputBounds.minX - fillBody.bounds.min.x,
                y: inputBounds.minY - fillBody.bounds.min.y
              };

              const newPosition = {
                x: fillBody.position.x + boundsOffset.x,
                y: fillBody.position.y + boundsOffset.y
              }

              Matter.Body.setPosition(fillBody, newPosition, true);
              Matter.Body.setVelocity(fillBody, { x: 0, y: 0 });

              fillBody.label = 'shape-fill';
              this.currentTrackBodies.push(fillBody);
            } else {
              console.warn('something went wrong when creating fill collision for a shape');
            }
          } catch (error) {
            console.error('something went wrong when creating fill collision for a shape', error);
          }
        }

        // Create border collision bodies (skip if hollow or borderCollision is false)
        if (shape.hollow || shape.borderCollision === false) continue

        for (let i = 0; i < verts.length; i++) {
          const a = verts[i]
          const b = verts[(i + 1) % verts.length]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const length = Math.sqrt(dx * dx + dy * dy)
          const angle = Math.atan2(dy, dx)
          const cx = (a.x + b.x) / 2
          const cy = (a.y + b.y) / 2

          const bodyOptions = {
            ...HELPERS.getBodyOptionsFromShape(shape),
            angle
          }
          const wall = Matter.Bodies.rectangle(cx, cy, length + shape.borderWidth, shape.borderWidth, bodyOptions)
          this.currentTrackBodies.push(wall)
        }
      }
    }

    if (map.dynamicObjects) {
      for (const dynObj of map.dynamicObjects) {
        if (!dynObj.vertices || !Array.isArray(dynObj.vertices) || dynObj.vertices.length < 3) {
          continue
        }

        const centroid = {
          x: dynObj.vertices.reduce((sum, v) => sum + v.x, 0) / dynObj.vertices.length,
          y: dynObj.vertices.reduce((sum, v) => sum + v.y, 0) / dynObj.vertices.length
        }
        
        const relativeVertices = dynObj.vertices.map(v => ({
          x: v.x - centroid.x,
          y: v.y - centroid.y
        }))

        const bodyOptions = {
          ...HELPERS.getBodyOptionsFromShape(dynObj),
          label: `dynamic-${dynObj.id || 'object'}`
        }
        
        const body = Matter.Bodies.fromVertices(centroid.x, centroid.y, [relativeVertices], bodyOptions)

        if (typeof dynObj.frictionAir === 'number') {
          body.frictionAir = dynObj.frictionAir;
        }

        body.originalVertices = relativeVertices;
        body.dynamicObject = dynObj

        // Mark if collision is disabled (default: true for backward compatibility)
        if (dynObj.collision === false) {
          body.noCollision = true
        }

        this.currentDynamicBodies.push(body)

        // Create constraint if axis is defined
        if (dynObj.axis && typeof dynObj.axis.x === 'number' && typeof dynObj.axis.y === 'number') {
          // Calculate local point on the body where axis should attach
          const localX = dynObj.axis.x - centroid.x
          const localY = dynObj.axis.y - centroid.y

          const constraint = Matter.Constraint.create({
            pointA: { x: dynObj.axis.x, y: dynObj.axis.y },  // World position (fixed)
            bodyB: body,                                       // The dynamic object
            pointB: { x: localX, y: localY },                  // Local point on object
            length: 0,                                          // Fixed pivot
            stiffness: dynObj.axis.stiffness || 1,             // Rigidity
            damping: dynObj.axis.damping || 0.1                // Resistance
          })

          Matter.World.add(this.world, constraint)

          // Store constraint reference for cleanup
          if (!this.currentConstraints) {
            this.currentConstraints = []
          }
          this.currentConstraints.push(constraint)
        }
      }
    }

    if (this.currentTrackBodies.length > 0) {
      Matter.World.add(this.world, this.currentTrackBodies)
    }
    if (this.currentDynamicBodies.length > 0) {
      // Only add dynamic bodies that have collision enabled
      const collisionEnabledBodies = this.currentDynamicBodies.filter(body => !body.noCollision)
      if (collisionEnabledBodies.length > 0) {
        Matter.World.add(this.world, collisionEnabledBodies)
      }
    }
  }
  
  addMember(socket, state = Room.USER_STATES.SPECTATING) {
    const isExistingMember = this.allMembers.has(socket.id);
    
    // Only check capacity for NEW members, not state changes
    if (!isExistingMember && this.availableSlots <= 0) {
      throw new Error('Room is full');
    }
    
    this.allMembers.set(socket.id, {
      socket: socket,
      state: state,
      joinedAt: isExistingMember ? this.allMembers.get(socket.id).joinedAt : Date.now(),
      lastActivityTime: Date.now(),
      afkWarningGiven: false
    });
    
    if (state === Room.USER_STATES.SPECTATING) {
      this.spectators.set(socket.id, socket);
    }
    
    const action = isExistingMember ? 'changed state to' : 'joined room as';
  }
  
  removeMember(socketId) {
    const member = this.allMembers.get(socketId);
    if (!member) return false;

    this.spectators.delete(socketId);
    if (this.players.has(socketId)) {
      const car = this.players.get(socketId);
      if (car && car.body) {
        this.carBodyMap.delete(car.body);
        Matter.World.remove(this.world, car.body);
        car.body = null;
      }
      if (car) {
        this.carIdMap.delete(car.id);
      }
      this.players.delete(socketId);
    }

    this.allMembers.delete(socketId);
    this.playerIdMap.delete(socketId);

    return true;
  }

  getPlayerNumericId(socketId) {
    if (!this.playerIdMap.has(socketId)) {
      this.playerIdMap.set(socketId, this.nextPlayerId++);
    }
    return this.playerIdMap.get(socketId);
  }
  
  // Transition user from spectator to player
  promoteToPlayer(socket, carType, name, level) {
    const member = this.allMembers.get(socket.id);
    if (!member) {
      throw new Error('User not in room');
    }
    
    if (member.state === Room.USER_STATES.PLAYING) {
      throw new Error('User already playing');
    }
    
    this.spectators.delete(socket.id);

    const carId = uuidv4();
    const car = new Car(carId, carType, this.id, socket.id, name, level, this);
    this.players.set(socket.id, car);
    this.carIdMap.set(carId, car);
    if (car.body) {
      this.carBodyMap.set(car.body, car);
    }

    member.state = Room.USER_STATES.PLAYING;
    
    return car;
  }
  
  // Transition user from player back to spectator
  demoteToSpectator(socketId) {
    const member = this.allMembers.get(socketId);
    if (!member) return false;
    
    if (member.state !== Room.USER_STATES.PLAYING) return false;
    
    if (this.players.has(socketId)) {
      const car = this.players.get(socketId);
      if (car && car.body) {
        this.carBodyMap.delete(car.body);
        Matter.World.remove(this.world, car.body);
        car.body = null;
      }
      if (car) {
        this.carIdMap.delete(car.id);
      }
      this.players.delete(socketId);
    }

    this.spectators.set(socketId, member.socket);
    
    member.state = Room.USER_STATES.SPECTATING;
    
    return true;
  }
  
  getMemberState(socketId) {
    const member = this.allMembers.get(socketId);
    return member ? member.state : null;
  }
  
  hasMember(socketId) {
    return this.allMembers.has(socketId);
  }
  
  // Allow spectators to rejoin the game
  canRejoinAsPlayer(socketId) {
    const member = this.allMembers.get(socketId);
    return member && member.state === Room.USER_STATES.SPECTATING;
  }
  
  updateMemberActivity(socketId) {
    const member = this.allMembers.get(socketId);
    if (member) {
      member.lastActivityTime = Date.now();
      member.afkWarningGiven = false; // Reset warning if user becomes active
    }
  }
  
  checkAFKMembers() {
    const now = Date.now();
    const PLAYER_AFK_THRESHOLD = 30 * 1000; // 30 seconds for players
    const SPECTATOR_AFK_THRESHOLD = 5 * 60 * 1000; // 5 minutes for spectators
    const WARNING_TIME = 5 * 1000; // 5 seconds warning before disconnect
    
    for (const [socketId, member] of this.allMembers) {
      const timeSinceActivity = now - member.lastActivityTime;
      const isPlayer = member.state === Room.USER_STATES.PLAYING;
      const threshold = isPlayer ? PLAYER_AFK_THRESHOLD : SPECTATOR_AFK_THRESHOLD;
      
      if (timeSinceActivity > threshold) {
        if (!member.afkWarningGiven) {
          member.socket.emit('afkWarning', {
            countdown: 5,
            reason: isPlayer ? 'No input detected for 30 seconds' : 'No activity for 5 minutes'
          });
          member.afkWarningGiven = true;
        } else if (timeSinceActivity > threshold + WARNING_TIME) {
          const disconnectReason = isPlayer 
            ? 'Disconnected due to inactivity (no input for 30+ seconds)'
            : 'Disconnected due to inactivity (no activity for 5+ minutes)';
          
          member.socket.emit('forceDisconnect', { reason: disconnectReason });
          member.socket.disconnect(true);
          
        }
      }
    }
  }
  get state() {
    const cars = [];
    for (const [sid, car] of this.players.entries()) {
      const pos = car.body.position;
      cars.push({
        socketId: sid,
        id: car.id,
        type: car.type,
        x: pos.x,
        y: pos.y,
        angle: car.body.angle,
        health: car.currentHealth,
        maxHealth: car.stats.maxHealth,
        laps: car.laps,
        maxLaps: car.maxLaps,
        upgradePoints: car.upgradePoints,
        upgradeUsage: car.upgradeUsage,
        name: car.name,
        level: car.level,
        checkpointsVisited: Array.from(car.checkpointsVisited),
        // Only send vertices and color for single-shape cars (backward compatibility)
        ...((CAR_TYPES[car.type]?.shapes?.length === 1) ? {
          color: CAR_TYPES[car.type].color,
          vertices: car.body.vertices.map(v => ({
            x: v.x - pos.x,
            y: v.y - pos.y
          }))
        } : {}),
        abilityCooldownReduction: car.abilityCooldownReduction || 0,
        chargeState: car.chargeState || null,
        isAnchored: car.isAnchored || false,
        anchorResistance: car.anchorResistance || 0,
        isFocused: car.isFocused || false,
        crashed: car.justCrashed || false,
        crashedAt: car.crashedAt || null,
        currentBoost: car.currentBoost,
        maxBoost: car.maxBoost,
        kills: car.kills,
        deaths: car.deaths,
        bestLapTime: car.bestLapTime,
        kdr: car.deaths === 0 ? (car.kills > 0 ? 999 : 0) : car.kills / car.deaths
      });
    }
    return cars;
  }
  resetRound() {
    for (const car of this.players.values()) {
      car.resetCar();
      car.upgradePoints = 0;
    }
    this.gameState.abilityObjects = [];
    this.gameState.activeEffects = [];
    this.winMessageSent = false;
  }
  
  getRoomMembersData() {
    const members = [];

    for (const [socketId, member] of this.allMembers.entries()) {
      const socket = member.socket;
      const session = socket?.request?.session;

      let name = 'Connecting...';
      let isAuthenticated = false;
      let level = null;

      if (session?.username) {
        name = session.username;
        isAuthenticated = !session.isGuest;
      }

      if (member.state === Room.USER_STATES.PLAYING) {
        const car = this.players.get(socketId);
        if (car && car.name) {
          name = car.name;
          isAuthenticated = true;
          level = car.level; // Get level from active car
        }
      }

      // Get session stats from mapStats (for spectators or if car doesn't have stats yet)
      const stats = this.mapStats.get(socketId);

      // For spectators, get level from mapStats if available
      if (member.state !== Room.USER_STATES.PLAYING && stats?.level) {
        level = stats.level;
      }

      members.push({
        socketId: socketId,
        name: name,
        state: member.state,
        isAuthenticated: isAuthenticated,
        joinedAt: member.joinedAt,
        // Include session stats so spectators can see their kills/deaths/best lap
        kills: stats?.kills || 0,
        deaths: stats?.deaths || 0,
        bestLapTime: stats?.bestLapTime || null,
        level: level // null for guests, level number for authenticated users
      });
    }

    return members;
  }

  serializeAbilityObjects() {
    const serialized = this.gameState.abilityObjects.map(obj => {
      const serializedObj = {
        id: obj.id,
        type: obj.type,
        position: obj.body.position,
        angle: obj.body.angle,
        vertices: obj.body.vertices && obj.body.vertices.length > 0
          ? obj.body.vertices.map(v => ({ x: v.x - obj.body.position.x, y: v.y - obj.body.position.y }))
          : [],
        createdBy: obj.createdBy,
        expiresAt: obj.expiresAt,
        render: obj.body.render
      };

      // Include explosion radius for explosion projectiles and effects
      if (obj.explosionRadius !== undefined) {
        serializedObj.explosionRadius = obj.explosionRadius;
      }

      return serializedObj;
    });

    return serialized;
  }

  serializeDynamicObjects() {
    return this.currentDynamicBodies.map(body => {
      const objData = {
        id: body.dynamicObject?.id || body.id,
        position: body.position,
        angle: body.angle,
        vertices: body.originalVertices || body.vertices.map(v => ({ x: v.x - body.position.x, y: v.y - body.position.y })),
        fillColor: body.dynamicObject?.fillColor || [139, 69, 19],
        strokeColor: body.dynamicObject?.strokeColor || [101, 67, 33],
        strokeWidth: body.dynamicObject?.strokeWidth || 2
      };

      if (typeof body.dynamicObject?.maxHealth !== 'undefined') {
        objData.health = body.health || body.dynamicObject.maxHealth;
        objData.maxHealth = body.dynamicObject.maxHealth;
        objData.isDestroyed = body.isDestroyed || false;
      }

      return objData;
    });
  }
}

const rooms = [];

// Helper function to get a random map key
function getRandomMapKey() {
  const mapKeys = mapManager.getAllMapKeys();
  const selectedKey = mapKeys[Math.floor(Math.random() * mapKeys.length)] || 'square';
  return selectedKey;
}

// Helper function to create an official room
function createOfficialRoom() {
  const randomMapKey = getRandomMapKey();
  const roomId = uuidv4();
  const room = new Room(roomId, randomMapKey, true); // isOfficial = true
  
  // Count existing official rooms for naming
  const officialRoomCount = rooms.filter(r => r.isOfficial).length;
  room.name = `Official Room ${officialRoomCount + 1}`;
  
  rooms.push(room);
  return room;
}

// Find the best official room based on activity score
function findBestOfficialRoom() {
  const officialRooms = rooms.filter(room => room.isOfficial && room.isJoinable);
  
  if (officialRooms.length === 0) {
    return null;
  }
  
  // Sort by activity score (highest first)
  officialRooms.sort((a, b) => b.activityScore - a.activityScore);
  
  const bestRoom = officialRooms[0];
  
  return bestRoom;
}

function initializeRooms() {
  if (rooms.length === 0) {
    createOfficialRoom();
  }
}

initializeRooms();


const spectators = new Map(); // socket.id -> socket

const clientLastStates = new Map();
const binaryBufferCache = new Map();

function clonePlayerState(player) {
  const cloned = {
    socketId: player.socketId,
    id: player.id,
    type: player.type,
    x: player.x,
    y: player.y,
    angle: player.angle,
    health: player.health,
    maxHealth: player.maxHealth,
    laps: player.laps,
    maxLaps: player.maxLaps,
    upgradePoints: player.upgradePoints,
    upgradeUsage: { ...player.upgradeUsage },
    name: player.name,
    level: player.level,
    checkpointsVisited: [...player.checkpointsVisited],
    abilityCooldownReduction: player.abilityCooldownReduction,
    chargeState: player.chargeState ? { ...player.chargeState } : null,
    crashed: player.crashed
  };
  if (player.vertices) {
    cloned.vertices = player.vertices.map(v => ({ x: v.x, y: v.y }));
  }
  if (player.color) {
    cloned.color = player.color;
  }
  return cloned;
}

function createDeltaState(socketId, currentState) {
  const lastState = clientLastStates.get(socketId);

  if (!lastState) {
    clientLastStates.set(socketId, {
      players: currentState.players.map(clonePlayerState)
    });
    return currentState;
  }

  const delta = {
    players: [],
    fullUpdate: false
  };

  // Compare players and send only changes
  currentState.players.forEach((currentPlayer, i) => {
    const lastPlayer = lastState.players.find(p => p.id === currentPlayer.id);
    
    if (!lastPlayer) {
      // New player - send full data
      delta.players.push({ ...currentPlayer, isFullUpdate: true });
      return;
    }

    const posChanged = Math.abs(currentPlayer.x - lastPlayer.x) > 0.1 || 
                      Math.abs(currentPlayer.y - lastPlayer.y) > 0.1 ||
                      Math.abs(currentPlayer.angle - lastPlayer.angle) > 0.01;
    
    const healthChanged = currentPlayer.health !== lastPlayer.health;
    const lapsChanged = currentPlayer.laps !== lastPlayer.laps;

    if (posChanged || healthChanged || lapsChanged) {
      const playerDelta = { id: currentPlayer.id };
      
      if (posChanged) {
        playerDelta.x = currentPlayer.x;
        playerDelta.y = currentPlayer.y;
        playerDelta.angle = currentPlayer.angle;
        playerDelta.vertices = currentPlayer.vertices;
      }
      
      if (healthChanged) {
        playerDelta.health = currentPlayer.health;
      }
      
      if (lapsChanged) {
        playerDelta.laps = currentPlayer.laps;
        playerDelta.upgradePoints = currentPlayer.upgradePoints;
      }

      delta.players.push(playerDelta);
    }
  });

  clientLastStates.set(socketId, {
    players: currentState.players.map(clonePlayerState)
  });

  return delta.players.length > 0 ? delta : null;
}

function assignRoom() {
  // Smart room assignment: only assign to official rooms
  
  // Try to find the best official room first
  let room = findBestOfficialRoom();
  
  if (room) {
    return room;
  }
  
  // No suitable official room found, create a new one
  room = createOfficialRoom();
  return room;
}

function ensureDefaultRoom() {
  if (rooms.length === 0) {
    initializeRooms();
    return;
  }
  
  const joinableOfficialRooms = rooms.filter(room => room.isJoinable && room.isOfficial);
  
  if (joinableOfficialRooms.length === 0) {
    createOfficialRoom();
  }
}

// Enhanced room cleanup with official room protection
function cleanupEmptyRooms() {
  const nonEmptyRooms = rooms.filter(room => !room.isEmpty);
  const emptyRooms = rooms.filter(room => room.isEmpty);
  const emptyOfficialRooms = emptyRooms.filter(room => room.isOfficial);
  const emptyNonOfficialRooms = emptyRooms.filter(room => !room.isOfficial);
  
  // Always remove empty non-official rooms (user-created rooms)
  for (const room of emptyNonOfficialRooms) {
    const index = rooms.indexOf(room);
    if (index > -1) {
      rooms.splice(index, 1);
    }
  }
  
  if (emptyOfficialRooms.length > 2) {
    const roomsToRemove = emptyOfficialRooms.slice(2); // Keep at least 2 official rooms
    
    for (const room of roomsToRemove) {
      const index = rooms.indexOf(room);
      if (index > -1) {
        rooms.splice(index, 1);
      }
    }
  }
  
  ensureDefaultRoom();
}

io.on('connection', (socket) => {


  if (socket.request.session && socket.request.session.username) {
    const session = socket.request.session;
    const lockKey = session.isGuest ? `guest:${socket.request.sessionID}` : `user:${session.userId}`;

    if (sessionRegistrationLocks.has(lockKey)) {
      return;
    }

    sessionRegistrationLocks.add(lockKey);

    if (session.isGuest) {
      registerGuestSession(socket.request.sessionID, socket.id);
    } else if (session.userId) {
      const userId = session.userId;
      registerUserSession(userId, socket.id);

      if (currentDuplicateLoginPolicy === DUPLICATE_LOGIN_POLICY.KICK_EXISTING) {
        kickExistingSessions(userId, socket.id);
      }
    }

    sessionRegistrationLocks.delete(lockKey);
  }
  
  let currentRoom = null;
  let myCar = null;
  let clientSupportsBinary = false;
  
  socket.on('refreshSession', () => {
    if (socket.request.session && socket.request.sessionID && socket.request.session.username) {
      socket.request.session.reload((err) => {
        if (err) {
          console.error('Session refresh error:', err);
          socket.emit('sessionRefreshFailed', { error: 'Failed to refresh session' });
        } else {
          socket.request.session.save((saveErr) => {
            if (saveErr) {
              console.error('Session save error after refresh:', saveErr);
            }
          });
        }
      });
    }
  });
  
  socket.on('requestSpectator', (data = {}) => {
    const { roomId } = data;
    
    for (const room of rooms) {
      if (room.hasMember(socket.id)) {
        room.updateMemberActivity(socket.id);
        break;
      }
    }

    removeFromAllRooms(socket.id);

    if (rooms.length === 0) {
      initializeRooms();
    }
    
    // Find target room or use smart assignment
    let targetRoom = null;
    if (roomId) {
      targetRoom = rooms.find(room => room.id === roomId);
    }
    if (!targetRoom) {
      // Use smart room assignment for automatic assignment
      targetRoom = assignRoom();
    }
    
    try {
      if (targetRoom && targetRoom.isJoinable) {
        targetRoom.addMember(socket, Room.USER_STATES.SPECTATING);
        currentRoom = targetRoom;
        
        // Send immediate spectator state for the new room to avoid delay
        const { category: categoryToGet, key: keyToGet } = HELPERS.parseMapKey(targetRoom.currentMapKey);
        const mapData = mapManager.getMap(keyToGet, categoryToGet);
        
        const immediateSpectatorState = {
          players: [],
          roomMembers: targetRoom.getRoomMembersData(),
          abilityObjects: [],
          dynamicObjects: [],
          map: mapData,
          roomId: targetRoom.id,
          roomName: targetRoom.name,
          timestamp: Date.now()
        };
        socket.emit('spectatorState', immediateSpectatorState);
      } else {
        // Still add to global spectators for backward compatibility
        spectators.set(socket.id, socket);
      }
    } catch (error) {
      // Fallback to global spectators
      spectators.set(socket.id, socket);
    }
  });
  
  socket.on('joinGame', ({ carType, name, roomId }) => {
    if (!CAR_TYPES[carType]) return;
    
    // Try to reload session first to get latest data
    if (socket.request.session && socket.request.sessionID) {
      socket.request.session.reload((err) => {
        if (err) {
          console.error('Session reload error during join:', err);
        }
        
        
        processJoinRequest();
      });
    } else {
      
      processJoinRequest();
    }
    
    function processJoinRequest() {
    
    // TODO: Fix session sharing to properly use session-based authentication
    const playerName = name || 'Anonymous';
    if (!playerName || playerName === 'Anonymous') {
      socket.emit('joinError', { error: 'Please provide a valid name' });
      return;
    }

    let playerLevel = null;
    const session = socket.request.session;
    if (session?.userId && !session.isGuest) {
      const userData = userDb.getUserById(session.userId);
      if (userData && userData.xp) {
        playerLevel = calculateLevel(userData.xp);
      }
    }
    
    // Find target room - either specified room ID or auto-assign
    let targetRoom = null;
    if (roomId) {
      // Try to join specific room
      targetRoom = rooms.find(room => room.id === roomId);
      if (!targetRoom) {
        socket.emit('joinError', { error: 'Room not found' });
        return;
      }
      
      const isAlreadyMember = targetRoom.hasMember(socket.id);
      
      if (!isAlreadyMember && !targetRoom.isJoinable) {
        // Only check capacity if user is NOT already in the room
        socket.emit('joinError', { error: 'Room is full' });
        return;
      }
      
    } else {
      // Auto-assign room (backwards compatibility)
      targetRoom = assignRoom();
    }
    
    for (const room of rooms) {
      if (room !== targetRoom && room.hasMember(socket.id)) {
        room.removeMember(socket.id);
      }
    }
    
    try {
      if (targetRoom.canRejoinAsPlayer(socket.id)) {
        // User is spectating, promote them to player
        myCar = targetRoom.promoteToPlayer(socket, carType, playerName, playerLevel);
      } else {
        targetRoom.addMember(socket, Room.USER_STATES.SPECTATING);
        myCar = targetRoom.promoteToPlayer(socket, carType, playerName, playerLevel);
      }
      
      currentRoom = targetRoom;
      socket.emit('joined', {
        roomId: currentRoom.id,
        carId: myCar.id,
        roomName: currentRoom.name,
        currentMap: currentRoom.currentMapKey,
        gamemode: currentRoom.gamemode,
        binarySupport: true // Signal that server supports binary encoding
      });
    } catch (error) {
      console.error(`Error joining game for socket ${socket.id}:`, error);
      socket.emit('joinError', { error: error.message });
    }
    
    } // End processJoinRequest function
  });
  
  // Binary input decoder function
  function decodeBinaryInput(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    
    // Decode cursor position (8 bytes)
    const cursorX = view.getFloat32(offset, true); offset += 4;
    const cursorY = view.getFloat32(offset, true); offset += 4;
    
    // Decode boost state (1 byte)
    const boostActive = view.getUint8(offset) === 1; offset += 1;
    
    // Decode timestamp (8 bytes)
    const timestamp = Number(view.getBigUint64(offset, true)); offset += 8;
    
    // Decode sequence number (4 bytes)
    const sequence = view.getUint32(offset, true); offset += 4;
    
    return {
      cursor: { x: cursorX, y: cursorY },
      boostActive: boostActive,
      timestamp: timestamp,
      sequence: sequence
    };
  }
  
  function encodeBinaryState(players, timestamp, room) {
    let bufferSize = 8 + 1;

    for (const player of players) {
      bufferSize += 4 + 4 + 1;
      bufferSize += 4 + 4 + 4;
      bufferSize += 2 + 2;
      bufferSize += 1 + 1;
      bufferSize += 2 + 2;
      bufferSize += 1 + 1;
      if (player.crashed || player.crashedAt) {
        bufferSize += 8;
      }
      bufferSize += 2 + 2;
    }

    let cached = binaryBufferCache.get(room.id);
    if (!cached || cached.byteLength < bufferSize) {
      cached = new ArrayBuffer(bufferSize);
      binaryBufferCache.set(room.id, cached);
    }
    const buffer = cached;
    const view = new DataView(buffer);
    let offset = 0;
    
    view.setBigUint64(offset, BigInt(timestamp), true); offset += 8;
    
    view.setUint8(offset, players.length); offset += 1;
    
    //const typeMap = { 'Stream': 0, 'Tank': 1, 'Bullet': 2, 'Prankster': 3 };
    
    for (const player of players) {
      view.setUint32(offset, room.getPlayerNumericId(player.socketId), true); offset += 4;
      view.setUint32(offset, player.id, true); offset += 4;
      view.setUint8(offset, typeMap[player.type] || 0); offset += 1;
      
      // Position and rotation (12 bytes)
      view.setFloat32(offset, player.x, true); offset += 4;
      view.setFloat32(offset, player.y, true); offset += 4;
      view.setFloat32(offset, player.angle, true); offset += 4;
      
      // Health data (4 bytes) - ensure we use 'health' property
      view.setUint16(offset, Math.round(player.health || 0), true); offset += 2;
      view.setUint16(offset, Math.round(player.maxHealth || 0), true); offset += 2;
      
      // Lap data (2 bytes)
      view.setUint8(offset, player.laps || 0); offset += 1;
      view.setUint8(offset, player.maxLaps || 0); offset += 1;
      
      // Boost data (4 bytes) - ensure we use 'currentBoost' property
      view.setUint16(offset, Math.round(player.currentBoost || 0), true); offset += 2;
      view.setUint16(offset, Math.round(player.maxBoost || 0), true); offset += 2;
      
      view.setUint8(offset, player.upgradePoints || 0); offset += 1;
      
      // Flags byte: bit 0 = crashed
      let flags = 0;
      const crashed = player.crashed || player.crashedAt;
      if (crashed) flags |= 1;
      view.setUint8(offset, flags); offset += 1;
      
      // Crash timestamp (8 bytes) - only if crashed
      if (crashed) {
        view.setBigUint64(offset, BigInt(player.crashedAt || Date.now()), true); offset += 8;
      }
      
      view.setUint16(offset, player.kills || 0, true); offset += 2;
      view.setUint16(offset, player.deaths || 0, true); offset += 2;
    }

    return buffer.slice(0, bufferSize);
  }
  
  socket.on('binaryInput', (buffer) => {
    if (!myCar) return;

    if (currentRoom) {
      currentRoom.updateMemberActivity(socket.id);
    }

    // Ignore input from crashed cars
    if (myCar.crashedAt) return;

    try {
      let arrayBuffer;
      if (buffer instanceof ArrayBuffer) {
        arrayBuffer = buffer;
      } else if (buffer && buffer.buffer instanceof ArrayBuffer) {
        arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      } else {
        console.error('Invalid binary input data type:', typeof buffer, buffer);
        return;
      }

      // Decode binary input data
      const data = decodeBinaryInput(arrayBuffer);

      if (data.cursor) {
        // Validate and clamp cursor values to prevent speed exploits
        const CURSOR_MAX = 100;
        if (typeof data.cursor.x === 'number' && typeof data.cursor.y === 'number') {
          myCar.cursor.x = Math.max(-CURSOR_MAX, Math.min(CURSOR_MAX, data.cursor.x));
          myCar.cursor.y = Math.max(-CURSOR_MAX, Math.min(CURSOR_MAX, data.cursor.y));
          myCar.lastInputTime = data.timestamp || Date.now();
          myCar.inputSequence = data.sequence || 0;
        }
      }

      if (typeof data.boostActive === 'boolean') {
        myCar.boostActive = data.boostActive && myCar.currentBoost > 0;
      }
    } catch (error) {
      console.error('Error decoding binary input:', error);
    }
  });
  
  socket.on('input', (data) => {
    if (!myCar) return;

    if (currentRoom) {
      currentRoom.updateMemberActivity(socket.id);
    }

    // Ignore input from crashed cars
    if (myCar.crashedAt) return;

    if (data.cursor) {
      // Validate and clamp cursor values to prevent speed exploits
      const CURSOR_MAX = 100;
      if (typeof data.cursor.x === 'number' && typeof data.cursor.y === 'number') {
        myCar.cursor.x = Math.max(-CURSOR_MAX, Math.min(CURSOR_MAX, data.cursor.x));
        myCar.cursor.y = Math.max(-CURSOR_MAX, Math.min(CURSOR_MAX, data.cursor.y));
        myCar.lastInputTime = data.timestamp || Date.now();
        myCar.inputSequence = data.sequence || 0;
      }
    }

    if (typeof data.boostActive === 'boolean') {
      myCar.boostActive = data.boostActive && myCar.currentBoost > 0;
    }
  });

  socket.on('killCar', () => {
    if (!myCar) return;
    myCar.currentHealth = 0;
    myCar.justCrashed = true;
  });

  socket.on('upgrade', (data) => {
    if (!myCar || !data || typeof data.stat !== 'string') return;

    // Prevent concurrent upgrade processing (race condition protection)
    if (myCar._upgradeInProgress) {
      return;
    }

    const stat = data.stat;
    const validStats = ['maxHealth', 'acceleration', 'regen', 'size', 'abilityCooldown', 'projectileSpeed', 'projectileDensity', 'abilityRegenRate', 'maxBoost', 'trapDamage'];
    if (!validStats.includes(stat)) return;

    // Atomic check-and-decrement to prevent race condition
    if (myCar.upgradePoints <= 0) {
      return;
    }

    // Set lock flag
    myCar._upgradeInProgress = true;

    try {
      const carType = CAR_TYPES[myCar.type];
      const upgradeConfig = carType.upgrades[stat];

      if (!upgradeConfig) {
        return;
      }

      const currentUsage = myCar.upgradeUsage[stat] || 0;
      if (currentUsage >= upgradeConfig.maxUpgrades) {
        return;
      }

      // Decrement points BEFORE applying upgrade
      myCar.upgradePoints -= 1;

      const amount = upgradeConfig.amount;

      switch (stat) {
        case 'maxHealth':
          myCar.stats.maxHealth += amount;
          myCar.currentHealth += amount;
          break;
        case 'acceleration':
          myCar.stats.acceleration += amount;
          break;
        case 'regen':
          myCar.stats.regen += amount;
          break;
        case 'size': {
          const scaleFactor = 1 + amount;
          myCar.stats.acceleration += (amount / 10);
          Matter.Body.scale(myCar.body, scaleFactor, scaleFactor);
          Matter.Body.setDensity(myCar.body, myCar.body.density + amount);
          break;
        }
        case 'abilityCooldown':
          if (!myCar.abilityCooldownReduction) myCar.abilityCooldownReduction = 0;
          myCar.abilityCooldownReduction += Math.abs(amount);
          break;
        case 'projectileSpeed':
          if (!myCar.projectileSpeed) myCar.projectileSpeed = 0;
          myCar.projectileSpeed += amount;
          break;
        case 'projectileDensity':
          if (!myCar.projectileDensity) myCar.projectileDensity = 0;
          myCar.projectileDensity += amount;
          break;
        case 'abilityRegenRate':
          if (myCar.chargeState) {
            myCar.chargeState.regenRate += amount;
          }
          break;
        case 'trapDamage':
          myCar.trapDamage += amount;
          break;
        case 'portalDuration':
          if (!myCar.portalDuration) myCar.portalDuration = 0;
          myCar.portalDuration += amount;
          break;
        case 'explosionRadius':
          if (!myCar.explosionRadius) myCar.explosionRadius = 0;
          myCar.explosionRadius += amount;
          break;
        case 'maxBoost':
          myCar.maxBoost += amount;
          myCar.currentBoost += amount;
          break;
      }

      myCar.upgradeUsage[stat] = currentUsage + 1;
    } finally {
      // Always release lock
      myCar._upgradeInProgress = false;
    }
  });
  
  socket.on('useAbility', () => {
    if (!myCar || !currentRoom) return;
    const result = myCar.useAbility(currentRoom.gameState);
    socket.emit('abilityResult', result);
  });

  // Charge-based ability handlers (generic for all charge abilities)
  socket.on('abilityStart', () => {
    if (!myCar || !currentRoom || !myCar.ability) return;

    // Only handle if ability uses charge system
    if (myCar.ability.usesChargeSystem && myCar.chargeState) {
      myCar.chargeState.isCharging = true;
      myCar.chargeState.chargeStartTime = Date.now();

      // For hold-to-consume abilities (Anchor, Focus), activate immediately
      if (myCar.ability.id === 'anchor' || myCar.ability.id === 'focus') {
        const result = myCar.useAbility(currentRoom.gameState);
        socket.emit('abilityResult', result);
      }
    }
  });

  socket.on('abilityRelease', () => {
    if (!myCar || !currentRoom || !myCar.ability) return;

    // Only activate if ability uses charge system and is currently charging
    if (myCar.ability.usesChargeSystem && myCar.chargeState && myCar.chargeState.isCharging) {
      const result = myCar.useAbility(currentRoom.gameState);
      socket.emit('abilityResult', result);
      myCar.chargeState.isCharging = false;
    }
  });

  // Ping handler for latency measurement
  socket.on('ping', (timestamp, callback) => {
    if (callback) callback(Date.now());
  });
  
  // Activity ping handler for AFK tracking
  socket.on('activityPing', () => {
    for (const room of rooms) {
      if (room.hasMember(socket.id)) {
        room.updateMemberActivity(socket.id);
        break;
      }
    }
  });

  if (DEBUG_MODE) {
    socket.on('debug:giveUpgradePoints', (data) => {
      if (!myCar) return;
      const points = Math.max(0, Math.min(50, data.points || 1)); // Clamp between 0-50
      myCar.upgradePoints += points;
    });

    socket.on('debug:setLaps', (data) => {
      if (!myCar) return;
      const laps = Math.max(0, Math.min(100, data.laps || 0)); // Clamp between 0-100
      myCar.laps = laps;
    });

    socket.on('debug:setHealth', (data) => {
      if (!myCar) return;
      const health = Math.max(0, Math.min(myCar.stats.maxHealth, data.health || myCar.stats.maxHealth));
      myCar.currentHealth = health;
    });

    socket.on('debug:resetPosition', () => {
      if (!myCar) return;
      myCar.resetCar();
    });

    socket.on('debug:toggleGodMode', () => {
      if (!myCar) return;
      myCar.godMode = !myCar.godMode;
      socket.emit('debug:godModeStatus', { godMode: myCar.godMode });
    });

    socket.on('debug:resetAbilityCooldown', () => {
      if (!myCar || !myCar.ability) return;
      myCar.ability.lastUsed = 0;
    });

    socket.on('debug:setStats', (data) => {
      if (!myCar) return;
      if (typeof data.maxHealth === 'number') {
        myCar.stats.maxHealth = Math.max(1, Math.min(200, data.maxHealth));
      }
      if (typeof data.acceleration === 'number') {
        myCar.stats.acceleration = Math.max(0.001, Math.min(1, data.acceleration));
      }
      if (typeof data.regen === 'number') {
        myCar.stats.regen = Math.max(0, Math.min(5, data.regen));
      }
    });

    socket.on('debug:getPlayerData', () => {
      if (!currentRoom) return;
      const playersData = [];
      for (const [socketId, car] of currentRoom.players.entries()) {
        playersData.push({
          socketId,
          id: car.id,
          name: car.name,
          type: car.type,
          laps: car.laps,
          maxLaps: car.maxLaps,
          health: car.currentHealth,
          maxHealth: car.stats.maxHealth,
          upgradePoints: car.upgradePoints,
          upgradeUsage: car.upgradeUsage,
          godMode: car.godMode || false
        });
      }
      socket.emit('debug:playerData', { players: playersData });
    });

    socket.on('debug:resetUpgrades', () => {
      if (!myCar) return;
      myCar.upgradeUsage = {};
      // Reset stats to base values
      const baseCar = CAR_TYPES[myCar.type];
      myCar.stats = {
        maxHealth: baseCar.maxHealth,
        acceleration: baseCar.acceleration,
        regen: baseCar.regen
      };
      myCar.currentHealth = myCar.stats.maxHealth;
      myCar.abilityCooldownReduction = 0;
      myCar.projectileSpeed = 0;
      myCar.projectileDensity = 0;
      // Reset charge state if ability uses charge system
      if (myCar.ability && myCar.ability.usesChargeSystem) {
        myCar.ability.initializeChargeState(myCar);
      } else {
        myCar.chargeState = null;
      }
      // Reset body density if it was modified
      Matter.Body.setDensity(myCar.body, baseCar.bodyOptions.density || 0.3);
    });

    socket.on('debug:forceAbility', () => {
      if (!myCar || !myCar.ability) return;
      const originalLastUsed = myCar.ability.lastUsed;
      myCar.ability.lastUsed = 0;
      const result = myCar.useAbility(currentRoom.gameState);
      if (!result.success) {
        myCar.ability.lastUsed = originalLastUsed;
      }
      socket.emit('abilityResult', result);
    });
  }
  
  socket.on('chatMessage', (data) => {
    if (!currentRoom || !myCar) return;

    currentRoom.updateMemberActivity(socket.id);

    if (!data.message || typeof data.message !== 'string') return;
    const message = data.message.trim();
    if (!message || message.length > 200) return;

    // Validate player has a name
    const playerName = myCar.name || 'Anonymous';
    if (!playerName || playerName === 'Anonymous') {
      socket.emit('chatError', { error: 'Must have a valid name to chat' });
      return;
    }

    // Properly sanitize message to prevent XSS using validator library
    const sanitizedMessage = validator.escape(message);
    const sanitizedPlayerName = validator.escape(playerName);


    // Broadcast to all room members (players and spectators)
    const roomMembers = [
      ...Array.from(currentRoom.players.keys()),
      ...Array.from(currentRoom.spectators.keys())
    ];

    for (const socketId of roomMembers) {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        targetSocket.emit('chatMessageReceived', {
          playerName: sanitizedPlayerName,
          message: sanitizedMessage,
          timestamp: Date.now()
        });
      }
    }
  });

  socket.on('disconnect', () => {
    if (socket.request.session && socket.request.session.username) {
      const session = socket.request.session;
      const lockKey = session.isGuest ? `guest:${socket.request.sessionID}` : `user:${session.userId}`;
      sessionRegistrationLocks.delete(lockKey);
    }

    cleanupSocketSession(socket);
    removeFromAllRooms(socket.id);

    spectators.delete(socket.id);
    clientLastStates.delete(socket.id);

    currentRoom = null;
    myCar = null;

    ensureDefaultRoom();

    cleanupEmptyRooms();
  });
});

const PHYSICS_HZ = 60;
const BROADCAST_HZ = 60;
const timeStep = 1 / PHYSICS_HZ;
let physicsAccumulator = 0;
let lastTime = Date.now();

function gameLoop() {
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  physicsAccumulator += dt;
    while (physicsAccumulator >= timeStep) {
    
    for (const room of rooms) {
      room.gameState.abilityObjects = room.gameState.abilityObjects.filter(obj => {
        if (Date.now() > obj.expiresAt) {
          Matter.World.remove(room.world, obj.body);
          return false;
        }
        return true;
      });
      let roundWinner = null;
      const now = Date.now();
      const crashedPlayers = [];

      for (const [sid, car] of room.players.entries()) {
        car.update(timeStep);
        if (room.gamemode !== 'time_trial' && !roundWinner && car.laps >= car.maxLaps) {
          roundWinner = car;
        }
        if (car.crashedAt && now - car.crashedAt > CRASH_CLEANUP_DELAY_MS) {
          crashedPlayers.push(sid);
        }
      }

      for (const sid of crashedPlayers) {
        room.demoteToSpectator(sid);
      }

      if (roundWinner && !room.winMessageSent) {
        const winnerName = roundWinner.name;

        if (room.isOfficial) {
          const winnerSocket = io.sockets.sockets.get(roundWinner.socketId);
          if (winnerSocket && winnerSocket.request.session && winnerSocket.request.session.userId && !winnerSocket.request.session.isGuest) {
            const userId = winnerSocket.request.session.userId;
            const xpAwarded = userDb.addXP(userId, 10);
            if (xpAwarded) {
              winnerSocket.emit('xpGained', { amount: 10, reason: 'Race Win' });
            }
            userDb.addWin(userId);
          }
        }

        for (const [sid] of room.players.entries()) {
          emitToSocket(sid, 'killFeedMessage', {
            text: `${winnerName} has won!`,
            type: 'win'
          });
        }

        room.winMessageSent = true;

        setTimeout(() => {
          const mapKeys = mapManager.getAllMapKeys();
          room.currentMapIndex = (room.currentMapIndex + 1) % mapKeys.length;
          room.currentMapKey = mapKeys[room.currentMapIndex] || 'square';
          room.setTrackBodies(room.currentMapKey);
          room.resetRound();
          for (const [sid, car] of room.players.entries()) {
            emitToSocket(sid, 'returnToMenu', { winner: winnerName });
            if (car && car.body) {
              Matter.World.remove(room.world, car.body);
              car.body = null;
            }
          }
          room.players.clear();
          room.carIdMap.clear();
          room.carBodyMap.clear();
        }, 1500);
        continue;
      }

      for (const [sid, car] of [...room.players.entries()]) {
        if (car.justCrashed) {
          const sock = io.sockets.sockets.get(sid);
          if (sock) {
            if (!car.crashedByPlayer && !car.killFeedSent) {
              // Check for damage tags (delayed kill credit)
              const now = Date.now();
              const TAG_WINDOW_MS = 2000;
              const validTags = car.damageTagHistory.filter(
                tag => now - tag.timestamp <= TAG_WINDOW_MS
              );

              if (validTags.length > 0) {
                const mostRecentTag = validTags[validTags.length - 1];
                const attackerCar = room.carIdMap.get(mostRecentTag.attackerId);

                if (attackerCar) {
                  // Award delayed kill credit
                  attackerCar.upgradePoints += 1;
                  attackerCar.kills += 1;
                  car.deaths += 1;
                  attackerCar.saveStatsToRoom();
                  car.saveStatsToRoom();

                  // Award XP for kill in official rooms
                  if (room.isOfficial) {
                    const killerSocket = io.sockets.sockets.get(attackerCar.socketId);
                    if (killerSocket && killerSocket.request.session && killerSocket.request.session.userId && !killerSocket.request.session.isGuest) {
                      const userId = killerSocket.request.session.userId;
                      const xpAwarded = userDb.addXP(userId, KILL_XP_REWARD);
                      if (xpAwarded) {
                        killerSocket.emit('xpGained', { amount: KILL_XP_REWARD, reason: 'Kill' });
                      }
                      userDb.addKill(userId);
                    }

                    const victimSocket = io.sockets.sockets.get(sid);
                    if (victimSocket?.request?.session?.userId && !victimSocket.request.session.isGuest) {
                      userDb.addDeath(victimSocket.request.session.userId);
                    }
                  }

                  // Broadcast kill feed message
                  room.broadcastKillFeedMessage(`${attackerCar.name} crashed ${car.name}!`, 'crash');

                  // Mark as player kill to prevent "X crashed!" message
                  car.crashedByPlayer = true;
                  car.killFeedSent = true;

                  // Clear damage tags
                  car.damageTagHistory = [];
                }
              }

              // If no valid tag found, broadcast solo crash message
              if (!car.crashedByPlayer && !car.killFeedSent) {
                car.deaths += 1;
                car.saveStatsToRoom();

                if (room.isOfficial) {
                  const crashedSocket = io.sockets.sockets.get(sid);
                  if (crashedSocket?.request?.session?.userId && !crashedSocket.request.session.isGuest) {
                    userDb.addDeath(crashedSocket.request.session.userId);
                  }
                }

                // Broadcast solo crash message to kill feed (send once to each player)
                for (const [socketId] of room.players.entries()) {
                  emitToSocket(socketId, 'killFeedMessage', {
                    text: `${car.name} crashed!`,
                    type: 'crash'
                  });
                }
                // Mark that killfeed message has been sent for this crash
                car.killFeedSent = true;
              }
            }
            
            // Mark the crash timestamp for delayed cleanup
            if (!car.crashedAt) {
              car.crashedAt = Date.now();
              // Stop the car from moving
              Matter.Body.setVelocity(car.body, { x: 0, y: 0 });
              Matter.Body.setAngularVelocity(car.body, 0);
            }
            
            // Don't reset justCrashed here - we need it for client fade detection
            // The killFeedSent flag prevents message spam instead
          }
        }
      }

      applyAreaEffects(room);
      applyMotorForces(room);
      Matter.Engine.update(room.engine, timeStep * 1000);
    }
    physicsAccumulator -= timeStep;
  }
  setImmediate(gameLoop);
}
gameLoop();

setInterval(() => {
  for (const room of rooms) {
    const state = room.state;
    const allSocketIds = new Set();
    for (const car of room.players.values()) {
      allSocketIds.add(car.socketId);
    }
    for (const sid of room.spectators.keys()) {
      allSocketIds.add(sid);
    }
    for (const sid of spectators.keys()) {
      allSocketIds.add(sid);
    }

    for (const socketId of allSocketIds) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        const { category: categoryToGet, key: keyToGet } = room.currentMapParsed;
        const map = mapManager.getMap(keyToGet, categoryToGet);
        const clientAbilityObjects = room.serializeAbilityObjects();
        
        const clientDynamicObjects = room.serializeDynamicObjects();

        const fullState = {
          players: state,
          roomMembers: room.getRoomMembersData(),
          mySocketId: socketId,
          map: map,
          abilityObjects: clientAbilityObjects,
          dynamicObjects: clientDynamicObjects,
          timestamp: Date.now()
        };

        const deltaState = createDeltaState(socketId, { players: state });

        if (deltaState) {
          socket.emit('delta', {
            players: deltaState.players,
            fullUpdate: deltaState.fullUpdate,
            roomMembers: room.getRoomMembersData(),
            mySocketId: socketId,
            abilityObjects: clientAbilityObjects,
            dynamicObjects: clientDynamicObjects,
            timestamp: Date.now()
          });
        } else {
          // No changes - send heartbeat
          socket.emit('heartbeat', { timestamp: Date.now() });
        }
        
        if (Math.random() < FULL_STATE_BROADCAST_CHANCE) {
          if (socket.clientSupportsBinary) {
            const binaryState = encodeBinaryState(state, Date.now(), room);
            socket.emit('binaryState', binaryState);
          } else {
            socket.emit('state', fullState);
          }
        }
      }
    }
  }
  
  // Broadcast to spectators (reduced frequency)
  if (broadcastTick % 2 === 0) { // 15Hz for spectators
    broadcastToSpectators();
  }
  broadcastTick++;
}, 1000 / BROADCAST_HZ);

function broadcastToSpectators() {
  const hasGlobalSpectators = spectators.size > 0;
  const hasRoomSpectators = rooms.some(room => room.spectators.size > 0);
  
  if (!hasGlobalSpectators && !hasRoomSpectators) return;
  
  // Broadcast to spectators in each room + global spectators for the first room
  for (const room of rooms) {
    const clientAbilityObjects = room.serializeAbilityObjects();

    const clientDynamicObjects = room.serializeDynamicObjects();

    const { category: categoryToGet, key: keyToGet } = room.currentMapParsed;
    const roomMapData = mapManager.getMap(keyToGet, categoryToGet);
    
    const spectatorState = {
      players: room && room.players.size > 0 ? Array.from(room.players.values())
        .filter(car => !car.crashedAt) // Exclude crashed cars from spectator view
        .map(car => ({
        id: car.id,
        name: car.name,
        level: car.level,
        type: car.type,
        x: car.body.position.x,
        y: car.body.position.y,
        angle: car.body.angle,
        health: car.currentHealth,
        maxHealth: car.stats.maxHealth,
        laps: car.laps,
        maxLaps: car.maxLaps,
        color: CAR_TYPES[car.type].color
      })) : [],
      roomMembers: room ? room.getRoomMembersData() : [],
      abilityObjects: clientAbilityObjects,
      dynamicObjects: clientDynamicObjects,
      map: roomMapData, // Always send current map
      roomId: room ? room.id : null,
      roomName: room ? room.name : null,
      gamemode: room ? room.gamemode : 'standard',
      timestamp: Date.now()
    };
    
    for (const [socketId, socket] of room.spectators) {
      if (socket.connected) {
        socket.emit('spectatorState', spectatorState);
      } else {
        room.spectators.delete(socketId); // Clean up disconnected spectators
      }
    }
    
    if (room === rooms[0]) {
      for (const [socketId, socket] of spectators) {
        if (socket.connected) {
          socket.emit('spectatorState', spectatorState);
        } else {
          spectators.delete(socketId); // Clean up disconnected spectators
        }
      }
    }
  }
}

let broadcastTick = 0;

setInterval(() => {
  for (const room of rooms) {
    room.checkAFKMembers();
  }
  
  cleanupEmptyRooms();
  ensureDefaultRoom();
}, AFK_CHECK_INTERVAL_MS);

// Run initial room maintenance
ensureDefaultRoom();

server.listen(PORT, () => {
});
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

class UserDatabase {
  constructor() {
    this.db = new Database(path.join(__dirname, 'users.db'));
    this.init();
  }

  init() {
    const createUsersTable = this.db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        xp INTEGER DEFAULT 0,
        isDev BOOLEAN DEFAULT 0
      )
    `);
    
    const createMapsTable = this.db.prepare(`
      CREATE TABLE IF NOT EXISTS maps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        author_id INTEGER,
        filename TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('official', 'community')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        download_count INTEGER DEFAULT 0,
        is_public BOOLEAN DEFAULT 1,
        FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    
    createUsersTable.run();
    createMapsTable.run();

    const columns = this.db.prepare(`PRAGMA table_info(users)`).all();

    if (!columns.some(col => col.name === 'total_kills')) {
      this.db.exec('ALTER TABLE users ADD COLUMN total_kills INTEGER DEFAULT 0');
      console.log('Added total_kills column to users table');
    }

    if (!columns.some(col => col.name === 'total_deaths')) {
      this.db.exec('ALTER TABLE users ADD COLUMN total_deaths INTEGER DEFAULT 0');
      console.log('Added total_deaths column to users table');
    }

    if (!columns.some(col => col.name === 'total_wins')) {
      this.db.exec('ALTER TABLE users ADD COLUMN total_wins INTEGER DEFAULT 0');
      console.log('Added total_wins column to users table');
    }

    console.log('Database initialized');
  }

  // migrateUsersTable() {
  //   try {
  //     const checkXpColumn = this.db.prepare(`
  //       PRAGMA table_info(users)
  //     `);
  //     const columns = checkXpColumn.all();
  //     const hasXpColumn = columns.some(col => col.name === 'xp');
  //     const hasIsDevColumn = columns.some(col => col.name === 'isDev');

  //     if (!hasXpColumn) {
  //       console.log('Adding xp column to users table...');
  //       this.db.exec('ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0');
  //     }

  //     if (!hasIsDevColumn) {
  //       console.log('Adding isDev column to users table...');
  //       this.db.exec('ALTER TABLE users ADD COLUMN isDev BOOLEAN DEFAULT 0');
  //     }

  //     const setDevUser = this.db.prepare(`
  //       UPDATE users SET isDev = 1 WHERE id = 1
  //     `);
  //     const result = setDevUser.run();
  //     if (result.changes > 0) {
  //       console.log('Set user ID 1 as developer');
  //     }
  //   } catch (error) {
  //     console.error('Migration error:', error);
  //   }
  // }

  async hashPassword(password) {
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  async registerUser(username, email, password) {
    try {
      const passwordHash = await this.hashPassword(password);
      
      const insertUser = this.db.prepare(`
        INSERT INTO users (username, email, password_hash)
        VALUES (?, ?, ?)
      `);
      
      const result = insertUser.run(username.trim(), email.toLowerCase().trim(), passwordHash);
      return { success: true, userId: result.lastInsertRowid };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        if (error.message.includes('username')) {
          return { success: false, error: 'Username already exists' };
        } else if (error.message.includes('email')) {
          return { success: false, error: 'Email already exists' };
        }
      }
      console.error('Registration error:', error);
      return { success: false, error: 'Registration failed' };
    }
  }

  async loginUser(email, password) {
    try {
      const getUser = this.db.prepare(`
        SELECT id, username, email, password_hash, xp, isDev
        FROM users 
        WHERE email = ? COLLATE NOCASE
      `);
      
      const user = getUser.get(email.toLowerCase().trim());
      
      if (!user) {
        return { success: false, error: 'Invalid email or password' };
      }

      const isValidPassword = await this.verifyPassword(password, user.password_hash);
      
      if (!isValidPassword) {
        return { success: false, error: 'Invalid email or password' };
      }

      const updateLastLogin = this.db.prepare(`
        UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
      `);
      updateLastLogin.run(user.id);

      return { 
        success: true, 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          xp: user.xp || 0,
          isDev: !!user.isDev
        }
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  }

  getUserById(userId) {
    try {
      const getUser = this.db.prepare(`
        SELECT id, username, email, created_at, last_login, xp, isDev
        FROM users 
        WHERE id = ?
      `);
      
      return getUser.get(userId);
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  addXP(userId, amount) {
    try {
      const addXpToUser = this.db.prepare(`
        UPDATE users SET xp = xp + ? WHERE id = ?
      `);

      const result = addXpToUser.run(amount, userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Add XP error:', error);
      return false;
    }
  }

  addKill(userId) {
    try {
      const stmt = this.db.prepare('UPDATE users SET total_kills = total_kills + 1 WHERE id = ?');
      const result = stmt.run(userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Add kill error:', error);
      return false;
    }
  }

  addDeath(userId) {
    try {
      const stmt = this.db.prepare('UPDATE users SET total_deaths = total_deaths + 1 WHERE id = ?');
      const result = stmt.run(userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Add death error:', error);
      return false;
    }
  }

  addWin(userId) {
    try {
      const stmt = this.db.prepare('UPDATE users SET total_wins = total_wins + 1 WHERE id = ?');
      const result = stmt.run(userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Add win error:', error);
      return false;
    }
  }

  getLeaderboard(limit = 100) {
    try {
      const stmt = this.db.prepare(`
        SELECT
          id,
          username,
          xp,
          total_kills,
          total_deaths,
          total_wins
        FROM users
        ORDER BY xp DESC
        LIMIT ?
      `);
      return stmt.all(limit);
    } catch (error) {
      console.error('Get leaderboard error:', error);
      return [];
    }
  }

  getUserRank(userId) {
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) + 1 as rank
        FROM users
        WHERE xp > (SELECT xp FROM users WHERE id = ?)
      `);
      const result = stmt.get(userId);
      return result ? result.rank : null;
    } catch (error) {
      console.error('Get user rank error:', error);
      return null;
    }
  }

  usernameExists(username) {
    try {
      const checkUsername = this.db.prepare(`
        SELECT id FROM users WHERE username = ? COLLATE NOCASE
      `);
      
      return !!checkUsername.get(username.trim());
    } catch (error) {
      console.error('Username check error:', error);
      return false;
    }
  }

  emailExists(email) {
    try {
      const checkEmail = this.db.prepare(`
        SELECT id FROM users WHERE email = ? COLLATE NOCASE
      `);
      
      return !!checkEmail.get(email.toLowerCase().trim());
    } catch (error) {
      console.error('Email check error:', error);
      return false;
    }
  }

  
  addMap(name, authorId, filename, category) {
    try {
      const insertMap = this.db.prepare(`
        INSERT INTO maps (name, author_id, filename, category)
        VALUES (?, ?, ?, ?)
      `);
      
      const result = insertMap.run(name, authorId, filename, category);
      return { success: true, mapId: result.lastInsertRowid };
    } catch (error) {
      console.error('Add map error:', error);
      return { success: false, error: 'Failed to add map to database' };
    }
  }

  updateMap(mapId, name, authorId) {
    try {
      const updateMap = this.db.prepare(`
        UPDATE maps SET name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND author_id = ?
      `);
      
      const result = updateMap.run(name, mapId, authorId);
      return result.changes > 0;
    } catch (error) {
      console.error('Update map error:', error);
      return false;
    }
  }

  deleteMap(mapId, authorId) {
    try {
      const deleteMap = this.db.prepare(`
        DELETE FROM maps WHERE id = ? AND author_id = ?
      `);
      
      const result = deleteMap.run(mapId, authorId);
      return result.changes > 0;
    } catch (error) {
      console.error('Delete map error:', error);
      return false;
    }
  }

  getMapByFilename(filename) {
    try {
      const getMap = this.db.prepare(`
        SELECT m.*, u.username as author_name
        FROM maps m
        LEFT JOIN users u ON m.author_id = u.id
        WHERE m.filename = ?
      `);
      
      return getMap.get(filename);
    } catch (error) {
      console.error('Get map error:', error);
      return null;
    }
  }

  getMapsByUser(userId) {
    try {
      const getMaps = this.db.prepare(`
        SELECT * FROM maps WHERE author_id = ?
        ORDER BY updated_at DESC
      `);
      
      return getMaps.all(userId);
    } catch (error) {
      console.error('Get user maps error:', error);
      return [];
    }
  }

  getAllPublicMaps() {
    try {
      const getMaps = this.db.prepare(`
        SELECT m.*, u.username as author_name
        FROM maps m
        LEFT JOIN users u ON m.author_id = u.id
        WHERE m.is_public = 1
        ORDER BY m.download_count DESC, m.updated_at DESC
      `);
      
      return getMaps.all();
    } catch (error) {
      console.error('Get public maps error:', error);
      return [];
    }
  }

  incrementDownloadCount(mapId) {
    try {
      const updateDownloads = this.db.prepare(`
        UPDATE maps SET download_count = download_count + 1
        WHERE id = ?
      `);
      
      updateDownloads.run(mapId);
      return true;
    } catch (error) {
      console.error('Increment download count error:', error);
      return false;
    }
  }

  close() {
    this.db.close();
  }
}

module.exports = UserDatabase;
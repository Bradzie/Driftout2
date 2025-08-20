const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

class UserDatabase {
  constructor() {
    // Create database in the project root directory
    this.db = new Database(path.join(__dirname, 'users.db'));
    this.init();
  }

  init() {
    // Create users table if it doesn't exist
    const createUsersTable = this.db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `);
    
    // Create maps table for map metadata
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
    console.log('Database initialized');
  }

  async hashPassword(password) {
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  // Register a new user
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

  // Login user
  async loginUser(email, password) {
    try {
      const getUser = this.db.prepare(`
        SELECT id, username, email, password_hash
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

      // Update last login
      const updateLastLogin = this.db.prepare(`
        UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
      `);
      updateLastLogin.run(user.id);

      return { 
        success: true, 
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  }

  // Get user by ID
  getUserById(userId) {
    try {
      const getUser = this.db.prepare(`
        SELECT id, username, email, created_at, last_login
        FROM users 
        WHERE id = ?
      `);
      
      return getUser.get(userId);
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  // Check if username exists
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

  // Check if email exists
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

  // Map database operations
  
  // Add a map to the database
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

  // Update map metadata
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

  // Delete map from database
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

  // Get map by filename
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

  // Get maps by user
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

  // Get all public maps
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

  // Increment download count
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

  // Close database connection
  close() {
    this.db.close();
  }
}

module.exports = UserDatabase;
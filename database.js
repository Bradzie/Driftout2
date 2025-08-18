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
    
    createUsersTable.run();
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

  // Close database connection
  close() {
    this.db.close();
  }
}

module.exports = UserDatabase;
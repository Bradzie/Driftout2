const fs = require('fs');
const path = require('path');

class MapManager {
  constructor(mapsDir = './maps') {
    this.mapsDir = mapsDir;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Ensure maps directories exist
    this.ensureDirectories();
  }

  ensureDirectories() {
    const officialDir = path.join(this.mapsDir, 'official');
    const communityDir = path.join(this.mapsDir, 'community');
    
    if (!fs.existsSync(this.mapsDir)) {
      fs.mkdirSync(this.mapsDir, { recursive: true });
    }
    if (!fs.existsSync(officialDir)) {
      fs.mkdirSync(officialDir, { recursive: true });
    }
    if (!fs.existsSync(communityDir)) {
      fs.mkdirSync(communityDir, { recursive: true });
    }
  }

  /**
   * Get all available maps
   * @returns {Array} Array of map metadata
   */
  getAllMaps() {
    const maps = [];
    
    // Get official maps
    const officialDir = path.join(this.mapsDir, 'official');
    if (fs.existsSync(officialDir)) {
      const officialFiles = fs.readdirSync(officialDir).filter(f => f.endsWith('.json'));
      for (const file of officialFiles) {
        const key = path.basename(file, '.json');
        const metadata = this.getMapMetadata(key, 'official');
        if (metadata) {
          maps.push({ key, ...metadata, category: 'official' });
        }
      }
    }
    
    // Get community maps
    const communityDir = path.join(this.mapsDir, 'community');
    if (fs.existsSync(communityDir)) {
      const communityFiles = fs.readdirSync(communityDir).filter(f => f.endsWith('.json'));
      for (const file of communityFiles) {
        const key = path.basename(file, '.json');
        const metadata = this.getMapMetadata(key, 'community');
        if (metadata) {
          maps.push({ key, ...metadata, category: 'community' });
        }
      }
    }
    
    return maps;
  }

  /**
   * Get map metadata without loading full map data
   * @param {string} key Map key/filename
   * @param {string} category Map category (official/community)
   * @returns {Object|null} Map metadata
   */
  getMapMetadata(key, category) {
    try {
      const mapData = this.getMap(key, category);
      if (mapData) {
        return {
          name: mapData.displayName || key,
          description: mapData.description || '',
          author: mapData.author || (category === 'official' ? 'Official' : 'Community'),
          created_at: mapData.created_at || null,
          id: mapData.id
        };
      }
    } catch (error) {
      console.error(`Error getting metadata for map ${key}:`, error.message);
    }
    return null;
  }

  /**
   * Load a map by key and category
   * @param {string} key Map key/filename
   * @param {string} category Map category (official/community)
   * @returns {Object|null} Map data
   */
  getMap(key, category = null) {
    // Try to find map in specified category first, then search all if not found
    const categories = category ? [category] : ['official', 'community'];
    
    for (const cat of categories) {
      const cacheKey = `${cat}:${key}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.data;
        }
        this.cache.delete(cacheKey);
      }
      
      // Load from filesystem
      const mapPath = path.join(this.mapsDir, cat, `${key}.json`);
      if (fs.existsSync(mapPath)) {
        try {
          const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
          
          // Cache the loaded map
          this.cache.set(cacheKey, {
            data: mapData,
            timestamp: Date.now()
          });
          
          return mapData;
        } catch (error) {
          console.error(`Error loading map ${key} from ${cat}:`, error.message);
        }
      }
    }
    
    return null;
  }

  /**
   * Save a map to the filesystem
   * @param {string} key Map key/filename
   * @param {string} category Map category (official/community)
   * @param {Object} mapData Map data to save
   * @returns {boolean} Success status
   */
  saveMap(key, category, mapData) {
    try {
      const mapPath = path.join(this.mapsDir, category, `${key}.json`);
      
      // Add metadata
      const dataToSave = {
        ...mapData,
        created_at: mapData.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      fs.writeFileSync(mapPath, JSON.stringify(dataToSave, null, 2), 'utf8');
      
      // Update cache
      const cacheKey = `${category}:${key}`;
      this.cache.set(cacheKey, {
        data: dataToSave,
        timestamp: Date.now()
      });
      
      return true;
    } catch (error) {
      console.error(`Error saving map ${key} to ${category}:`, error.message);
      return false;
    }
  }

  /**
   * Delete a map from the filesystem
   * @param {string} key Map key/filename
   * @param {string} category Map category (official/community)
   * @returns {boolean} Success status
   */
  deleteMap(key, category) {
    try {
      const mapPath = path.join(this.mapsDir, category, `${key}.json`);
      
      if (fs.existsSync(mapPath)) {
        fs.unlinkSync(mapPath);
        
        // Remove from cache
        const cacheKey = `${category}:${key}`;
        this.cache.delete(cacheKey);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Error deleting map ${key} from ${category}:`, error.message);
      return false;
    }
  }

  /**
   * Check if a map exists
   * @param {string} key Map key/filename
   * @param {string} category Map category (optional)
   * @returns {boolean} Whether map exists
   */
  mapExists(key, category = null) {
    const categories = category ? [category] : ['official', 'community'];
    
    for (const cat of categories) {
      const mapPath = path.join(this.mapsDir, cat, `${key}.json`);
      if (fs.existsSync(mapPath)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Clear the map cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get all map keys
   * @returns {Array} Array of map keys
   */
  getAllMapKeys() {
    const keys = [];
    
    // Get official map keys
    const officialDir = path.join(this.mapsDir, 'official');
    if (fs.existsSync(officialDir)) {
      const officialFiles = fs.readdirSync(officialDir).filter(f => f.endsWith('.json'));
      keys.push(...officialFiles.map(f => path.basename(f, '.json')));
    }
    
    // Get community map keys
    const communityDir = path.join(this.mapsDir, 'community');
    if (fs.existsSync(communityDir)) {
      const communityFiles = fs.readdirSync(communityDir).filter(f => f.endsWith('.json'));
      keys.push(...communityFiles.map(f => path.basename(f, '.json')));
    }
    
    return keys;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

module.exports = MapManager;
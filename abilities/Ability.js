/**
 * Base Ability class - defines the interface for all abilities
 */
class Ability {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.cooldown = config.cooldown; // milliseconds
    this.duration = config.duration || 0; // for temporary effects
    this.lastUsed = 0;
  }

  /**
   * Check if the ability can be used based on cooldown
   */
  canUse(car, currentTime) {
    return (currentTime - this.lastUsed) >= this.cooldown;
  }

  /**
   * Get remaining cooldown time in milliseconds
   */
  getRemainingCooldown(currentTime) {
    const elapsed = currentTime - this.lastUsed;
    return Math.max(0, this.cooldown - elapsed);
  }

  /**
   * Get cooldown progress as percentage (0-100)
   */
  getCooldownProgress(currentTime) {
    const remaining = this.getRemainingCooldown(currentTime);
    return ((this.cooldown - remaining) / this.cooldown) * 100;
  }

  // Template methods - subclasses must/can override these

  /**
   * Activate the ability - MUST be implemented by subclasses
   * @param {Car} car - The car using the ability
   * @param {Matter.World} world - Physics world
   * @param {Object} gameState - Current game state
   * @returns {Object} Result object with success status and any relevant data
   */
  activate(car, world, gameState) {
    throw new Error(`Ability ${this.id} must implement activate() method`);
  }

  /**
   * Update ongoing ability effects - Override if ability has continuous effects
   * @param {Car} car - The car with the ability
   * @param {Matter.World} world - Physics world
   * @param {Object} gameState - Current game state
   * @param {number} dt - Delta time in seconds
   */
  update(car, world, gameState, dt) {
    // Default: no ongoing effects
  }

  /**
   * Deactivate/cleanup ability effects - Override if ability needs cleanup
   * @param {Car} car - The car with the ability
   * @param {Matter.World} world - Physics world
   * @param {Object} gameState - Current game state
   */
  deactivate(car, world, gameState) {
    // Default: no cleanup needed
  }

  /**
   * Client-side rendering for ability effects - Override for visual effects
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} car - Car data from server
   * @param {number} scale - Render scale
   * @param {number} centerX - Screen center X
   * @param {number} centerY - Screen center Y
   * @param {Object} me - Player's car data
   */
  render(ctx, car, scale, centerX, centerY, me) {
    // Default: no visual effects
  }

  /**
   * Get ability data for client synchronization
   */
  getClientData() {
    return {
      id: this.id,
      name: this.name,
      cooldown: this.cooldown,
      duration: this.duration,
      lastUsed: this.lastUsed
    };
  }
}

module.exports = Ability;
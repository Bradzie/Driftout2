/**
 * AbilityRegistry - Manages all available abilities in the game
 * Provides factory methods for creating ability instances
 */
class AbilityRegistry {
  constructor() {
    this.abilityClasses = new Map();
    this.registerDefaults();
  }

  /**
   * Register default abilities
   */
  registerDefaults() {
    // Import and register default abilities
    const DashAbility = require('./Dash');
    const SpikeTrapAbility = require('./Trap');
    const GhostModeAbility = require('./Ghost');
    const CannonAbility = require('./Cannon');
    const RepairAbility = require('./Repair');
    const AnchorAbility = require('./Anchor');
    const FocusAbility = require('./Focus');
    const PortalAbility = require('./Portal');

    this.register(DashAbility);
    this.register(SpikeTrapAbility);
    this.register(GhostModeAbility);
    this.register(CannonAbility);
    this.register(RepairAbility);
    this.register(AnchorAbility);
    this.register(FocusAbility);
    this.register(PortalAbility);
  }

  /**
   * Register an ability class
   * @param {Class} AbilityClass - The ability class constructor
   */
  register(AbilityClass) {
    const tempInstance = new AbilityClass();
    this.abilityClasses.set(tempInstance.id, AbilityClass);
  }

  /**
   * Create a new instance of an ability
   * @param {string} abilityId - The ID of the ability to create
   * @returns {Ability|null} New ability instance or null if not found
   */
  create(abilityId) {
    const AbilityClass = this.abilityClasses.get(abilityId);
    if (!AbilityClass) {
      console.warn(`Ability not found: ${abilityId}`);
      return null;
    }
    return new AbilityClass();
  }

  /**
   * Get all registered ability IDs
   * @returns {string[]} Array of ability IDs
   */
  getAllIds() {
    return Array.from(this.abilityClasses.keys());
  }

  /**
   * Check if an ability is registered
   * @param {string} abilityId - The ability ID to check
   * @returns {boolean} True if ability exists
   */
  has(abilityId) {
    return this.abilityClasses.has(abilityId);
  }

  /**
   * Get ability metadata without creating an instance
   * @param {string} abilityId - The ability ID
   * @returns {Object|null} Ability metadata or null if not found
   */
  getMetadata(abilityId) {
    const AbilityClass = this.abilityClasses.get(abilityId);
    if (!AbilityClass) return null;

    const tempInstance = new AbilityClass();
    return {
      id: tempInstance.id,
      name: tempInstance.name,
      cooldown: tempInstance.cooldown,
      duration: tempInstance.duration
    };
  }

  /**
   * Get metadata for all abilities
   * @returns {Object[]} Array of ability metadata objects
   */
  getAllMetadata() {
    return this.getAllIds().map(id => this.getMetadata(id));
  }

  /**
   * Get an ability instance (useful for accessing static methods and properties)
   * @param {string} abilityId - The ability ID
   * @returns {Ability|null} Ability instance or null if not found
   */
  getAbility(abilityId) {
    return this.create(abilityId);
  }
}

const abilityRegistry = new AbilityRegistry();

module.exports = abilityRegistry;
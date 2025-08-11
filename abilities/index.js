/**
 * Abilities module - exports all ability classes and registry
 */

const Ability = require('./Ability');
const abilityRegistry = require('./AbilityRegistry');
const DashAbility = require('./Dash');
const SpikeTrapAbility = require('./Trap');
const GhostModeAbility = require('./Ghost');

module.exports = {
  Ability,
  abilityRegistry,
  DashAbility,
  SpikeTrapAbility,
  GhostModeAbility
};
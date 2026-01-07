/**
 * Abilities module - exports all ability classes and registry
 */

const Ability = require('./Ability');
const abilityRegistry = require('./AbilityRegistry');
const DashAbility = require('./Dash');
const SpikeTrapAbility = require('./Trap');
const GhostModeAbility = require('./Ghost');
const CannonAbility = require('./Cannon');
const RepairAbility = require('./Repair');
const AnchorAbility = require('./Anchor');
const FocusAbility = require('./Focus');
const PortalAbility = require('./Portal');

module.exports = {
  Ability,
  abilityRegistry,
  DashAbility,
  SpikeTrapAbility,
  GhostModeAbility,
  CannonAbility,
  RepairAbility,
  AnchorAbility,
  FocusAbility,
  PortalAbility
};
/**
 * adam_5 - Bot Arc Character Configuration
 *
 * A combat-focused character aiming for 70+ attack/strength/defence.
 * Strategy: Kill cows/NPCs, cook meat for healing, sell drops, buy gear upgrades in Varrock.
 * Progression: Bronze -> Iron -> Steel -> Mithril -> Adamant -> Rune
 */

export const character = {
  // The username used for save files (lowercase)
  username: 'adam_5',

  // Display name
  displayName: 'adam_5',

  // Current focus arc
  currentArc: 'combat-grind',

  // Ultimate goals
  goals: {
    attack: 70,
    strength: 70,
    defence: 70,
  },

  // Gear progression milestones
  gearProgression: [
    { level: 1, tier: 'Bronze', shop: 'Varrock Sword Shop / Varrock Armour' },
    { level: 5, tier: 'Iron', shop: 'Varrock Sword Shop / Varrock Armour' },
    { level: 10, tier: 'Steel', shop: 'Varrock Sword Shop / Varrock Armour' },
    { level: 20, tier: 'Mithril', shop: 'Varrock Sword Shop / Varrock Armour' },
    { level: 30, tier: 'Adamant', shop: 'Varrock Sword Shop / Varrock Armour' },
    { level: 40, tier: 'Rune', shop: 'Champions Guild or GE' },
  ],

  // Progress tracking - Score = Total Level + GP + Equipment Value
  lastScore: {
    totalLevel: 32,       // Fresh character (level 1 in all skills = 23 skills * 1 = 23... wait checking)
    gp: 0,
    equipmentValue: 0,
    total: 32,
    timestamp: new Date().toISOString(),
  },

  // Starting inventory from LUMBRIDGE_SPAWN preset
  startingInventory: [
    'Bronze axe',
    'Tinderbox',
    'Small fishing net',
    'Shrimps',
    'Bucket',
    'Pot',
    'Bread',
    'Bronze pickaxe',
    'Bronze dagger',
    'Bronze sword',
    'Wooden shield',
    'Shortbow',
    'Bronze arrows (25)',
    'Air runes (25)',
    'Mind runes (15)',
    'Water runes (6)',
    'Earth runes (4)',
    'Body runes (2)',
  ],

  // Bank state summary (updated after runs)
  bankHighlights: [],

  // Key locations for this character's activities
  locations: {
    cowField: { x: 3253, z: 3269 },          // Lumbridge cows
    varrockWestBank: { x: 3185, z: 3436 },   // Banking
    varrockSwordShop: { x: 3205, z: 3398 },  // Buy swords
    varrockArmourShop: { x: 3195, z: 3427 }, // Buy armour (approximate)
    lumbridge: { x: 3222, z: 3218 },          // Spawn point
  },

  // Notes
  notes: 'Fresh character - combat focused progression to 70/70/70',
};

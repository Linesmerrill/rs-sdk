// Shared types for Bot SDK
// Extracted from sync.ts and webclient/src/bot/BotSDK.ts

// ============ State Types ============

/** Combat state tracking for player */
export interface PlayerCombatState {
    /** Currently engaged in combat (has a target) */
    inCombat: boolean;
    /** Index of NPC/player we're targeting (-1 if none) */
    targetIndex: number;
    /** Tick when we last took damage (-1 if never) */
    lastDamageTick: number;
}

export interface PlayerState {
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    worldX: number;
    worldZ: number;
    /** Map plane/floor: 0=ground, 1=first floor (upstairs), 2=second floor, 3=third floor. Check this when stuck - you may need stairs/ladders! */
    level: number;
    runEnergy: number;
    runWeight: number;
    /** Current animation ID (-1 = idle/none) */
    animId: number;
    /** Current spot animation ID (-1 = none). Spot anims are effects like spell impacts, combat hits, etc. */
    spotanimId: number;
    /** Combat state tracking */
    combat: PlayerCombatState;
}

export interface SkillState {
    name: string;
    level: number;
    baseLevel: number;
    experience: number;
}

export interface InventoryItemOption {
    text: string;
    opIndex: number;  // 1-5 corresponding to OPHELD1-5
}

export interface InventoryItem {
    slot: number;
    id: number;
    name: string;
    count: number;
    options: string[];
    optionsWithIndex: InventoryItemOption[];
}

export interface NpcOption {
    text: string;
    opIndex: number;  // 1-5 corresponding to OPNPC1-5
}

export interface NearbyNpc {
    index: number;
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    distance: number;
    /** Current HP - NOTE: 0 until NPC takes damage (server only sends on hit) */
    hp: number;
    /** Max HP - NOTE: 0 until NPC takes damage (server only sends on hit) */
    maxHp: number;
    /** Health as percentage 0-100 (null until NPC takes damage) */
    healthPercent: number | null;
    /** Index of who this NPC is targeting (-1 if none) */
    targetIndex: number;
    /** Is this NPC currently in combat? (has target OR was hit within last 400 ticks) */
    inCombat: boolean;
    /** Combat cycle - set to tick+400 when NPC takes damage. Compare with state.tick for timing. */
    combatCycle: number;
    /** Current animation ID (-1 = idle/none) */
    animId: number;
    /** Current spot animation ID (-1 = none) */
    spotanimId: number;
    options: string[];
    optionsWithIndex: NpcOption[];
}

export interface NearbyPlayer {
    index: number;
    name: string;
    combatLevel: number;
    x: number;
    z: number;
    distance: number;
}

export interface GroundItem {
    id: number;
    name: string;
    count: number;
    x: number;
    z: number;
    distance: number;
}

export interface LocOption {
    text: string;
    opIndex: number;  // 1-5 corresponding to OPLOC1-5
}

export interface NearbyLoc {
    id: number;
    name: string;
    x: number;
    z: number;
    distance: number;
    options: string[];
    optionsWithIndex: LocOption[];
}

export interface GameMessage {
    type: number;
    text: string;
    sender: string;
    tick: number;  // Game tick when message arrived
}

export interface DialogOption {
    index: number;
    text: string;
    componentId?: number;  // Component ID for direct clicking
    buttonType?: number;   // Button type (1=BUTTON_OK, 6=BUTTON_CONTINUE, etc.)
}

export interface DialogComponent {
    id: number;
    type: number;
    buttonType: number;
    option: string;
    text: string;
}

export interface DialogState {
    isOpen: boolean;
    options: DialogOption[];
    isWaiting: boolean;
    text?: string;  // Optional dialog text (e.g., NPC speech)
    allComponents?: DialogComponent[];  // All components for debugging
}

export interface InterfaceState {
    isOpen: boolean;
    interfaceId: number;
    options: Array<{ index: number; text: string }>;
}

export interface ShopItem {
    slot: number;
    id: number;
    name: string;
    count: number;
}

export interface ShopState {
    isOpen: boolean;
    title: string;
    shopItems: ShopItem[];
    playerItems: ShopItem[];
}

export interface CombatStyleOption {
    index: number;
    name: string;
    type: string;
    trainedSkill: string;
}

export interface CombatStyleState {
    currentStyle: number;
    weaponName: string;
    styles: CombatStyleOption[];
}

/** Combat event for tracking damage, kills, etc. */
export interface CombatEvent {
    /** Game tick when event occurred */
    tick: number;
    /** Type of combat event */
    type: 'damage_taken' | 'damage_dealt' | 'kill';
    /** Damage amount (for damage events) */
    damage: number;
    /** Source of damage/kill - 'player' for local player, 'npc' for NPC, 'other_player' for other players */
    sourceType: 'player' | 'npc' | 'other_player';
    /** Index of the source entity (-1 if unknown/self) */
    sourceIndex: number;
    /** Target of damage/kill */
    targetType: 'player' | 'npc' | 'other_player';
    /** Index of the target entity (-1 if self) */
    targetIndex: number;
}

export interface BotWorldState {
    tick: number;
    inGame: boolean;
    player: PlayerState | null;
    skills: SkillState[];
    inventory: InventoryItem[];
    equipment: InventoryItem[];
    nearbyNpcs: NearbyNpc[];
    nearbyPlayers: NearbyPlayer[];
    nearbyLocs: NearbyLoc[];
    groundItems: GroundItem[];
    gameMessages: GameMessage[];
    dialog: DialogState;
    interface: InterfaceState;
    shop: ShopState;
    modalOpen: boolean;
    modalInterface: number;
    combatStyle?: CombatStyleState;
    /** Recent combat events (damage, kills) - bounded to last ~50 ticks */
    combatEvents: CombatEvent[];
}

// ============ Action Types ============

export type BotAction =
    | { type: 'none'; reason: string }
    | { type: 'wait'; reason: string; ticks?: number }
    | { type: 'talkToNpc'; npcIndex: number; reason: string }
    | { type: 'interactNpc'; npcIndex: number; optionIndex: number; reason: string }
    | { type: 'clickDialogOption'; optionIndex: number; reason: string }
    | { type: 'clickInterfaceOption'; optionIndex: number; reason: string }
    | { type: 'clickInterfaceComponent'; componentId: number; optionIndex?: number; reason: string }
    | { type: 'acceptCharacterDesign'; reason: string }
    | { type: 'skipTutorial'; reason: string }
    | { type: 'walkTo'; x: number; z: number; running?: boolean; reason: string }
    | { type: 'useInventoryItem'; slot: number; optionIndex: number; reason: string }
    | { type: 'useEquipmentItem'; slot: number; optionIndex: number; reason: string }
    | { type: 'dropItem'; slot: number; reason: string }
    | { type: 'pickupItem'; x: number; z: number; itemId: number; reason: string }
    | { type: 'interactGroundItem'; x: number; z: number; itemId: number; optionIndex: number; reason: string }
    | { type: 'interactLoc'; x: number; z: number; locId: number; optionIndex: number; reason: string }
    | { type: 'shopBuy'; slot: number; amount: number; reason: string }
    | { type: 'shopSell'; slot: number; amount: number; reason: string }
    | { type: 'closeShop'; reason: string }
    | { type: 'closeModal'; reason: string }
    | { type: 'setCombatStyle'; style: number; reason: string }
    | { type: 'useItemOnItem'; sourceSlot: number; targetSlot: number; reason: string }
    | { type: 'useItemOnLoc'; itemSlot: number; x: number; z: number; locId: number; reason: string }
    | { type: 'say'; message: string; reason: string }
    | { type: 'spellOnNpc'; npcIndex: number; spellComponent: number; reason: string }
    | { type: 'spellOnItem'; slot: number; spellComponent: number; reason: string }
    | { type: 'setTab'; tabIndex: number; reason: string }
    | { type: 'bankDeposit'; slot: number; amount: number; reason: string }
    | { type: 'bankWithdraw'; slot: number; amount: number; reason: string };

export interface ActionResult {
    success: boolean;
    message: string;
}

// ============ Message Types ============

// Messages from Bot Client → Sync Server
export interface BotClientMessage {
    type: 'state' | 'actionResult' | 'setGoal' | 'connected' | 'screenshot_response';
    state?: BotWorldState;
    formattedState?: string;
    result?: ActionResult;
    actionId?: string;  // Echo back for correlation
    goal?: string;
    clientId?: string;
    username?: string;
    dataUrl?: string;  // For screenshot_response
}

// Messages from Sync Server → Bot Client
export interface SyncToBotMessage {
    type: 'action' | 'thinking' | 'error' | 'status';
    action?: BotAction;
    actionId?: string;  // For correlation
    thinking?: string;
    error?: string;
    status?: string;
}

// Messages from SDK → Sync Server
export interface SDKMessage {
    type: 'sdk_connect' | 'sdk_action';
    username: string;
    clientId?: string;
    actionId?: string;
    action?: BotAction;
}

// Messages from Sync Server → SDK
export interface SyncToSDKMessage {
    type: 'sdk_connected' | 'sdk_state' | 'sdk_action_result' | 'sdk_error';
    success?: boolean;
    state?: BotWorldState;
    actionId?: string;
    result?: ActionResult;
    error?: string;
}

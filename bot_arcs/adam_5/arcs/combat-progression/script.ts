/**
 * Arc: combat-progression
 * Character: Brad_1
 *
 * Goal: Stable combat training at cow field
 *
 * Current state (from lab_log, 2026-01-25):
 * - Attack 65, Strength 70, Defence 63, HP 66
 * - Total Level: ~280
 * - Still wearing Bronze sword + Wooden shield (SEVERELY UNDER-GEARED!)
 * - Inventory: Full with hides
 *
 * Strategy (SIMPLIFIED for stability - banking causes browser crashes):
 * 1. Kill cows for XP
 * 2. Drop hides/bones when inventory full (skip banking for now)
 * 3. Rotate combat styles to train lowest skill
 * 4. Keep training until timeout
 *
 * Duration: 10 minutes (conservative for browser stability)
 */

import { runArc, StallError } from '../../../arc-runner';
import type { ScriptContext } from '../../../arc-runner';
import type { NearbyNpc, InventoryItem } from '../../../../agent/types';

// ==================== LOCATIONS ====================

const LOCATIONS = {
    COW_FIELD: { x: 3253, z: 3269 },
    VARROCK_WEST_BANK: { x: 3185, z: 3436 },
    VARROCK_SWORD_SHOP: { x: 3205, z: 3398 },     // Near Zaff's
    VARROCK_ARMOUR_SHOP: { x: 3195, z: 3427 },    // Horvik's Armour
    LUMBRIDGE_GENERAL_STORE: { x: 3211, z: 3247 },
};

// Waypoints from cow field to Varrock West Bank
const WAYPOINTS_COW_TO_BANK = [
    { x: 3253, z: 3290 },
    { x: 3240, z: 3320 },
    { x: 3230, z: 3350 },
    { x: 3220, z: 3380 },
    { x: 3210, z: 3410 },
    { x: 3185, z: 3436 },
];

// Waypoints back to cow field from bank
const WAYPOINTS_BANK_TO_COW = [
    { x: 3185, z: 3436 },
    { x: 3210, z: 3410 },
    { x: 3220, z: 3380 },
    { x: 3230, z: 3350 },
    { x: 3240, z: 3320 },
    { x: 3253, z: 3290 },
    { x: 3253, z: 3269 },
];

// Waypoints from Varrock to Lumbridge
const WAYPOINTS_VARROCK_TO_LUMBRIDGE = [
    { x: 3185, z: 3436 },
    { x: 3210, z: 3410 },
    { x: 3220, z: 3380 },
    { x: 3225, z: 3350 },
    { x: 3220, z: 3320 },
    { x: 3220, z: 3290 },
    { x: 3215, z: 3260 },
    { x: 3211, z: 3247 },
];

// Waypoints from Lumbridge to Varrock sword shop
const WAYPOINTS_LUMBRIDGE_TO_VARROCK = [
    { x: 3211, z: 3247 },
    { x: 3215, z: 3270 },
    { x: 3220, z: 3300 },
    { x: 3215, z: 3330 },
    { x: 3210, z: 3360 },
    { x: 3205, z: 3398 },
];

// Gear level requirements and prices
const GEAR_TIERS = [
    { level: 1, tier: 'Bronze', swordPrice: 26, bodyPrice: 80, legPrice: 65 },
    { level: 5, tier: 'Iron', swordPrice: 91, bodyPrice: 280, legPrice: 210 },
    { level: 10, tier: 'Steel', swordPrice: 325, bodyPrice: 1000, legPrice: 750 },
    { level: 20, tier: 'Mithril', swordPrice: 845, bodyPrice: 2600, legPrice: 1950 },
    { level: 30, tier: 'Adamant', swordPrice: 2080, bodyPrice: 6400, legPrice: 4800 },
    { level: 40, tier: 'Rune', swordPrice: 20800, bodyPrice: 65000, legPrice: 50000 },
];

// Thresholds
const INVENTORY_DROP_THRESHOLD = 24; // Drop items when inventory this full
const LOW_HP_THRESHOLD = 0.4;        // Eat food when HP below 40% max

// ==================== STATS ====================

interface Stats {
    kills: number;
    hidesCollected: number;
    hidesBanked: number;
    hidesSold: number;
    gpEarned: number;
    gpSpent: number;
    gearUpgrades: string[];
    bankTrips: number;
    shopTrips: number;
    startTime: number;
    lastProgressTime: number;
    startTotalLevel: number;
    startAttack: number;
    startStrength: number;
    startDefence: number;
}

// ==================== HELPERS ====================

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

function getSkillLevel(ctx: ScriptContext, skillName: string): number {
    return ctx.sdk.getSkill(skillName)?.baseLevel ?? 1;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /^coins$/i.test(i.name));
    return coins?.count ?? 0;
}

function countItem(ctx: ScriptContext, pattern: RegExp): number {
    const items = ctx.state()?.inventory.filter(i => pattern.test(i.name)) ?? [];
    return items.reduce((sum, i) => sum + (i.count ?? 1), 0);
}

function getCurrentHP(ctx: ScriptContext): number {
    const hp = ctx.sdk.getSkill('Hitpoints');
    return hp?.level ?? hp?.baseLevel ?? 10;
}

function getMaxHP(ctx: ScriptContext): number {
    const hp = ctx.sdk.getSkill('Hitpoints');
    return hp?.baseLevel ?? 10;
}

function getLowestCombatStat(ctx: ScriptContext): { name: string; level: number } {
    const atk = getSkillLevel(ctx, 'Attack');
    const str = getSkillLevel(ctx, 'Strength');
    const def = getSkillLevel(ctx, 'Defence');

    if (def <= atk && def <= str) return { name: 'Defence', level: def };
    if (atk <= str) return { name: 'Attack', level: atk };
    return { name: 'Strength', level: str };
}

function getAvailableGearTier(ctx: ScriptContext): typeof GEAR_TIERS[0] {
    const lowestStat = getLowestCombatStat(ctx).level;
    const available = GEAR_TIERS.filter(t => t.level <= lowestStat);
    return available[available.length - 1] ?? GEAR_TIERS[0]!;
}

function hasEquippedTier(ctx: ScriptContext, tier: string): { sword: boolean; body: boolean; legs: boolean } {
    const equip = ctx.state()?.equipment ?? [];
    const tierPattern = new RegExp(tier, 'i');
    return {
        sword: equip.some(e => e && tierPattern.test(e.name) && /sword|scimitar/i.test(e.name)),
        body: equip.some(e => e && tierPattern.test(e.name) && /platebody|chainbody/i.test(e.name)),
        legs: equip.some(e => e && tierPattern.test(e.name) && /platelegs|plateskirt/i.test(e.name)),
    };
}

// ==================== WALKING ====================

async function walkWaypoints(ctx: ScriptContext, stats: Stats, waypoints: {x: number, z: number}[], label: string): Promise<boolean> {
    ctx.log(`Walking ${label} via ${waypoints.length} waypoints...`);

    for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i]!;
        await ctx.bot.walkTo(wp.x, wp.z);
        markProgress(ctx, stats);

        for (let j = 0; j < 30; j++) {
            await new Promise(r => setTimeout(r, 500));
            markProgress(ctx, stats);

            // Dismiss dialogs
            if (ctx.state()?.dialog?.isOpen) {
                await ctx.sdk.sendClickDialog(0);
            }

            const player = ctx.state()?.player;
            if (player) {
                const dist = Math.sqrt(
                    Math.pow(player.worldX - wp.x, 2) +
                    Math.pow(player.worldZ - wp.z, 2)
                );
                if (dist < 10) break;
            }
        }
    }
    return true;
}

// ==================== COMBAT ====================

function findCow(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const cows = state.nearbyNpcs
        .filter(npc => /^cow$/i.test(npc.name))
        .filter(npc => npc.optionsWithIndex.some(o => /attack/i.test(o.text)))
        .filter(npc => !npc.inCombat)
        .sort((a, b) => a.distance - b.distance);

    return cows[0] ?? null;
}

async function setCombatStyle(ctx: ScriptContext, skillName: string): Promise<void> {
    const styleState = ctx.sdk.getState()?.combatStyle;
    if (!styleState) return;

    const style = styleState.styles.find(s => s.trainedSkill === skillName);
    if (style && styleState.currentStyle !== style.index) {
        await ctx.sdk.sendSetCombatStyle(style.index);
        ctx.log(`Combat style: ${skillName}`);
    }
}

// ==================== LOOTING ====================

async function pickupLoot(ctx: ScriptContext, stats: Stats): Promise<number> {
    let pickedUp = 0;
    const state = ctx.state();
    if (!state || state.inventory.length >= 28) return 0;

    const groundItems = ctx.sdk.getGroundItems()
        .filter(i => /cow\s*hide|coins/i.test(i.name))
        .filter(i => i.distance <= 8)
        .sort((a, b) => {
            // Priority: hides > coins
            const priority = (name: string) => {
                if (/cow\s*hide/i.test(name)) return 0;
                return 1;
            };
            return priority(a.name) - priority(b.name) || a.distance - b.distance;
        });

    for (const item of groundItems.slice(0, 2)) {
        if (ctx.state()!.inventory.length >= 28) break;

        const result = await ctx.bot.pickupItem(item);
        if (result.success) {
            pickedUp++;
            if (/cow\s*hide/i.test(item.name)) {
                stats.hidesCollected++;
                ctx.log(`Hide collected (total: ${stats.hidesCollected})`);
            }
            markProgress(ctx, stats);
        }
        await new Promise(r => setTimeout(r, 300));
    }

    return pickedUp;
}

// ==================== EATING ====================

async function eatFood(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const food = ctx.state()?.inventory.find(i =>
        /cooked|bread|shrimp|trout|salmon|lobster|meat|beef/i.test(i.name)
    );

    if (food) {
        const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
        if (eatOpt) {
            await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
            ctx.log(`Ate ${food.name}, HP was ${getCurrentHP(ctx)}`);
            markProgress(ctx, stats);
            return true;
        }
    }
    return false;
}

// ==================== BANKING ====================

async function bankHides(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const hidesInInv = countItem(ctx, /cow\s*hide/i);
    if (hidesInInv === 0) return false;

    ctx.log(`=== Banking ${hidesInInv} hides ===`);
    stats.bankTrips++;

    // Walk to bank
    await walkWaypoints(ctx, stats, WAYPOINTS_COW_TO_BANK, 'to Varrock West Bank');
    await new Promise(r => setTimeout(r, 1000));

    // Dismiss any blocking UI
    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    // Open bank
    const banker = ctx.state()?.nearbyNpcs.find(n => /banker/i.test(n.name));
    if (banker) {
        const bankOpt = banker.optionsWithIndex?.find(o => /bank/i.test(o.text));
        if (bankOpt) {
            ctx.log('Opening bank...');
            await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);
        }
    } else {
        ctx.warn('No banker found!');
        const nearby = ctx.state()?.nearbyNpcs.slice(0, 5).map(n => n.name).join(', ');
        ctx.log(`Nearby NPCs: ${nearby}`);
        return false;
    }

    // Wait for bank interface
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.interface?.isOpen) {
            ctx.log('Bank opened');
            break;
        }
        markProgress(ctx, stats);
    }

    // Deposit hides
    const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
    for (const hide of hides) {
        await ctx.sdk.sendBankDeposit(hide.slot, hide.count ?? 1);
        stats.hidesBanked += hide.count ?? 1;
        await new Promise(r => setTimeout(r, 200));
    }

    ctx.log(`Banked ${hides.length} hide stacks. Total banked: ${stats.hidesBanked}`);

    // Close bank
    await ctx.bot.closeShop();
    markProgress(ctx, stats);

    // Return to cows
    await walkWaypoints(ctx, stats, WAYPOINTS_BANK_TO_COW, 'back to cows');
    await ctx.bot.openDoor(/gate/i);

    return true;
}

// ==================== SELLING ====================

async function sellHidesAndBuyGear(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    ctx.log('=== Sell & Upgrade Run ===');

    // Step 1: Go to bank and withdraw hides
    await walkWaypoints(ctx, stats, WAYPOINTS_COW_TO_BANK, 'to bank');
    await new Promise(r => setTimeout(r, 1000));
    await ctx.bot.dismissBlockingUI();

    // Open bank
    const banker = ctx.state()?.nearbyNpcs.find(n => /banker/i.test(n.name));
    if (banker) {
        const bankOpt = banker.optionsWithIndex?.find(o => /bank/i.test(o.text));
        if (bankOpt) {
            await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);
        }
    }

    // Wait for bank
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.interface?.isOpen) break;
        markProgress(ctx, stats);
    }

    // Deposit current inventory hides first
    const invHides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
    for (const hide of invHides) {
        await ctx.sdk.sendBankDeposit(hide.slot, hide.count ?? 1);
        stats.hidesBanked += hide.count ?? 1;
        await new Promise(r => setTimeout(r, 200));
    }

    // Now withdraw as many as we can carry (up to 25)
    ctx.log('Withdrawing hides from bank...');
    for (let slot = 0; slot < 5; slot++) {
        const currentInv = ctx.state()?.inventory.length ?? 0;
        if (currentInv >= 25) break;

        await ctx.sdk.sendBankWithdraw(slot, 25);
        await new Promise(r => setTimeout(r, 400));
        markProgress(ctx, stats);
    }

    await new Promise(r => setTimeout(r, 500));
    const withdrawnHides = countItem(ctx, /cow\s*hide/i);
    ctx.log(`Withdrew ${withdrawnHides} hides`);

    await ctx.bot.closeShop();
    markProgress(ctx, stats);

    if (withdrawnHides === 0) {
        ctx.log('No hides to sell, returning to cows');
        await walkWaypoints(ctx, stats, WAYPOINTS_BANK_TO_COW, 'back to cows');
        await ctx.bot.openDoor(/gate/i);
        return false;
    }

    // Step 2: Walk to Lumbridge and sell
    await walkWaypoints(ctx, stats, WAYPOINTS_VARROCK_TO_LUMBRIDGE, 'to Lumbridge');
    await new Promise(r => setTimeout(r, 1000));
    await ctx.bot.dismissBlockingUI();

    // Open general store
    const shopkeeper = ctx.state()?.nearbyNpcs.find(n => /shop.?keeper/i.test(n.name));
    if (!shopkeeper) {
        ctx.warn('No shopkeeper found');
        return false;
    }

    const tradeOpt = shopkeeper.optionsWithIndex?.find(o => /trade/i.test(o.text));
    if (tradeOpt) {
        ctx.log('Opening shop...');
        await ctx.sdk.sendInteractNpc(shopkeeper.index, tradeOpt.opIndex);
    }

    // Wait for shop
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.shop?.isOpen) {
            ctx.log('Shop opened');
            break;
        }
        markProgress(ctx, stats);
    }

    // Sell all hides
    const gpBefore = getCoins(ctx);
    let sold = 0;

    for (let attempt = 0; attempt < 50; attempt++) {
        const hideCount = countItem(ctx, /cow\s*hide/i);
        if (hideCount === 0) break;

        const result = await ctx.bot.sellToShop(/cow\s*hide/i, 1);
        if (result.success) {
            sold++;
            stats.hidesSold++;
        } else {
            ctx.warn(`Sell failed: ${result.message}`);
            break;
        }

        await new Promise(r => setTimeout(r, 200));
        markProgress(ctx, stats);
    }

    const gpAfter = getCoins(ctx);
    const earned = gpAfter - gpBefore;
    stats.gpEarned += earned;
    ctx.log(`Sold ${sold} hides for ${earned}gp (now have ${gpAfter}gp)`);

    await ctx.bot.closeShop();
    markProgress(ctx, stats);

    // Step 3: Buy gear upgrades if we have enough GP
    const tier = getAvailableGearTier(ctx);
    const currentGp = getCoins(ctx);
    const equipped = hasEquippedTier(ctx, tier.tier);

    ctx.log(`Checking gear: Can use ${tier.tier} tier. Have ${currentGp}gp`);
    ctx.log(`Current ${tier.tier} gear: sword=${equipped.sword}, body=${equipped.body}, legs=${equipped.legs}`);

    // Calculate what we can afford
    let needsSword = !equipped.sword;
    let needsBody = !equipped.body;
    let needsLegs = !equipped.legs;

    if (needsSword || needsBody || needsLegs) {
        // Walk to Varrock shops
        await walkWaypoints(ctx, stats, WAYPOINTS_LUMBRIDGE_TO_VARROCK, 'to Varrock shops');
        stats.shopTrips++;

        // Try sword shop first
        if (needsSword && currentGp >= tier.swordPrice) {
            ctx.log(`Buying ${tier.tier} sword...`);
            await ctx.bot.walkTo(LOCATIONS.VARROCK_SWORD_SHOP.x, LOCATIONS.VARROCK_SWORD_SHOP.z);
            await new Promise(r => setTimeout(r, 1000));
            markProgress(ctx, stats);

            const swordShop = await ctx.bot.openShop(/shop.?keeper|sword/i);
            if (swordShop.success) {
                const shopItems = ctx.state()?.shop?.shopItems ?? [];
                ctx.log(`Shop has ${shopItems.length} items`);

                // Log shop contents
                for (const item of shopItems.slice(0, 10)) {
                    ctx.log(`  - ${item.name}`);
                }

                // Try to find and buy a weapon
                const weaponPatterns = [
                    new RegExp(`${tier.tier}.*scimitar`, 'i'),
                    new RegExp(`${tier.tier}.*sword`, 'i'),
                    new RegExp(`${tier.tier}.*longsword`, 'i'),
                ];

                for (const pattern of weaponPatterns) {
                    const weapon = shopItems.find(i => pattern.test(i.name));
                    if (weapon) {
                        ctx.log(`Found ${weapon.name}, buying...`);
                        await ctx.sdk.sendShopBuy(weapon.slot, 1);
                        await new Promise(r => setTimeout(r, 500));

                        // Equip it
                        const newWeapon = ctx.state()?.inventory.find(i => pattern.test(i.name));
                        if (newWeapon) {
                            ctx.log(`Bought ${newWeapon.name}!`);
                            stats.gearUpgrades.push(newWeapon.name);
                            stats.gpSpent += tier.swordPrice;
                            await ctx.bot.equipItem(newWeapon);
                            needsSword = false;
                        }
                        break;
                    }
                }

                await ctx.bot.closeShop();
            }
        }

        // Try armour shop
        const gpRemaining = getCoins(ctx);
        if ((needsBody || needsLegs) && gpRemaining >= Math.min(tier.bodyPrice, tier.legPrice)) {
            ctx.log(`Checking armour shop...`);
            await ctx.bot.walkTo(LOCATIONS.VARROCK_ARMOUR_SHOP.x, LOCATIONS.VARROCK_ARMOUR_SHOP.z);
            await new Promise(r => setTimeout(r, 1000));
            markProgress(ctx, stats);

            const armourShop = await ctx.bot.openShop(/horvik|armour|shop.?keeper/i);
            if (armourShop.success) {
                const shopItems = ctx.state()?.shop?.shopItems ?? [];
                ctx.log(`Armour shop has ${shopItems.length} items`);

                for (const item of shopItems.slice(0, 10)) {
                    ctx.log(`  - ${item.name}`);
                }

                // Try to buy platebody
                if (needsBody && getCoins(ctx) >= tier.bodyPrice) {
                    const bodyPattern = new RegExp(`${tier.tier}.*(platebody|chainbody)`, 'i');
                    const body = shopItems.find(i => bodyPattern.test(i.name));
                    if (body) {
                        ctx.log(`Found ${body.name}, buying...`);
                        await ctx.sdk.sendShopBuy(body.slot, 1);
                        await new Promise(r => setTimeout(r, 500));

                        const newBody = ctx.state()?.inventory.find(i => bodyPattern.test(i.name));
                        if (newBody) {
                            ctx.log(`Bought ${newBody.name}!`);
                            stats.gearUpgrades.push(newBody.name);
                            stats.gpSpent += tier.bodyPrice;
                            await ctx.bot.equipItem(newBody);
                        }
                    }
                }

                // Try to buy platelegs
                if (needsLegs && getCoins(ctx) >= tier.legPrice) {
                    const legsPattern = new RegExp(`${tier.tier}.*(platelegs|plateskirt)`, 'i');
                    const legs = shopItems.find(i => legsPattern.test(i.name));
                    if (legs) {
                        ctx.log(`Found ${legs.name}, buying...`);
                        await ctx.sdk.sendShopBuy(legs.slot, 1);
                        await new Promise(r => setTimeout(r, 500));

                        const newLegs = ctx.state()?.inventory.find(i => legsPattern.test(i.name));
                        if (newLegs) {
                            ctx.log(`Bought ${newLegs.name}!`);
                            stats.gearUpgrades.push(newLegs.name);
                            stats.gpSpent += tier.legPrice;
                            await ctx.bot.equipItem(newLegs);
                        }
                    }
                }

                await ctx.bot.closeShop();
            }
        }
    }

    // Return to cows
    ctx.log('Returning to cow field...');
    await ctx.bot.walkTo(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z);
    await ctx.bot.openDoor(/gate/i);
    markProgress(ctx, stats);

    return true;
}

// ==================== MAIN LOOP ====================

async function combatLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    let loopCount = 0;
    let invalidStateCount = 0;

    // Set initial style to train lowest stat
    const lowestStat = getLowestCombatStat(ctx);
    await setCombatStyle(ctx, lowestStat.name);

    while (true) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) {
            ctx.warn('Lost game state');
            break;
        }

        // Log status every 50 loops
        if (loopCount % 50 === 0) {
            const atk = getSkillLevel(ctx, 'Attack');
            const str = getSkillLevel(ctx, 'Strength');
            const def = getSkillLevel(ctx, 'Defence');
            const hp = getCurrentHP(ctx);
            const maxHp = getMaxHP(ctx);
            ctx.log(`Loop ${loopCount}: Atk=${atk} Str=${str} Def=${def}, Kills=${stats.kills}, HP=${hp}/${maxHp}`);
        }

        // Rotate combat style every 100 loops (train lowest stat more)
        if (loopCount % 100 === 0) {
            const lowest = getLowestCombatStat(ctx);
            await setCombatStyle(ctx, lowest.name);
        }

        // Dismiss dialogs
        if (currentState.dialog.isOpen) {
            await ctx.bot.dismissBlockingUI();
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 200));
            continue;
        }

        // Check HP and eat if low
        const currentHP = getCurrentHP(ctx);
        const maxHP = getMaxHP(ctx);
        if (currentHP < maxHP * LOW_HP_THRESHOLD) {
            await eatFood(ctx, stats);
        }

        // Drop non-essential items if inventory full (SKIP BANKING for stability)
        if (currentState.inventory.length >= INVENTORY_DROP_THRESHOLD) {
            const droppable = currentState.inventory.filter(i => {
                const name = i.name.toLowerCase();
                // Keep weapons, shields, food, coins - DROP hides, bones, beef
                if (/sword|scimitar|dagger|shield|coins/i.test(name)) return false;
                if (/cooked|bread|shrimp|trout|salmon|lobster|meat/i.test(name)) return false;
                return true;  // Drop everything else (hides, bones, raw beef)
            });

            if (droppable.length > 0) {
                ctx.log(`Dropping ${droppable.length} items to continue training...`);
                for (const item of droppable.slice(0, 8)) {
                    await ctx.sdk.sendDropItem(item.slot);
                    if (/cow\s*hide/i.test(item.name)) {
                        stats.hidesCollected += item.count ?? 1;  // Track dropped hides
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
                markProgress(ctx, stats);
                continue;
            }
        }

        // Check player state validity
        const player = currentState.player;
        if (!player || player.worldX === 0 || player.worldZ === 0) {
            invalidStateCount++;
            if (invalidStateCount > 30) {
                ctx.error('Too many invalid player states - connection likely lost');
                break;
            }
            if (invalidStateCount % 5 === 1) {
                ctx.warn(`Invalid player state (${invalidStateCount}/30), waiting...`);
            }
            await new Promise(r => setTimeout(r, 1000));
            markProgress(ctx, stats);
            continue;
        }
        invalidStateCount = 0;

        // Check for drift from cow field
        const dist = Math.sqrt(
            Math.pow(player.worldX - LOCATIONS.COW_FIELD.x, 2) +
            Math.pow(player.worldZ - LOCATIONS.COW_FIELD.z, 2)
        );
        if (dist > 40) {
            ctx.log(`Drifted ${dist.toFixed(0)} tiles, returning to cow field...`);
            await ctx.bot.walkTo(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z);
            await ctx.bot.openDoor(/gate/i);
            markProgress(ctx, stats);
            continue;
        }

        // Check if actively attacking (animation playing)
        const animId = player.animId;
        const isIdle = animId === -1 || animId === 808;  // -1 or 808 = idle

        if (isIdle) {
            // Try to loot first (only very close items)
            await pickupLoot(ctx, stats);

            // Find and attack cow
            const cow = findCow(ctx);
            if (cow) {
                const result = await ctx.bot.attackNpc(cow);
                if (result.success) {
                    stats.kills++;
                    markProgress(ctx, stats);
                    await new Promise(r => setTimeout(r, 1500));
                } else if (result.reason === 'out_of_reach') {
                    await ctx.bot.openDoor(/gate/i);
                    markProgress(ctx, stats);
                }
            } else {
                // No cows, wander a bit within the field
                await ctx.sdk.sendWalk(
                    LOCATIONS.COW_FIELD.x + (Math.random() * 10 - 5),
                    LOCATIONS.COW_FIELD.z + (Math.random() * 10 - 5),
                    true
                );
                markProgress(ctx, stats);
            }
        }

        await new Promise(r => setTimeout(r, 600));
        markProgress(ctx, stats);
    }
}

// ==================== FINAL STATS ====================

function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const duration = (Date.now() - stats.startTime) / 1000;
    const atk = getSkillLevel(ctx, 'Attack');
    const str = getSkillLevel(ctx, 'Strength');
    const def = getSkillLevel(ctx, 'Defence');
    const hp = getSkillLevel(ctx, 'Hitpoints');
    const totalLevel = getTotalLevel(ctx);
    const coins = getCoins(ctx);

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log(`Duration: ${Math.round(duration)}s`);
    ctx.log(`Kills: ${stats.kills}`);
    ctx.log(`Hides: collected=${stats.hidesCollected}, banked=${stats.hidesBanked}, sold=${stats.hidesSold}`);
    ctx.log(`GP: earned=${stats.gpEarned}, spent=${stats.gpSpent}, current=${coins}`);
    ctx.log(`Gear upgrades: ${stats.gearUpgrades.length > 0 ? stats.gearUpgrades.join(', ') : 'none'}`);
    ctx.log(`Bank trips: ${stats.bankTrips}, Shop trips: ${stats.shopTrips}`);
    ctx.log(`Combat: Attack=${atk} (+${atk - stats.startAttack}), Strength=${str} (+${str - stats.startStrength}), Defence=${def} (+${def - stats.startDefence}), HP=${hp}`);
    ctx.log(`Total Level: ${totalLevel} (+${totalLevel - stats.startTotalLevel})`);
    ctx.log(`Score: ${totalLevel + coins}`);
    ctx.log('');
}

// ==================== MAIN ====================

runArc({
    characterName: 'adam_5',
    arcName: 'combat-progression',
    goal: 'Stable combat training at cow field (drop items, no banking)',
    timeLimit: 5 * 60 * 1000,  // 5 minutes (short for testing stability)
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,  // Use dedicated browser
        headless: false,
    },
}, async (ctx) => {
    const startAtk = getSkillLevel(ctx, 'Attack');
    const startStr = getSkillLevel(ctx, 'Strength');
    const startDef = getSkillLevel(ctx, 'Defence');
    const startTotal = getTotalLevel(ctx);

    const stats: Stats = {
        kills: 0,
        hidesCollected: 0,
        hidesBanked: 0,
        hidesSold: 0,
        gpEarned: 0,
        gpSpent: 0,
        gearUpgrades: [],
        bankTrips: 0,
        shopTrips: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
        startTotalLevel: startTotal,
        startAttack: startAtk,
        startStrength: startStr,
        startDefence: startDef,
    };

    ctx.log('=== Arc: combat-progression (Brad_1) ===');
    ctx.log(`Starting: Attack=${startAtk}, Strength=${startStr}, Defence=${startDef}`);
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);
    ctx.log(`GP: ${getCoins(ctx)}`);
    ctx.log(`Total Level: ${startTotal}`);

    // Log current equipment
    const equip = ctx.state()?.equipment.filter(e => e !== null) ?? [];
    ctx.log(`Equipment: ${equip.map(e => e?.name).join(', ') || 'none'}`);

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Equip best available weapon from inventory
    const weapon = ctx.sdk.getInventory().find(i =>
        /scimitar|sword/i.test(i.name) && !/pickaxe/i.test(i.name)
    );
    if (weapon) {
        ctx.log(`Equipping ${weapon.name}...`);
        await ctx.bot.equipItem(weapon);
        markProgress(ctx, stats);
    }

    // Walk to cow field if far away
    const player = ctx.state()?.player;
    if (player) {
        const dist = Math.sqrt(
            Math.pow(player.worldX - LOCATIONS.COW_FIELD.x, 2) +
            Math.pow(player.worldZ - LOCATIONS.COW_FIELD.z, 2)
        );
        if (dist > 30) {
            ctx.log(`Walking to cow field (${dist.toFixed(0)} tiles away)...`);
            await ctx.bot.walkTo(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z);
            markProgress(ctx, stats);
        }
        await ctx.bot.openDoor(/gate/i);
        markProgress(ctx, stats);
    }

    try {
        await combatLoop(ctx, stats);
    } catch (e) {
        if (e instanceof StallError) {
            ctx.error(`Arc aborted: ${e.message}`);
        } else {
            throw e;
        }
    } finally {
        logFinalStats(ctx, stats);
    }
});

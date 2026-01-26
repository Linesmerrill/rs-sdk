/**
 * Arc: sell-and-upgrade
 * Character: Brad_1
 *
 * Goal: Bank current hides, sell them, buy gear upgrades
 *
 * Current state:
 * - Attack 61, Strength 67, Defence 61, HP 63
 * - Inventory full with 20 cowhides
 * - Still wearing Bronze sword + Wooden shield
 * - Can use Adamant (level 30+) or Rune (level 40+)
 *
 * Duration: 10 minutes
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

// Locations
const LOCATIONS = {
    VARROCK_WEST_BANK: { x: 3185, z: 3436 },
    VARROCK_SWORD_SHOP: { x: 3205, z: 3398 },
    VARROCK_ARMOUR_SHOP: { x: 3195, z: 3427 },
    LUMBRIDGE_GENERAL_STORE: { x: 3211, z: 3247 },
    COW_FIELD: { x: 3253, z: 3269 },
};

// Waypoints
const WAYPOINTS_TO_BANK = [
    { x: 3253, z: 3290 },
    { x: 3240, z: 3320 },
    { x: 3230, z: 3350 },
    { x: 3220, z: 3380 },
    { x: 3210, z: 3410 },
    { x: 3185, z: 3436 },
];

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

const WAYPOINTS_LUMBRIDGE_TO_VARROCK = [
    { x: 3211, z: 3247 },
    { x: 3215, z: 3270 },
    { x: 3220, z: 3300 },
    { x: 3215, z: 3330 },
    { x: 3210, z: 3360 },
    { x: 3205, z: 3398 },
];

function markProgress(ctx: ScriptContext): void {
    ctx.progress();
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /^coins$/i.test(i.name));
    return coins?.count ?? 0;
}

function countItem(ctx: ScriptContext, pattern: RegExp): number {
    const items = ctx.state()?.inventory.filter(i => pattern.test(i.name)) ?? [];
    return items.reduce((sum, i) => sum + (i.count ?? 1), 0);
}

async function walkWaypoints(ctx: ScriptContext, waypoints: {x: number, z: number}[], label: string): Promise<void> {
    ctx.log(`Walking ${label} via ${waypoints.length} waypoints...`);

    for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i]!;
        await ctx.bot.walkTo(wp.x, wp.z);
        markProgress(ctx);

        for (let j = 0; j < 30; j++) {
            await new Promise(r => setTimeout(r, 500));
            markProgress(ctx);

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
}

async function openBank(ctx: ScriptContext): Promise<boolean> {
    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    const banker = ctx.state()?.nearbyNpcs.find(n => /banker/i.test(n.name));
    if (!banker) {
        ctx.warn('No banker found nearby');
        const nearby = ctx.state()?.nearbyNpcs.slice(0, 5).map(n => n.name + ' (' + n.distance + ')').join(', ');
        ctx.log('Nearby NPCs: ' + nearby);
        return false;
    }

    const bankOpt = banker.optionsWithIndex?.find(o => /bank/i.test(o.text));
    if (!bankOpt) {
        ctx.warn('Banker has no bank option');
        return false;
    }

    ctx.log('Opening bank...');
    await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.interface?.isOpen) {
            ctx.log('Bank opened');
            return true;
        }
        markProgress(ctx);
    }

    ctx.warn('Bank did not open');
    return false;
}

async function depositAllHides(ctx: ScriptContext): Promise<number> {
    const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
    let deposited = 0;

    for (const hide of hides) {
        await ctx.sdk.sendBankDeposit(hide.slot, hide.count ?? 1);
        deposited += hide.count ?? 1;
        await new Promise(r => setTimeout(r, 200));
        markProgress(ctx);
    }

    ctx.log(`Deposited ${deposited} hides`);
    return deposited;
}

async function withdrawAllHides(ctx: ScriptContext): Promise<number> {
    const state = ctx.state();
    if (!state?.interface?.isOpen) return 0;

    const invBefore = ctx.state()?.inventory.length ?? 0;
    ctx.log('Withdrawing hides from bank...');

    // Try to withdraw from first 5 slots
    for (let slot = 0; slot < 5; slot++) {
        const currentInv = ctx.state()?.inventory.length ?? 0;
        if (currentInv >= 25) break;

        await ctx.sdk.sendBankWithdraw(slot, 25);
        await new Promise(r => setTimeout(r, 400));
        markProgress(ctx);
    }

    await new Promise(r => setTimeout(r, 500));
    const invAfter = ctx.state()?.inventory.length ?? 0;
    const withdrawn = invAfter - invBefore;
    ctx.log(`Inventory slots: ${invBefore} -> ${invAfter}`);

    const hidesWithdrawn = countItem(ctx, /cow\s*hide/i);
    ctx.log(`Hides in inventory: ${hidesWithdrawn}`);

    return hidesWithdrawn;
}

async function sellHidesToShop(ctx: ScriptContext): Promise<number> {
    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    const shopkeeper = ctx.state()?.nearbyNpcs.find(n => /shop.?keeper/i.test(n.name));
    if (!shopkeeper) {
        ctx.warn('No shopkeeper found');
        const nearby = ctx.state()?.nearbyNpcs.slice(0, 5).map(n => n.name).join(', ');
        ctx.log('Nearby NPCs: ' + nearby);
        return 0;
    }

    const tradeOpt = shopkeeper.optionsWithIndex?.find(o => /trade/i.test(o.text));
    if (!tradeOpt) {
        ctx.warn('Shopkeeper has no trade option');
        return 0;
    }

    ctx.log('Opening shop...');
    await ctx.sdk.sendInteractNpc(shopkeeper.index, tradeOpt.opIndex);

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (ctx.state()?.shop?.isOpen) {
            ctx.log('Shop opened');
            break;
        }
        markProgress(ctx);
    }

    const gpBefore = getCoins(ctx);
    const hidesBefore = countItem(ctx, /cow\s*hide/i);
    ctx.log(`Selling ${hidesBefore} hides. GP before: ${gpBefore}`);
    let sold = 0;

    for (let attempt = 0; attempt < 50; attempt++) {
        const hideCount = countItem(ctx, /cow\s*hide/i);
        if (hideCount === 0) break;

        const result = await ctx.bot.sellToShop(/cow\s*hide/i, 1);
        if (result.success) {
            sold++;
        } else {
            ctx.warn(`Sell failed: ${result.message}`);
            break;
        }

        await new Promise(r => setTimeout(r, 200));
        markProgress(ctx);
    }

    const gpAfter = getCoins(ctx);
    const earned = gpAfter - gpBefore;
    ctx.log(`Sold ${sold} hides for ${earned}gp (now have ${gpAfter}gp)`);

    await ctx.bot.closeShop();
    return earned;
}

async function buyGearFromShop(ctx: ScriptContext, gpAvailable: number): Promise<string[]> {
    const upgrades: string[] = [];
    const attackLevel = ctx.sdk.getSkill('Attack')?.baseLevel ?? 1;
    const defenceLevel = ctx.sdk.getSkill('Defence')?.baseLevel ?? 1;

    ctx.log(`Attack: ${attackLevel}, Defence: ${defenceLevel}, GP: ${gpAvailable}`);

    // Determine best tier we can use
    let tier = 'Bronze';
    let minLevel = Math.min(attackLevel, defenceLevel);
    if (minLevel >= 40) tier = 'Rune';
    else if (minLevel >= 30) tier = 'Adamant';
    else if (minLevel >= 20) tier = 'Mithril';
    else if (minLevel >= 10) tier = 'Steel';
    else if (minLevel >= 5) tier = 'Iron';

    ctx.log(`Can use ${tier} tier gear (min level ${minLevel})`);

    // Check current equipment
    const equipment = ctx.state()?.equipment ?? [];
    const hasSword = equipment.some(e => e && new RegExp(`${tier}.*sword|scimitar`, 'i').test(e.name));
    const hasBody = equipment.some(e => e && new RegExp(`${tier}.*platebody|chainbody`, 'i').test(e.name));
    const hasLegs = equipment.some(e => e && new RegExp(`${tier}.*platelegs|plateskirt`, 'i').test(e.name));

    ctx.log(`Has ${tier} gear: sword=${hasSword}, body=${hasBody}, legs=${hasLegs}`);

    // Try sword shop first
    if (!hasSword) {
        ctx.log('Looking for sword shop...');
        await ctx.bot.walkTo(LOCATIONS.VARROCK_SWORD_SHOP.x, LOCATIONS.VARROCK_SWORD_SHOP.z);
        await new Promise(r => setTimeout(r, 2000));
        markProgress(ctx);

        // Find any shop NPC
        let shopNpc = ctx.state()?.nearbyNpcs.find(n => /shop|sword|zaff/i.test(n.name));
        if (!shopNpc) {
            // Walk around to find shop
            await ctx.bot.walkTo(3207, 3395);  // Zaff's location
            await new Promise(r => setTimeout(r, 2000));
            shopNpc = ctx.state()?.nearbyNpcs.find(n => /shop|sword|zaff/i.test(n.name));
        }

        if (shopNpc) {
            ctx.log(`Found NPC: ${shopNpc.name}`);
            const tradeOpt = shopNpc.optionsWithIndex?.find(o => /trade/i.test(o.text));
            if (tradeOpt) {
                await ctx.sdk.sendInteractNpc(shopNpc.index, tradeOpt.opIndex);
                await new Promise(r => setTimeout(r, 1000));

                for (let i = 0; i < 10; i++) {
                    if (ctx.state()?.shop?.isOpen) break;
                    await new Promise(r => setTimeout(r, 300));
                }

                if (ctx.state()?.shop?.isOpen) {
                    const shopItems = ctx.state()?.shop?.shopItems ?? [];
                    ctx.log(`Shop: ${ctx.state()?.shop?.title}`);
                    ctx.log(`Items (${shopItems.length}):`);
                    for (const item of shopItems.slice(0, 15)) {
                        ctx.log(`  - ${item.name} (slot ${item.slot})`);
                    }

                    // Find best weapon we can afford
                    const weaponTiers = [
                        { tier: 'Adamant', maxPrice: 5000 },
                        { tier: 'Mithril', maxPrice: 2000 },
                        { tier: 'Steel', maxPrice: 500 },
                        { tier: 'Iron', maxPrice: 150 },
                    ];

                    for (const wt of weaponTiers) {
                        if (minLevel < (wt.tier === 'Adamant' ? 30 : wt.tier === 'Mithril' ? 20 : wt.tier === 'Steel' ? 10 : 5)) continue;
                        if (gpAvailable < wt.maxPrice) continue;

                        const pattern = new RegExp(`${wt.tier}.*scimitar|${wt.tier}.*sword|${wt.tier}.*longsword`, 'i');
                        const weapon = shopItems.find(i => pattern.test(i.name));
                        if (weapon) {
                            ctx.log(`Buying ${weapon.name}...`);
                            await ctx.sdk.sendShopBuy(weapon.slot, 1);
                            await new Promise(r => setTimeout(r, 500));

                            const newWeapon = ctx.state()?.inventory.find(i => pattern.test(i.name));
                            if (newWeapon) {
                                ctx.log(`Got ${newWeapon.name}!`);
                                upgrades.push(newWeapon.name);
                                await ctx.bot.equipItem(newWeapon);
                                gpAvailable = getCoins(ctx);
                            }
                            break;
                        }
                    }

                    await ctx.bot.closeShop();
                }
            }
        } else {
            ctx.log('No shop NPC found near sword shop');
        }
    }

    // Try armour shop
    if (!hasBody || !hasLegs) {
        ctx.log('Looking for armour shop...');
        await ctx.bot.walkTo(LOCATIONS.VARROCK_ARMOUR_SHOP.x, LOCATIONS.VARROCK_ARMOUR_SHOP.z);
        await new Promise(r => setTimeout(r, 2000));
        markProgress(ctx);

        let armourNpc = ctx.state()?.nearbyNpcs.find(n => /horvik|shop|armour/i.test(n.name));
        if (!armourNpc) {
            await ctx.bot.walkTo(3190, 3423);  // Horvik's location
            await new Promise(r => setTimeout(r, 2000));
            armourNpc = ctx.state()?.nearbyNpcs.find(n => /horvik|shop|armour/i.test(n.name));
        }

        if (armourNpc) {
            ctx.log(`Found NPC: ${armourNpc.name}`);
            const tradeOpt = armourNpc.optionsWithIndex?.find(o => /trade/i.test(o.text));
            if (tradeOpt) {
                await ctx.sdk.sendInteractNpc(armourNpc.index, tradeOpt.opIndex);
                await new Promise(r => setTimeout(r, 1000));

                for (let i = 0; i < 10; i++) {
                    if (ctx.state()?.shop?.isOpen) break;
                    await new Promise(r => setTimeout(r, 300));
                }

                if (ctx.state()?.shop?.isOpen) {
                    const shopItems = ctx.state()?.shop?.shopItems ?? [];
                    ctx.log(`Shop: ${ctx.state()?.shop?.title}`);
                    ctx.log(`Items (${shopItems.length}):`);
                    for (const item of shopItems.slice(0, 15)) {
                        ctx.log(`  - ${item.name}`);
                    }

                    // Try to buy body
                    if (!hasBody) {
                        const armourTiers = [
                            { tier: 'Adamant', maxPrice: 8000 },
                            { tier: 'Mithril', maxPrice: 3500 },
                            { tier: 'Steel', maxPrice: 1500 },
                            { tier: 'Iron', maxPrice: 400 },
                        ];

                        for (const at of armourTiers) {
                            if (minLevel < (at.tier === 'Adamant' ? 30 : at.tier === 'Mithril' ? 20 : at.tier === 'Steel' ? 10 : 5)) continue;
                            if (gpAvailable < at.maxPrice) continue;

                            const bodyPattern = new RegExp(`${at.tier}.*(platebody|chainbody)`, 'i');
                            const body = shopItems.find(i => bodyPattern.test(i.name));
                            if (body) {
                                ctx.log(`Buying ${body.name}...`);
                                await ctx.sdk.sendShopBuy(body.slot, 1);
                                await new Promise(r => setTimeout(r, 500));

                                const newBody = ctx.state()?.inventory.find(i => bodyPattern.test(i.name));
                                if (newBody) {
                                    ctx.log(`Got ${newBody.name}!`);
                                    upgrades.push(newBody.name);
                                    await ctx.bot.equipItem(newBody);
                                    gpAvailable = getCoins(ctx);
                                }
                                break;
                            }
                        }
                    }

                    // Try to buy legs
                    if (!hasLegs && gpAvailable > 300) {
                        const legsTiers = [
                            { tier: 'Adamant', maxPrice: 6000 },
                            { tier: 'Mithril', maxPrice: 2500 },
                            { tier: 'Steel', maxPrice: 1000 },
                            { tier: 'Iron', maxPrice: 300 },
                        ];

                        for (const lt of legsTiers) {
                            if (minLevel < (lt.tier === 'Adamant' ? 30 : lt.tier === 'Mithril' ? 20 : lt.tier === 'Steel' ? 10 : 5)) continue;
                            if (gpAvailable < lt.maxPrice) continue;

                            const legsPattern = new RegExp(`${lt.tier}.*(platelegs|plateskirt)`, 'i');
                            const legs = shopItems.find(i => legsPattern.test(i.name));
                            if (legs) {
                                ctx.log(`Buying ${legs.name}...`);
                                await ctx.sdk.sendShopBuy(legs.slot, 1);
                                await new Promise(r => setTimeout(r, 500));

                                const newLegs = ctx.state()?.inventory.find(i => legsPattern.test(i.name));
                                if (newLegs) {
                                    ctx.log(`Got ${newLegs.name}!`);
                                    upgrades.push(newLegs.name);
                                    await ctx.bot.equipItem(newLegs);
                                    gpAvailable = getCoins(ctx);
                                }
                                break;
                            }
                        }
                    }

                    await ctx.bot.closeShop();
                }
            }
        } else {
            ctx.log('No armour shop NPC found');
        }
    }

    return upgrades;
}

// Main arc
runArc({
    characterName: 'adam_5',
    arcName: 'sell-and-upgrade',
    goal: 'Sell hides, buy gear upgrades',
    timeLimit: 10 * 60 * 1000,
    stallTimeout: 60_000,
    screenshotInterval: 20_000,
    launchOptions: {
        useSharedBrowser: false,  // Use dedicated browser to avoid crashes
    },
}, async (ctx) => {
    ctx.log('=== Arc: sell-and-upgrade (Brad_1) ===');
    ctx.log('Goal: Sell cowhides, buy Adamant or better gear');

    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    const startGp = getCoins(ctx);
    const startHides = countItem(ctx, /cow\s*hide/i);
    ctx.log(`Starting GP: ${startGp}`);
    ctx.log(`Starting hides in inventory: ${startHides}`);

    const position = ctx.state()?.player;
    ctx.log(`Position: (${position?.worldX}, ${position?.worldZ})`);

    // Step 0: Exit cow field if inside (need to open gate)
    ctx.log('');
    ctx.log('=== Step 0: Exit cow field ===');

    // Try to open any nearby gate first
    const gateResult = await ctx.bot.openDoor(/gate/i);
    ctx.log(`Gate open result: ${gateResult.success} - ${gateResult.message}`);
    await new Promise(r => setTimeout(r, 500));
    markProgress(ctx);

    // Walk outside cow field first (just north of pen)
    await ctx.bot.walkTo(3253, 3295);
    await new Promise(r => setTimeout(r, 1000));
    markProgress(ctx);

    // Try opening gate again if still inside
    const pos1 = ctx.state()?.player;
    ctx.log(`Position after first walk: (${pos1?.worldX}, ${pos1?.worldZ})`);
    if (pos1 && pos1.worldZ < 3295) {
        await ctx.bot.openDoor(/gate/i);
        await ctx.bot.walkTo(3253, 3298);
        await new Promise(r => setTimeout(r, 1000));
        markProgress(ctx);
    }

    // Step 1: Walk to bank and deposit all hides
    ctx.log('');
    ctx.log('=== Step 1: Bank current hides ===');
    await walkWaypoints(ctx, WAYPOINTS_TO_BANK, 'to Varrock West Bank');

    let totalHides = startHides;
    if (await openBank(ctx)) {
        const deposited = await depositAllHides(ctx);
        totalHides = deposited;

        // Step 2: Withdraw all hides from bank
        ctx.log('');
        ctx.log('=== Step 2: Withdraw hides from bank ===');
        const withdrawn = await withdrawAllHides(ctx);
        totalHides = Math.max(totalHides, withdrawn);
        await ctx.bot.closeShop();
    }

    // Step 3: Walk to Lumbridge and sell
    ctx.log('');
    ctx.log('=== Step 3: Sell hides at Lumbridge ===');
    await walkWaypoints(ctx, WAYPOINTS_VARROCK_TO_LUMBRIDGE, 'to Lumbridge');
    const gpEarned = await sellHidesToShop(ctx);

    // Step 4: Buy gear upgrades
    ctx.log('');
    ctx.log('=== Step 4: Buy gear upgrades ===');
    const currentGp = getCoins(ctx);
    ctx.log(`GP available: ${currentGp}`);

    await walkWaypoints(ctx, WAYPOINTS_LUMBRIDGE_TO_VARROCK, 'to Varrock shops');
    const upgrades = await buyGearFromShop(ctx, currentGp);

    // Final summary
    ctx.log('');
    ctx.log('=== Final State ===');
    ctx.log(`GP: ${getCoins(ctx)}`);
    ctx.log(`Hides remaining: ${countItem(ctx, /cow\s*hide/i)}`);
    ctx.log(`Upgrades purchased: ${upgrades.length > 0 ? upgrades.join(', ') : 'none'}`);

    const equipped = ctx.state()?.equipment.filter(e => e !== null) ?? [];
    ctx.log(`Equipment: ${equipped.map(e => e?.name).join(', ')}`);

    // Walk back to cows to continue training
    ctx.log('');
    ctx.log('Returning to cow field...');
    await ctx.bot.walkTo(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z);
    await ctx.bot.openDoor(/gate/i);
    markProgress(ctx);
});

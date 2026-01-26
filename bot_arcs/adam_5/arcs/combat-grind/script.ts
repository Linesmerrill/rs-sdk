/**
 * Arc: combat-grind
 * Character: adam_5
 *
 * Goal: Train Attack, Strength, Defence with balanced style cycling.
 * Strategy: Kill cows, loot raw beef + hides.
 *
 * Duration: 10 minutes
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc } from '../../../../agent/types.ts';

// === LOCATIONS ===
const LOCATIONS = {
    COW_FIELD: { x: 3253, z: 3279 },  // Center of cow field
};

// Waypoints from north (chicken coop area) to cow field
const WAYPOINTS_FROM_NORTH = [
    { x: 3250, z: 3290 },
    { x: 3253, z: 3279 },
];

// Waypoints from Lumbridge spawn to cow field
const WAYPOINTS_FROM_LUMBRIDGE = [
    { x: 3222, z: 3220 },
    { x: 3230, z: 3240 },
    { x: 3245, z: 3260 },
    { x: 3253, z: 3269 },
];

// === COMBAT STYLES ===
const COMBAT_STYLES = {
    ACCURATE: 0,    // Trains Attack
    AGGRESSIVE: 1,  // Trains Strength
    CONTROLLED: 2,  // Trains all three
    DEFENSIVE: 3,   // Trains Defence
};

const STYLE_ROTATION = [
    { style: COMBAT_STYLES.ACCURATE, name: 'Accurate (Attack)' },
    { style: COMBAT_STYLES.AGGRESSIVE, name: 'Aggressive (Strength)' },
    { style: COMBAT_STYLES.AGGRESSIVE, name: 'Aggressive (Strength)' },
    { style: COMBAT_STYLES.DEFENSIVE, name: 'Defensive (Defence)' },
];

let lastStyleChange = 0;
let currentStyleIndex = 0;
let lastSetStyle = -1;
const STYLE_CYCLE_MS = 30_000;

// === STATS ===
interface Stats {
    kills: number;
    hidesLooted: number;
    rawBeefLooted: number;
    startTime: number;
    lastProgressTime: number;
}

function markProgress(ctx: ScriptContext, stats: Stats): void {
    stats.lastProgressTime = Date.now();
    ctx.progress();
}

// === SKILL HELPERS ===
function getSkillLevel(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
}

function getSkillXp(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.experience ?? 0;
}

function getTotalLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 32;
}

function getHP(ctx: ScriptContext): { current: number; max: number } {
    const hp = ctx.state()?.skills.find(s => s.name === 'Hitpoints');
    return {
        current: hp?.level ?? 10,
        max: hp?.baseLevel ?? 10,
    };
}

// Check if we died (position is Lumbridge spawn or position is invalid)
function isAtLumbridge(ctx: ScriptContext): boolean {
    const player = ctx.state()?.player;
    if (!player) return false;
    // Lumbridge spawn is around (3222, 3218)
    const dx = Math.abs(player.worldX - 3222);
    const dz = Math.abs(player.worldZ - 3218);
    return dx < 15 && dz < 15;
}

function needsToWalkToCows(ctx: ScriptContext): boolean {
    const player = ctx.state()?.player;
    if (!player) return false;  // Don't walk if no state - wait for it
    // If position is invalid (0,0), wait for valid state
    if (player.worldX === 0 && player.worldZ === 0) return false;
    // Check distance from cow field
    const dx = Math.abs(player.worldX - LOCATIONS.COW_FIELD.x);
    const dz = Math.abs(player.worldZ - LOCATIONS.COW_FIELD.z);
    const dist = Math.sqrt(dx*dx + dz*dz);
    return dist > 50;
}

// === FOOD MANAGEMENT ===
async function eatFoodIfNeeded(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    const hp = getHP(ctx);
    // Eat when below 50% HP
    if (hp.current >= hp.max * 0.5) return false;

    const food = ctx.state()?.inventory.find(i =>
        /cooked|bread|shrimp|trout|salmon|lobster|meat|beef/i.test(i.name)
    );

    if (food) {
        const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
        if (eatOpt) {
            ctx.log('Eating ' + food.name + ' (HP: ' + hp.current + '/' + hp.max + ')');
            await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
            markProgress(ctx, stats);
            return true;
        }
    }
    return false;
}

// === COMBAT HELPERS ===
function findCow(ctx: ScriptContext): NearbyNpc | null {
    const state = ctx.state();
    if (!state) return null;

    const cows = state.nearbyNpcs
        .filter(npc => /^cow$/i.test(npc.name))
        .filter(npc => npc.options.some(opt => /attack/i.test(opt)))
        .filter(npc => !npc.inCombat)
        .sort((a, b) => a.distance - b.distance);

    return cows[0] ?? null;
}

async function cycleCombatStyle(ctx: ScriptContext): Promise<void> {
    const now = Date.now();
    if (now - lastStyleChange >= STYLE_CYCLE_MS) {
        currentStyleIndex = (currentStyleIndex + 1) % STYLE_ROTATION.length;
        lastStyleChange = now;
    }

    const target = STYLE_ROTATION[currentStyleIndex]!;
    if (lastSetStyle !== target.style) {
        ctx.log('Setting combat style: ' + target.name);
        await ctx.sdk.sendSetCombatStyle(target.style);
        lastSetStyle = target.style;
    }
}

// === MAIN COMBAT LOOP ===
async function combatLoop(ctx: ScriptContext, stats: Stats): Promise<void> {
    lastStyleChange = Date.now();
    currentStyleIndex = 0;
    lastSetStyle = -1;
    let noCowCount = 0;
    let loopCount = 0;

    while (true) {
        loopCount++;
        const currentState = ctx.state();
        if (!currentState) break;

        // Periodic status logging
        if (loopCount % 50 === 0) {
            const atk = getSkillLevel(ctx, 'Attack');
            const str = getSkillLevel(ctx, 'Strength');
            const def = getSkillLevel(ctx, 'Defence');
            const hp = getHP(ctx);
            ctx.log('Loop ' + loopCount + ': Atk ' + atk + ', Str ' + str + ', Def ' + def + ' | HP: ' + hp.current + '/' + hp.max + ' | Kills: ' + stats.kills);
        }

        // Dismiss dialogs
        if (currentState.dialog.isOpen) {
            ctx.log('Dismissing dialog...');
            await ctx.sdk.sendClickDialog(0);
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Check if we need to walk back to cows (died or got lost)
        const player = currentState.player;
        if (player) {
            const distToCows = Math.sqrt(
                Math.pow(player.worldX - LOCATIONS.COW_FIELD.x, 2) +
                Math.pow(player.worldZ - LOCATIONS.COW_FIELD.z, 2)
            );
            if (distToCows > 50) {
                // Skip if position looks invalid (large distance typically means state glitch)
                if (distToCows > 500 || player.worldX < 2000 || player.worldZ < 2000) {
                    ctx.log('Invalid position detected (' + player.worldX + ', ' + player.worldZ + '), waiting for state...');
                    await new Promise(r => setTimeout(r, 3000));
                    markProgress(ctx, stats);
                    continue;
                }

                ctx.log('Too far from cows (' + distToCows.toFixed(0) + ' tiles)! Walking back...');
                // Wait a moment for respawn to complete
                await new Promise(r => setTimeout(r, 2000));
                markProgress(ctx, stats);

                // Choose waypoints based on position
                const useNorthWaypoints = player.worldZ > 3285;
                const waypoints = useNorthWaypoints ? WAYPOINTS_FROM_NORTH : WAYPOINTS_FROM_LUMBRIDGE;

                try {
                    for (const wp of waypoints) {
                        ctx.log('  Walking to waypoint (' + wp.x + ', ' + wp.z + ')...');
                        await ctx.bot.walkTo(wp.x, wp.z);
                        markProgress(ctx, stats);
                        await new Promise(r => setTimeout(r, 500));
                        if (ctx.state()?.dialog.isOpen) {
                            await ctx.sdk.sendClickDialog(0);
                        }
                    }
                    await ctx.bot.openDoor(/gate/i);
                    markProgress(ctx, stats);
                    ctx.log('Back at cow field!');
                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    ctx.log('Walk failed: ' + errorMsg + ', retrying next loop...');
                    await new Promise(r => setTimeout(r, 2000));
                    markProgress(ctx, stats);
                }
                continue;
            }
        }

        // Eat food if HP is low
        await eatFoodIfNeeded(ctx, stats);

        // Cycle combat style for balanced training
        await cycleCombatStyle(ctx);

        // Check if we're idle
        const isIdle = player?.animId === -1;

        if (isIdle) {
            // Find a cow to attack
            const cow = findCow(ctx);
            if (!cow) {
                noCowCount++;
                if (noCowCount % 30 === 0) {
                    ctx.log('No cows found (' + noCowCount + ' attempts), walking to field...');
                    await ctx.sdk.sendWalk(LOCATIONS.COW_FIELD.x, LOCATIONS.COW_FIELD.z, true);
                    markProgress(ctx, stats);
                    await new Promise(r => setTimeout(r, 2000));
                }
                await new Promise(r => setTimeout(r, 100));
                markProgress(ctx, stats);
                continue;
            }

            noCowCount = 0;

            // Attack the cow with error handling for timeouts
            try {
                const attackResult = await ctx.bot.attackNpc(cow);
                if (attackResult.success) {
                    ctx.log('Attacking cow (dist: ' + cow.distance.toFixed(0) + ')');
                    stats.kills++;
                    markProgress(ctx, stats);
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    ctx.log('Attack failed: ' + attackResult.message);
                    if (attackResult.reason === 'out_of_reach') {
                        ctx.log('Opening gate...');
                        await ctx.bot.openDoor(/gate/i);
                        markProgress(ctx, stats);
                    }
                }
            } catch (err) {
                // Timeout or other error - just continue with next cow
                const errorMsg = err instanceof Error ? err.message : String(err);
                if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
                    ctx.log('Attack timed out, trying next cow...');
                } else {
                    ctx.log('Attack error: ' + errorMsg);
                }
                markProgress(ctx, stats);
            }
        }

        await new Promise(r => setTimeout(r, 600));
        markProgress(ctx, stats);
    }
}

// === FINAL STATS ===
function logFinalStats(ctx: ScriptContext, stats: Stats): void {
    const duration = (Date.now() - stats.startTime) / 1000;

    ctx.log('');
    ctx.log('=== Arc Results ===');
    ctx.log('Duration: ' + Math.round(duration) + 's');
    ctx.log('Attack: Level ' + getSkillLevel(ctx, 'Attack'));
    ctx.log('Strength: Level ' + getSkillLevel(ctx, 'Strength'));
    ctx.log('Defence: Level ' + getSkillLevel(ctx, 'Defence'));
    ctx.log('Kills: ' + stats.kills);
    ctx.log('Total Level: ' + getTotalLevel(ctx));
}

// === WAIT FOR STATE ===
async function waitForState(ctx: ScriptContext, stats: Stats): Promise<boolean> {
    ctx.log('Waiting for game state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 45000);  // 45 seconds
        const state = ctx.state();
        ctx.log('State ready! Position: (' + state?.player?.worldX + ', ' + state?.player?.worldZ + ')');
        await new Promise(r => setTimeout(r, 1000));
        markProgress(ctx, stats);
        return true;
    } catch (e) {
        ctx.warn('State did not populate after 45 seconds');
        return false;
    }
}

// === RUN THE ARC ===
runArc({
    characterName: 'adam_5',
    arcName: 'combat-grind',
    goal: 'Train Attack/Strength/Defence at cows',
    timeLimit: 10 * 60 * 1000,
    stallTimeout: 60_000,
    screenshotInterval: 30_000,
    launchOptions: {
        useSharedBrowser: false,  // Use dedicated browser for stability
    },
}, async (ctx) => {
    const stats: Stats = {
        kills: 0,
        hidesLooted: 0,
        rawBeefLooted: 0,
        startTime: Date.now(),
        lastProgressTime: Date.now(),
    };

    ctx.log('=== Arc: combat-grind ===');
    ctx.log('Goal: 70/70/70 Attack/Strength/Defence');
    const stateReady = await waitForState(ctx, stats);

    // Don't proceed with invalid state
    if (!stateReady || ctx.state()?.player?.worldX === 0) {
        ctx.error('Cannot proceed without valid game state');
        return;
    }

    const startAtk = getSkillLevel(ctx, 'Attack');
    const startStr = getSkillLevel(ctx, 'Strength');
    const startDef = getSkillLevel(ctx, 'Defence');
    ctx.log('Starting: Attack ' + startAtk + ', Strength ' + startStr + ', Defence ' + startDef);
    ctx.log('Position: (' + ctx.state()?.player?.worldX + ', ' + ctx.state()?.player?.worldZ + ')');
    ctx.log('Total Level: ' + getTotalLevel(ctx));

    // Equip weapon if available
    const inv = ctx.state()?.inventory || [];
    const equip = ctx.state()?.equipment || [];

    const hasWeaponEquipped = equip.some(e => /sword|axe|mace|dagger|scimitar/i.test(e?.name || ''));
    if (!hasWeaponEquipped) {
        const weapon = inv.find(i => /sword|mace|scimitar/i.test(i.name) && !/pickaxe/i.test(i.name));
        if (weapon) {
            ctx.log('Equipping ' + weapon.name + '...');
            await ctx.bot.equipItem(weapon);
            markProgress(ctx, stats);
        }
    }

    const shield = inv.find(i => /shield/i.test(i.name));
    if (shield) {
        ctx.log('Equipping ' + shield.name + '...');
        await ctx.bot.equipItem(shield);
        markProgress(ctx, stats);
    }

    // Dismiss startup dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx, stats);

    // Walk to cow field if needed - but only if we have a valid position
    const player = ctx.state()?.player;
    if (player && player.worldX !== 0 && player.worldZ !== 0) {
        const distToCows = Math.sqrt(
            Math.pow(player.worldX - LOCATIONS.COW_FIELD.x, 2) +
            Math.pow(player.worldZ - LOCATIONS.COW_FIELD.z, 2)
        );
        ctx.log('Distance to cow field: ' + distToCows.toFixed(0) + ' tiles');

        // Check if we're inside the cow field already (z < 3295 and x > 3240)
        const insideCowField = player.worldZ < 3293 && player.worldX > 3245 && player.worldX < 3270;

        if (distToCows > 30) {
            // Far from cows - use waypoints
            const useNorthWaypoints = player.worldZ > 3285;
            const waypoints = useNorthWaypoints ? WAYPOINTS_FROM_NORTH : WAYPOINTS_FROM_LUMBRIDGE;

            ctx.log('Walking to cow field from ' + (useNorthWaypoints ? 'north' : 'south') + '...');
            for (const wp of waypoints) {
                ctx.log('  Waypoint (' + wp.x + ', ' + wp.z + ')...');
                await ctx.bot.walkTo(wp.x, wp.z);
                markProgress(ctx, stats);
                await new Promise(r => setTimeout(r, 300));

                if (ctx.state()?.dialog.isOpen) {
                    await ctx.sdk.sendClickDialog(0);
                }
            }
            ctx.log('Arrived at cow field!');
        } else if (!insideCowField) {
            // Near cow field but outside fence - walk to gate first
            ctx.log('Near cow field but outside fence - walking to gate at (3253, 3296)...');
            await ctx.bot.walkTo(3253, 3296);  // Gate position
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 1000));
        } else {
            ctx.log('Already inside cow field, skipping walk');
        }

        // Open gate to enter (or it will just confirm gate is open)
        ctx.log('Opening gate to cow field...');
        await ctx.bot.openDoor(/gate/i);
        markProgress(ctx, stats);
        await new Promise(r => setTimeout(r, 500));

        // After opening gate, walk inside the field
        if (!insideCowField) {
            ctx.log('Walking inside cow field...');
            await ctx.bot.walkTo(3253, 3279);  // Center of cow field
            markProgress(ctx, stats);
            await new Promise(r => setTimeout(r, 1000));
        }
    } else {
        ctx.log('Skipping initial walk (no valid position yet)');
    }

    try {
        await combatLoop(ctx, stats);
    } catch (e) {
        if (e instanceof StallError) {
            ctx.error('Arc aborted: ' + e.message);
        } else {
            throw e;
        }
    } finally {
        logFinalStats(ctx, stats);
    }
});

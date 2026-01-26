/**
 * Arc: drop-and-train
 * Character: Brad_1
 *
 * Goal: Drop inventory items (hides/beef) and continue combat training.
 * Strategy: Clear inventory to make room, then train combat at cows.
 *
 * Duration: 5 minutes (short to handle instability)
 */

import { runArc, StallError } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';
import type { NearbyNpc } from '../../../../agent/types.ts';

// === COMBAT STYLES ===
const COMBAT_STYLES = {
    ACCURATE: 0,    // Trains Attack
    AGGRESSIVE: 1,  // Trains Strength
    DEFENSIVE: 3,   // Trains Defence
};

// Focus on Defence since it's lowest (63 vs Atk 65, Str 70)
const STYLE_ROTATION = [
    { style: COMBAT_STYLES.DEFENSIVE, name: 'Defensive (Defence)' },
    { style: COMBAT_STYLES.ACCURATE, name: 'Accurate (Attack)' },
    { style: COMBAT_STYLES.AGGRESSIVE, name: 'Aggressive (Strength)' },
    { style: COMBAT_STYLES.DEFENSIVE, name: 'Defensive (Defence)' },
];

let lastStyleChange = 0;
let currentStyleIndex = 0;
let lastSetStyle = -1;
const STYLE_CYCLE_MS = 30_000;

interface Stats {
    kills: number;
    startTime: number;
    droppedItems: number;
}

function markProgress(ctx: ScriptContext): void {
    ctx.progress();
}

function getSkillLevel(ctx: ScriptContext, name: string): number {
    return ctx.state()?.skills.find(s => s.name === name)?.baseLevel ?? 1;
}

function getHP(ctx: ScriptContext): { current: number; max: number } {
    const hp = ctx.state()?.skills.find(s => s.name === 'Hitpoints');
    return {
        current: hp?.level ?? 10,
        max: hp?.baseLevel ?? 10,
    };
}

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

async function eatFoodIfNeeded(ctx: ScriptContext): Promise<boolean> {
    const hp = getHP(ctx);
    if (hp.current >= hp.max * 0.5) return false;

    const food = ctx.state()?.inventory.find(i =>
        /cooked|bread|shrimp|trout|salmon|lobster/i.test(i.name)
    );

    if (food) {
        const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
        if (eatOpt) {
            ctx.log('Eating ' + food.name + ' (HP: ' + hp.current + '/' + hp.max + ')');
            await ctx.sdk.sendUseItem(food.slot, eatOpt.opIndex);
            markProgress(ctx);
            return true;
        }
    }
    return false;
}

async function dropItems(ctx: ScriptContext, stats: Stats): Promise<void> {
    const state = ctx.state();
    if (!state) return;

    // Items to drop (hides, beef, bones)
    const itemsToDrop = state.inventory.filter(i =>
        /cow\s*hide|raw\s*beef|bones/i.test(i.name)
    );

    if (itemsToDrop.length === 0) {
        ctx.log('No items to drop');
        return;
    }

    ctx.log(`Dropping ${itemsToDrop.length} items to clear inventory...`);

    for (const item of itemsToDrop) {
        await ctx.sdk.sendDropItem(item.slot);
        stats.droppedItems++;
        await new Promise(r => setTimeout(r, 150));
        markProgress(ctx);
    }

    ctx.log(`Dropped ${itemsToDrop.length} items`);
}

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

        // Periodic status
        if (loopCount % 30 === 0) {
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
            markProgress(ctx);
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Eat if needed
        await eatFoodIfNeeded(ctx);

        // Cycle combat style
        await cycleCombatStyle(ctx);

        // Check if idle
        const player = currentState.player;
        const isIdle = player?.animId === -1;

        if (isIdle) {
            const cow = findCow(ctx);
            if (!cow) {
                noCowCount++;
                if (noCowCount % 20 === 0) {
                    ctx.log('No cows found (' + noCowCount + ' attempts)');
                    // Walk to cow field center
                    const COW_FIELD_CENTER = { x: 3253, z: 3279 };
                    const player = currentState.player;
                    if (player) {
                        const dist = Math.sqrt(
                            Math.pow(player.worldX - COW_FIELD_CENTER.x, 2) +
                            Math.pow(player.worldZ - COW_FIELD_CENTER.z, 2)
                        );
                        if (dist > 15) {
                            ctx.log('Walking back to cow field center...');
                            await ctx.sdk.sendWalk(COW_FIELD_CENTER.x, COW_FIELD_CENTER.z, true);
                            await new Promise(r => setTimeout(r, 2000));
                            markProgress(ctx);
                        }
                    }
                }
                await new Promise(r => setTimeout(r, 200));
                markProgress(ctx);
                continue;
            }

            noCowCount = 0;

            const attackResult = await ctx.bot.attackNpc(cow);
            if (attackResult.success) {
                ctx.log('Attacking cow (dist: ' + cow.distance.toFixed(0) + ')');
                stats.kills++;
                markProgress(ctx);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                ctx.log('Attack failed: ' + attackResult.message);
                if (attackResult.reason === 'out_of_reach') {
                    await ctx.bot.openDoor(/gate/i);
                    markProgress(ctx);
                }
            }
        }

        await new Promise(r => setTimeout(r, 600));
        markProgress(ctx);
    }
}

runArc({
    characterName: 'adam_5',
    arcName: 'drop-and-train',
    goal: 'Drop items, train combat at cows',
    timeLimit: 5 * 60 * 1000,  // 5 minutes
    stallTimeout: 45_000,
    launchOptions: {
        useSharedBrowser: false,  // Use dedicated browser for stability
    },
}, async (ctx) => {
    const stats: Stats = {
        kills: 0,
        startTime: Date.now(),
        droppedItems: 0,
    };

    ctx.log('=== Arc: drop-and-train ===');
    ctx.log('Goal: Clear inventory, train Defence (lowest at 63)');

    // Wait for state
    ctx.log('Waiting for state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 30000);
    } catch (e) {
        ctx.error('State did not populate');
        return;
    }
    await new Promise(r => setTimeout(r, 500));

    const state = ctx.state();
    if (!state?.player || state.player.worldX === 0) {
        ctx.error('Invalid state');
        return;
    }

    ctx.log('Position: (' + state.player.worldX + ', ' + state.player.worldZ + ')');
    ctx.log('Attack: ' + getSkillLevel(ctx, 'Attack') + ', Strength: ' + getSkillLevel(ctx, 'Strength') + ', Defence: ' + getSkillLevel(ctx, 'Defence'));

    // Dismiss any dialogs
    await ctx.bot.dismissBlockingUI();
    markProgress(ctx);

    // Drop items to clear inventory
    await dropItems(ctx, stats);

    // Start combat
    try {
        await combatLoop(ctx, stats);
    } catch (e) {
        if (e instanceof StallError) {
            ctx.error('Arc stalled: ' + e.message);
        } else {
            throw e;
        }
    }

    // Final stats
    const duration = (Date.now() - stats.startTime) / 1000;
    ctx.log('');
    ctx.log('=== Final Stats ===');
    ctx.log('Duration: ' + Math.round(duration) + 's');
    ctx.log('Kills: ' + stats.kills);
    ctx.log('Items dropped: ' + stats.droppedItems);
    ctx.log('Attack: ' + getSkillLevel(ctx, 'Attack'));
    ctx.log('Strength: ' + getSkillLevel(ctx, 'Strength'));
    ctx.log('Defence: ' + getSkillLevel(ctx, 'Defence'));
});

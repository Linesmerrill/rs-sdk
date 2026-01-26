/**
 * Arc: quick-bank
 * Character: Brad_1
 *
 * Goal: Bank hides at Varrock West Bank
 *
 * Current position: cow field around (3260, 3280)
 *
 * CRITICAL: Must open gate BEFORE walking through at (3253, 3270)!
 *
 * Route to Varrock West Bank:
 * 1. Open south gate in cow field
 * 2. Walk to (3250, 3260) - just outside pen
 * 3. Walk to (3220, 3280) - west
 * 4. Walk to (3200, 3300) - northwest
 * 5. Walk to (3185, 3420) - north along road
 * 6. Walk to (3185, 3436) - Varrock West Bank
 */

import { runArc } from '../../../arc-runner.ts';
import type { ScriptContext } from '../../../arc-runner.ts';

function markProgress(ctx: ScriptContext): void {
    ctx.progress();
}

function countItem(ctx: ScriptContext, pattern: RegExp): number {
    const items = ctx.state()?.inventory.filter(i => pattern.test(i.name)) ?? [];
    return items.reduce((sum, i) => sum + (i.count ?? 1), 0);
}

function getPosition(ctx: ScriptContext): { x: number, z: number } {
    const player = ctx.state()?.player;
    return { x: player?.worldX ?? 0, z: player?.worldZ ?? 0 };
}

runArc({
    characterName: 'adam_5',
    arcName: 'quick-bank',
    goal: 'Bank hides at Varrock West Bank',
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 60_000,
    screenshotInterval: 15_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    ctx.log('=== Quick Bank Arc (Varrock West) ===');

    // Wait for state to populate properly
    ctx.log('Waiting for state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 45000);
        ctx.log('State ready!');
    } catch {
        ctx.warn('State did not populate fully');
    }
    await new Promise(r => setTimeout(r, 1000));
    markProgress(ctx);

    const startHides = countItem(ctx, /cow\s*hide/i);
    let pos = getPosition(ctx);
    ctx.log(`Start position: (${pos.x}, ${pos.z})`);
    ctx.log(`Hides: ${startHides}`);

    // Step 0: Exit cow field via SOUTH gate - MUST OPEN GATE FIRST!
    ctx.log('');
    ctx.log('=== Step 0: Exit cow field ===');

    // Walk to south gate area first (inside the pen)
    ctx.log('Walking to south gate area (3253, 3270)...');
    await ctx.bot.walkTo(3253, 3270);
    markProgress(ctx);
    pos = getPosition(ctx);
    ctx.log(`Position after walk to gate: (${pos.x}, ${pos.z})`);

    // CRITICAL: Open the gate BEFORE walking through!
    ctx.log('OPENING GATE (critical step!)...');
    const gateResult = await ctx.bot.openDoor(/gate/i);
    ctx.log(`Gate: ${gateResult.success} - ${gateResult.message}`);
    await new Promise(r => setTimeout(r, 1000));
    markProgress(ctx);

    // Now walk through the open gate
    ctx.log('Walking through open gate to (3250, 3260)...');
    await ctx.bot.walkTo(3250, 3260);
    pos = getPosition(ctx);
    ctx.log(`Position after exiting gate: (${pos.x}, ${pos.z})`);
    markProgress(ctx);

    // Step 1: Walk to Varrock West Bank using provided route
    ctx.log('');
    ctx.log('=== Step 1: Walk to Varrock West Bank ===');

    // Route adjusted for pathfinder - smaller steps, avoid obstacles
    const waypoints = [
        { x: 3240, z: 3280, name: 'west-slight' },
        { x: 3240, z: 3300, name: 'north-1' },
        { x: 3230, z: 3330, name: 'north-2' },
        { x: 3220, z: 3360, name: 'north-3' },
        { x: 3210, z: 3390, name: 'north-4' },
        { x: 3200, z: 3420, name: 'north-5' },
        { x: 3185, z: 3436, name: 'varrock-west-bank' },
    ];

    for (const wp of waypoints) {
        ctx.log(`Walking to ${wp.name} (${wp.x}, ${wp.z})...`);
        const result = await ctx.bot.walkTo(wp.x, wp.z);
        ctx.log(`  Result: ${result.success} - ${result.message}`);
        pos = getPosition(ctx);
        ctx.log(`  Position: (${pos.x}, ${pos.z})`);
        markProgress(ctx);

        // Dismiss any dialogs
        if (ctx.state()?.dialog?.isOpen) {
            await ctx.sdk.sendClickDialog(0);
        }

        // Check if we're close to bank
        const distToBank = Math.sqrt(Math.pow(pos.x - 3185, 2) + Math.pow(pos.z - 3436, 2));
        if (distToBank < 20) {
            ctx.log('Close enough to Varrock West Bank!');
            break;
        }
    }

    // Step 2: Bank
    ctx.log('');
    ctx.log('=== Step 2: Bank hides ===');
    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    pos = getPosition(ctx);
    ctx.log(`Position at banking step: (${pos.x}, ${pos.z})`);

    const nearbyNpcs = ctx.state()?.nearbyNpcs.slice(0, 8).map(n => `${n.name} (${n.distance.toFixed(0)})`).join(', ');
    ctx.log(`Nearby NPCs: ${nearbyNpcs || 'none'}`);

    const banker = ctx.state()?.nearbyNpcs.find(n => /banker/i.test(n.name));

    if (banker) {
        ctx.log(`Found banker at distance ${banker.distance.toFixed(0)}`);
        const bankOpt = banker.optionsWithIndex?.find(o => /bank/i.test(o.text));

        if (bankOpt) {
            await ctx.sdk.sendInteractNpc(banker.index, bankOpt.opIndex);

            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 400));
                if (ctx.state()?.interface?.isOpen) {
                    ctx.log('Bank opened!');
                    break;
                }
                markProgress(ctx);
            }

            if (ctx.state()?.interface?.isOpen) {
                // Deposit hides
                const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
                for (const hide of hides) {
                    await ctx.sdk.sendBankDeposit(hide.slot, hide.count ?? 1);
                    await new Promise(r => setTimeout(r, 150));
                }
                ctx.log(`Deposited ${hides.length} cowhides`);

                // Deposit raw beef
                const beef = ctx.state()?.inventory.filter(i => /raw\s*beef/i.test(i.name)) ?? [];
                for (const item of beef) {
                    await ctx.sdk.sendBankDeposit(item.slot, item.count ?? 1);
                    await new Promise(r => setTimeout(r, 150));
                }
                if (beef.length > 0) ctx.log(`Deposited ${beef.length} raw beef`);

                // Deposit bones
                const bones = ctx.state()?.inventory.filter(i => /bones/i.test(i.name)) ?? [];
                for (const item of bones) {
                    await ctx.sdk.sendBankDeposit(item.slot, item.count ?? 1);
                    await new Promise(r => setTimeout(r, 150));
                }
                if (bones.length > 0) ctx.log(`Deposited ${bones.length} bones`);

                await ctx.bot.closeShop();
                ctx.log('Bank closed');
            } else {
                ctx.warn('Bank did not open');
            }
        }
    } else {
        ctx.warn('No banker found nearby');

        // Look for bank booth
        const nearbyLocs = ctx.state()?.nearbyLocs.slice(0, 8).map(l => `${l.name} (${l.distance.toFixed(0)})`).join(', ');
        ctx.log(`Nearby objects: ${nearbyLocs || 'none'}`);

        const booth = ctx.state()?.nearbyLocs.find(l => /bank\s*booth/i.test(l.name));
        if (booth) {
            ctx.log(`Found bank booth at distance ${booth.distance.toFixed(0)}`);
            const bankOpt = booth.optionsWithIndex?.find(o => /bank/i.test(o.text));
            if (bankOpt) {
                await ctx.sdk.sendInteractLoc(booth.x, booth.z, booth.id, bankOpt.opIndex);
                await new Promise(r => setTimeout(r, 2000));

                if (ctx.state()?.interface?.isOpen) {
                    const hides = ctx.state()?.inventory.filter(i => /cow\s*hide/i.test(i.name)) ?? [];
                    for (const hide of hides) {
                        await ctx.sdk.sendBankDeposit(hide.slot, hide.count ?? 1);
                        await new Promise(r => setTimeout(r, 150));
                    }
                    ctx.log(`Deposited ${hides.length} hides via booth`);
                    await ctx.bot.closeShop();
                }
            }
        }
    }

    // Step 3: Return to cow field (reverse the route)
    ctx.log('');
    ctx.log('=== Step 3: Return to cow field ===');

    const returnWaypoints = [
        { x: 3200, z: 3420, name: 'south-1' },
        { x: 3210, z: 3390, name: 'south-2' },
        { x: 3220, z: 3360, name: 'south-3' },
        { x: 3230, z: 3330, name: 'south-4' },
        { x: 3240, z: 3300, name: 'south-5' },
        { x: 3250, z: 3265, name: 'near-cow-gate' },
    ];

    for (const wp of returnWaypoints) {
        ctx.log(`Returning: ${wp.name} (${wp.x}, ${wp.z})...`);
        const result = await ctx.bot.walkTo(wp.x, wp.z);
        ctx.log(`  Result: ${result.success} - ${result.message}`);
        pos = getPosition(ctx);
        ctx.log(`  Position: (${pos.x}, ${pos.z})`);
        markProgress(ctx);

        if (ctx.state()?.dialog?.isOpen) {
            await ctx.sdk.sendClickDialog(0);
        }
    }

    // Open gate to enter cow field
    ctx.log('Opening gate to re-enter cow field...');
    await ctx.bot.openDoor(/gate/i);
    await new Promise(r => setTimeout(r, 800));
    markProgress(ctx);

    // Walk inside cow field
    ctx.log('Walking into cow field center...');
    await ctx.bot.walkTo(3253, 3279);
    markProgress(ctx);

    // Final state
    ctx.log('');
    ctx.log('=== Final State ===');
    const finalHides = countItem(ctx, /cow\s*hide/i);
    pos = getPosition(ctx);
    ctx.log(`Position: (${pos.x}, ${pos.z})`);
    ctx.log(`Hides in inventory: ${finalHides} (banked ${startHides - finalHides})`);
});

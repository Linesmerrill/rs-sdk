/**
 * Simple Combat Test - Minimal script to test browser stability
 * Just tries to attack one cow without walking or opening gates
 */

import { runArc } from '../arc-runner.ts';

runArc({
    characterName: 'adam_5',
    arcName: 'simple-combat-test',
    goal: 'Attack one cow to test stability',
    timeLimit: 60_000,  // 1 minute
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,  // Fresh browser
    },
}, async (ctx) => {
    ctx.log('=== Simple Combat Test ===');

    // Wait for state
    ctx.log('Waiting for state...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0);
        }, 30000);
        ctx.log('State ready!');
    } catch {
        ctx.warn('State did not populate');
    }
    await new Promise(r => setTimeout(r, 1000));
    ctx.progress();

    const state = ctx.state();
    ctx.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);
    ctx.log(`HP: ${ctx.sdk.getSkill('Hitpoints')?.level}/${ctx.sdk.getSkill('Hitpoints')?.baseLevel}`);

    // Find a cow
    const cow = state?.nearbyNpcs.find(n => /^cow$/i.test(n.name) && !n.inCombat);
    if (!cow) {
        ctx.warn('No cow found nearby');
        ctx.log('Nearby NPCs: ' + state?.nearbyNpcs.slice(0, 5).map(n => n.name).join(', '));
        return;
    }

    ctx.log(`Found cow at distance ${cow.distance.toFixed(0)}`);
    ctx.progress();

    // Try to attack it using low-level SDK
    ctx.log('Attempting to attack cow...');
    const attackOpt = cow.optionsWithIndex.find(o => /attack/i.test(o.text));
    if (attackOpt) {
        await ctx.sdk.sendInteractNpc(cow.index, attackOpt.opIndex);
        ctx.log('Attack command sent');
        ctx.progress();

        // Wait and check if we're in combat
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 500));
            ctx.progress();
            const player = ctx.state()?.player;
            if (player?.animId !== -1) {
                ctx.log(`In combat! Animation: ${player?.animId}`);
                break;
            }
        }
    } else {
        ctx.warn('Cow has no attack option');
    }

    // Report final state
    ctx.log('');
    ctx.log('=== Test Complete ===');
    ctx.log(`Position: (${ctx.state()?.player?.worldX}, ${ctx.state()?.player?.worldZ})`);
    ctx.log(`HP: ${ctx.sdk.getSkill('Hitpoints')?.level}/${ctx.sdk.getSkill('Hitpoints')?.baseLevel}`);
});

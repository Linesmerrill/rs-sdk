/**
 * Diagnostic script for Brad_1 - check current state
 */

import { runArc } from '../arc-runner.ts';
import type { ScriptContext } from '../arc-runner.ts';

runArc({
    characterName: 'adam_5',
    arcName: 'diagnostic',
    goal: 'Check current state and position',
    timeLimit: 60_000,  // 1 minute
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: true,   // Try shared browser (same as Adam bots)
        headless: false,
    },
}, async (ctx) => {
    // Wait for state to populate using SDK's waitForCondition
    ctx.log('Waiting for state to populate...');
    try {
        await ctx.sdk.waitForCondition(s => {
            return !!(s.player && s.player.worldX > 0 && s.skills.some(skill => skill.baseLevel > 0));
        }, 45000);  // 45 seconds
        ctx.log('State ready!');
    } catch (e) {
        ctx.warn('State did not populate after 45 seconds');
    }
    await new Promise(r => setTimeout(r, 1000));
    const state = ctx.state();

    ctx.log('=== Diagnostic Report ===');
    ctx.log('');

    // Position
    const player = state?.player;
    if (player) {
        ctx.log(`Position: (${player.worldX}, ${player.worldZ})`);
        ctx.log(`Animation ID: ${player.animId}`);
        ctx.log(`Combat Level: ${player.combatLevel}`);
    }

    // Skills
    ctx.log('');
    ctx.log('=== Combat Skills ===');
    const combatSkills = ['Attack', 'Strength', 'Defence', 'Hitpoints'];
    for (const name of combatSkills) {
        const skill = ctx.sdk.getSkill(name);
        if (skill) {
            ctx.log(`${name}: ${skill.baseLevel} (${skill.level}/${skill.baseLevel}) - XP: ${skill.experience}`);
        }
    }

    // HP
    const hp = ctx.sdk.getSkill('Hitpoints');
    ctx.log(`HP: ${hp?.level}/${hp?.baseLevel}`);

    // Equipment
    ctx.log('');
    ctx.log('=== Equipment ===');
    const equipment = state?.equipment ?? [];
    for (const item of equipment) {
        if (item) {
            ctx.log(`  ${item.slot}: ${item.name}`);
        }
    }

    // Inventory
    ctx.log('');
    ctx.log('=== Inventory ===');
    const inventory = state?.inventory ?? [];
    ctx.log(`Items: ${inventory.length}/28`);
    for (const item of inventory) {
        ctx.log(`  [${item.slot}] ${item.name} x${item.count}`);
    }

    // Nearby NPCs
    ctx.log('');
    ctx.log('=== Nearby NPCs ===');
    const npcs = state?.nearbyNpcs.slice(0, 10) ?? [];
    for (const npc of npcs) {
        const opts = npc.options.join(', ');
        ctx.log(`  ${npc.name} (dist: ${npc.distance.toFixed(0)}, inCombat: ${npc.inCombat}) - [${opts}]`);
    }

    // Nearby Objects
    ctx.log('');
    ctx.log('=== Nearby Objects ===');
    const locs = state?.nearbyLocs.slice(0, 10) ?? [];
    for (const loc of locs) {
        const opts = loc.options.join(', ');
        ctx.log(`  ${loc.name} (dist: ${loc.distance.toFixed(0)}) - [${opts}]`);
    }

    // Ground Items
    ctx.log('');
    ctx.log('=== Ground Items ===');
    const groundItems = ctx.sdk.getGroundItems().slice(0, 10);
    for (const item of groundItems) {
        ctx.log(`  ${item.name} x${item.count} (dist: ${item.distance.toFixed(0)})`);
    }

    // Game Messages
    ctx.log('');
    ctx.log('=== Recent Messages ===');
    const messages = state?.gameMessages.slice(-5) ?? [];
    for (const msg of messages) {
        ctx.log(`  "${msg.text}"`);
    }

    // Coins
    const coins = state?.inventory.find(i => /coins/i.test(i.name));
    ctx.log('');
    ctx.log(`GP: ${coins?.count ?? 0}`);

    // Total Level
    const totalLevel = state?.skills.reduce((sum, s) => sum + s.baseLevel, 0) ?? 0;
    ctx.log(`Total Level: ${totalLevel}`);

    ctx.log('');
    ctx.log('=== End Diagnostic ===');
});

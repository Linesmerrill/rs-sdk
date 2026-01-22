#!/usr/bin/env bun
/**
 * Smithing Test (SDK)
 * Smelt copper + tin ore into bronze bars at Al-Kharid furnace.
 *
 * Uses a pre-configured save file that spawns at the furnace with ore ready.
 * This is an atomic test - mining is tested separately in mining.ts.
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `smith${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 200;

// Al-Kharid furnace location (south of furnace)
const FURNACE_AREA = { x: 3274, z: 3184 };

async function runTest(): Promise<boolean> {
    console.log('=== Smithing Test (SDK) ===');
    console.log('Goal: Smelt copper + tin ore into bronze bars');

    // Generate save file at Al-Kharid furnace with ore ready
    console.log(`Creating save file for '${BOT_NAME}' at Al-Kharid furnace...`);
    await generateSave(BOT_NAME, {
        position: FURNACE_AREA,
        skills: { Smithing: 1 },
        inventory: [
            { id: Items.COPPER_ORE, count: 1 },
            { id: Items.TIN_ORE, count: 1 },
        ],
    });

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false });
        const { sdk, bot } = session;
        console.log(`Bot '${session.botName}' ready!`);

        const state = sdk.getState();
        console.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);

        const initialLevel = sdk.getSkill('Smithing')?.baseLevel ?? 1;
        const initialXp = sdk.getSkill('Smithing')?.experience ?? 0;
        console.log(`Initial Smithing: level ${initialLevel}, xp ${initialXp}`);

        // Check inventory
        const copperCount = sdk.getInventory().filter(i => /copper ore/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);
        const tinCount = sdk.getInventory().filter(i => /tin ore/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);
        console.log(`Inventory: ${copperCount} copper ore, ${tinCount} tin ore`);

        if (copperCount < 1 || tinCount < 1) {
            console.log('ERROR: Missing ore in inventory');
            return false;
        }

        let barsSmelted = 0;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            const currentState = sdk.getState();

            // Handle dialogs/interfaces
            if (currentState?.dialog.isOpen) {
                // Look for "Bronze" option in smelting interface
                const options = currentState.dialog.options;
                if (turn === 1 || turn % 20 === 0) {
                    console.log(`Turn ${turn}: Dialog options: ${options.join(', ')}`);
                }

                const bronzeOpt = options.findIndex(o => /bronze/i.test(o));
                if (bronzeOpt >= 0) {
                    console.log(`Turn ${turn}: Selecting Bronze bar option (index ${bronzeOpt})`);
                    await sdk.sendClickDialog(bronzeOpt);
                } else {
                    // Click first option or continue
                    await sdk.sendClickDialog(0);
                }
                await sleep(500);
                continue;
            }

            // Count bronze bars
            const barCount = sdk.getInventory().filter(i => /bronze bar/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);
            if (barCount > barsSmelted) {
                barsSmelted = barCount;
                console.log(`Turn ${turn}: Smelted ${barsSmelted} bronze bars!`);
            }

            // Check if we've run out of ore
            const copperLeft = sdk.getInventory().filter(i => /copper ore/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);
            const tinLeft = sdk.getInventory().filter(i => /tin ore/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);

            if (copperLeft === 0 || tinLeft === 0) {
                console.log(`Out of ore (copper: ${copperLeft}, tin: ${tinLeft})`);
                break;
            }

            // Progress logging
            if (turn % 30 === 0) {
                console.log(`Turn ${turn}: bars=${barsSmelted}, copper=${copperLeft}, tin=${tinLeft}`);
            }

            // Find and use furnace
            const allLocs = sdk.getNearbyLocs();
            if (turn === 1 || turn % 30 === 0) {
                console.log(`Turn ${turn} nearby locs:`);
                for (const loc of allLocs.slice(0, 10)) {
                    const opts = loc.optionsWithIndex.map(o => o.text).join(', ');
                    console.log(`  - ${loc.name} (${loc.x}, ${loc.z}): [${opts}]`);
                }
            }

            // Use ore on furnace
            const copperOre = sdk.findInventoryItem(/copper ore/i);
            if (copperOre) {
                // Find furnace by name or position
                const furnaceLoc = allLocs.find(loc =>
                    /furnace/i.test(loc.name) || (loc.x === 3226 && loc.z === 3256)
                );

                if (furnaceLoc) {
                    if (turn % 15 === 1) {
                        console.log(`Turn ${turn}: Using copper ore on ${furnaceLoc.name} at (${furnaceLoc.x}, ${furnaceLoc.z})`);
                    }
                    await sdk.sendUseItemOnLoc(copperOre.slot, furnaceLoc.x, furnaceLoc.z, furnaceLoc.id);
                } else {
                    // Fallback: Try known Al-Kharid furnace coords
                    if (turn % 15 === 1) {
                        console.log(`Turn ${turn}: No furnace found, trying hardcoded coords (3274, 3186)`);
                    }
                    await sdk.sendUseItemOnLoc(copperOre.slot, 3274, 3186, 2966);
                }

                // Wait for smelting interface or bar creation
                try {
                    await sdk.waitForCondition(state => {
                        if (state.dialog.isOpen) return true;
                        const newBars = state.inventory.filter(i => /bronze bar/i.test(i.name || '')).reduce((sum, i) => sum + i.count, 0);
                        if (newBars > barsSmelted) return true;
                        return false;
                    }, 10000);
                } catch { /* timeout */ }
            } else {
                console.log(`Turn ${turn}: No copper ore found!`);
            }

            await sleep(400);
        }

        // Final results
        const finalBars = sdk.getInventory().filter(i => /bronze bar/i.test(i.name)).reduce((sum, i) => sum + i.count, 0);
        const finalLevel = sdk.getSkill('Smithing')?.baseLevel ?? 1;
        const finalXp = sdk.getSkill('Smithing')?.experience ?? 0;

        console.log(`\n=== Results ===`);
        console.log(`Bronze bars smelted: ${finalBars}`);
        console.log(`Smithing: level ${initialLevel} -> ${finalLevel}, xp +${finalXp - initialXp}`);

        if (finalBars > 0) {
            console.log('SUCCESS: Smelted bronze bars!');
            return true;
        } else {
            console.log('FAILED: No bars smelted');
            return false;
        }

    } finally {
        if (session) {
            await session.cleanup();
        }
    }
}

runTest()
    .then(ok => {
        console.log(ok ? '\nPASSED' : '\nFAILED');
        process.exit(ok ? 0 : 1);
    })
    .catch(e => {
        console.error('Fatal:', e);
        process.exit(1);
    });

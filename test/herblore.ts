#!/usr/bin/env bun
/**
 * Herblore Test (SDK)
 * Make a potion to gain Herblore XP.
 *
 * Tests the potion-making mechanic:
 * 1. Combine unfinished guam potion with eye of newt
 * 2. Verify attack potion is created
 * 3. Verify Herblore XP gained
 *
 * Herblore requires level 3 for attack potions.
 *
 * Success criteria: Herblore XP gained (potion made)
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import { generateSave, Items, Locations } from './utils/save-generator';

const BOT_NAME = process.env.BOT_NAME ?? `herb${Math.random().toString(36).slice(2, 5)}`;
const MAX_TURNS = 100;

async function runTest(): Promise<boolean> {
    console.log('=== Herblore Test (SDK) ===');
    console.log('Goal: Make attack potion to gain Herblore XP');

    // Generate save file with herblore ingredients
    // Attack potion = Guam potion (unf) + Eye of newt
    console.log(`Creating save file for '${BOT_NAME}'...`);
    await generateSave(BOT_NAME, {
        position: Locations.LUMBRIDGE_CASTLE,
        skills: { Herblore: 3 },  // Level 3 required for attack potion
        inventory: [
            { id: Items.GUAM_POTION_UNF, count: 1 },
            { id: Items.EYE_OF_NEWT, count: 1 },
        ],
    });

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false, skipTutorial: false });
        const { sdk } = session;

        // Wait for state to fully load
        await sdk.waitForCondition(s => s.player?.worldX > 0 && s.inventory.length > 0, 10000);
        await sleep(500);

        console.log(`Bot '${session.botName}' ready!`);

        const state = sdk.getState();
        console.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);

        const initialLevel = sdk.getSkill('Herblore')?.baseLevel ?? 1;
        const initialXp = sdk.getSkill('Herblore')?.experience ?? 0;
        console.log(`Initial Herblore: level ${initialLevel}, xp ${initialXp}`);

        // Check inventory
        const unfPotion = sdk.findInventoryItem(/guam potion|unf/i);
        const eyeOfNewt = sdk.findInventoryItem(/eye of newt/i);
        console.log(`Inventory: unf potion=${unfPotion?.name ?? 'none'}, eye=${eyeOfNewt?.name ?? 'none'}`);

        if (!unfPotion || !eyeOfNewt) {
            console.log('FAILED: Missing ingredients');
            return false;
        }

        let potionAttempted = false;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            const currentState = sdk.getState();

            // Check for success - XP gain
            const currentXp = sdk.getSkill('Herblore')?.experience ?? 0;
            if (currentXp > initialXp) {
                console.log(`Turn ${turn}: SUCCESS - Herblore XP gained! (${initialXp} -> ${currentXp})`);
                return true;
            }

            // Check for potion in inventory
            const attackPotion = sdk.findInventoryItem(/attack potion/i);
            if (attackPotion) {
                console.log(`Turn ${turn}: SUCCESS - Attack potion created!`);
                return true;
            }

            // Handle interfaces (make-x dialogs)
            if (currentState?.interface.isOpen) {
                console.log(`Turn ${turn}: Interface open (id=${currentState.interface.interfaceId})`);
                console.log(`  Options: ${currentState.interface.options.map(o => `${o.index}:${o.text}`).join(', ') || 'none'}`);

                // Click first option to make the potion
                if (currentState.interface.options.length > 0) {
                    console.log(`  Clicking: ${currentState.interface.options[0].text}`);
                    await sdk.sendClickInterface(currentState.interface.options[0].index);
                }
                await sleep(500);
                continue;
            }

            // Handle dialogs
            if (currentState?.dialog.isOpen) {
                const options = currentState.dialog.options;
                console.log(`Turn ${turn}: Dialog: ${options.map(o => `${o.index}:${o.text}`).join(', ') || 'click to continue'}`);

                const makeOpt = options.find(o => /make|potion|yes/i.test(o.text));
                if (makeOpt) {
                    await sdk.sendClickDialog(makeOpt.index);
                } else if (options.length > 0) {
                    await sdk.sendClickDialog(options[0].index);
                } else {
                    await sdk.sendClickDialog(0);
                }
                await sleep(500);
                continue;
            }

            // Combine ingredients
            const currentUnf = sdk.findInventoryItem(/guam potion|unf/i);
            const currentEye = sdk.findInventoryItem(/eye of newt/i);

            if (currentUnf && currentEye && !potionAttempted) {
                console.log(`Turn ${turn}: Combining ${currentUnf.name} with ${currentEye.name}`);
                await sdk.sendUseItemOnItem(currentEye.slot, currentUnf.slot);
                potionAttempted = true;

                // Wait for interface, dialog, or XP gain
                try {
                    await sdk.waitForCondition(s => {
                        if (s.interface.isOpen) return true;
                        if (s.dialog.isOpen) return true;
                        const xp = s.skills.find(sk => sk.name === 'Herblore')?.experience ?? 0;
                        if (xp > initialXp) return true;
                        return false;
                    }, 10000);
                    potionAttempted = false;  // Reset to interact with interface
                } catch {
                    console.log('No interface opened, retrying...');
                    potionAttempted = false;
                }
                continue;
            }

            if (!currentUnf || !currentEye) {
                // Check final state
                const finalXp = sdk.getSkill('Herblore')?.experience ?? 0;
                if (finalXp > initialXp) {
                    console.log(`Turn ${turn}: SUCCESS - XP gained!`);
                    return true;
                }
                console.log(`Turn ${turn}: Ingredients used up`);
                break;
            }

            await sleep(400);
        }

        // Final check
        const finalXp = sdk.getSkill('Herblore')?.experience ?? 0;
        const finalLevel = sdk.getSkill('Herblore')?.baseLevel ?? 1;

        console.log(`\n=== Results ===`);
        console.log(`Herblore: level ${initialLevel} -> ${finalLevel}, xp +${finalXp - initialXp}`);

        if (finalXp > initialXp) {
            console.log('SUCCESS: Made potion!');
            return true;
        } else {
            console.log('FAILED: No XP gained');
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

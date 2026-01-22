#!/usr/bin/env bun
/**
 * Fletching Test (SDK)
 * Gain 1 level in Fletching by making arrow shafts.
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';

const BOT_NAME = process.env.BOT_NAME;
const MAX_TURNS = 200;

async function runTest(): Promise<boolean> {
    console.log('=== Fletching Test (SDK) ===');

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false });
        const { sdk, bot } = session;
        console.log(`Bot '${session.botName}' ready!`);

        const initialLevel = sdk.getSkill('Fletching')?.baseLevel ?? 1;
        console.log(`Initial Fletching level: ${initialLevel}`);

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            // Check for level up every turn
            const currentLevel = sdk.getSkill('Fletching')?.baseLevel ?? 1;
            const currentXp = sdk.getSkill('Fletching')?.experience ?? 0;
            if (turn % 20 === 0) {
                console.log(`Turn ${turn}: Fletching level=${currentLevel}, xp=${currentXp}`);
            }
            if (currentLevel > initialLevel) {
                console.log(`Turn ${turn}: SUCCESS - Fletching ${initialLevel} -> ${currentLevel} (xp=${currentXp})`);
                return true;
            }

            // Handle dialogs (fletching interface or level-up)
            const state = sdk.getState();
            if (state?.dialog.isOpen) {
                console.log(`Turn ${turn}: Dialog open, options:`, state.dialog.options.map(o => `${o.index}:${o.text}`));

                // Fletching dialog: "Ok" buttons make the item, "Arrow Shafts" just labels it
                // Look for an Ok button in a dialog that also has Arrow Shafts
                const hasArrowShafts = state.dialog.options.some(o =>
                    o.text.toLowerCase().includes('arrow shaft')
                );
                const okOption = state.dialog.options.find(o =>
                    o.text.toLowerCase() === 'ok'
                );
                if (hasArrowShafts && okOption) {
                    console.log(`  Fletching dialog - clicking Ok (option ${okOption.index}) to make arrow shafts`);
                    await sdk.sendClickDialog(okOption.index);
                } else if (state.dialog.options.length > 0) {
                    // Click first available option (usually "Click here to continue")
                    const firstOption = state.dialog.options[0];
                    console.log(`  Clicking first option ${firstOption.index}: ${firstOption.text}`);
                    await sdk.sendClickDialog(firstOption.index);
                } else {
                    // No options - click to continue
                    console.log(`  Clicking to continue (no options)`);
                    await sdk.sendClickDialog(0);
                }
                await sleep(500);
                continue;
            }

            // Handle interface (fletching make-x)
            if (state?.interface.isOpen) {
                console.log(`Turn ${turn}: Interface open (id=${state.interface.interfaceId}), options:`, state.interface.options.map(o => `${o.index}:${o.text}`));
                if (state.interface.options.length > 0) {
                    await sdk.sendClickInterface(state.interface.options[0].index);
                }
                await sleep(500);
                continue;
            }

            const knife = sdk.findInventoryItem(/knife/i);
            const logs = sdk.findInventoryItem(/logs/i);

            // Debug logging every 20 turns
            if (turn % 20 === 1) {
                console.log(`Turn ${turn}: knife=${knife?.name ?? 'none'}, logs=${logs?.name ?? 'none'}`);
            }

            // Step 1: Get knife if needed
            if (!knife) {
                const groundKnife = sdk.findGroundItem(/knife/i);
                if (groundKnife) {
                    // Walk to knife location first if far away
                    const player = sdk.getState()?.player;
                    if (player && groundKnife.distance > 3) {
                        console.log(`Turn ${turn}: Walking to knife at (${groundKnife.x}, ${groundKnife.z}), distance=${groundKnife.distance}`);
                        await bot.walkTo(groundKnife.x, groundKnife.z, 1);
                    }

                    console.log(`Turn ${turn}: Picking up knife`);
                    const result = await bot.pickupItem(groundKnife);
                    if (!result.success) {
                        console.log(`  Pickup failed: ${result.message}`);
                    }
                    continue;
                } else {
                    // Walk to known knife spawn location in Lumbridge
                    const KNIFE_SPAWN = { x: 3224, z: 3202 };
                    console.log(`Turn ${turn}: Walking to knife spawn at (${KNIFE_SPAWN.x}, ${KNIFE_SPAWN.z})`);
                    await bot.walkTo(KNIFE_SPAWN.x, KNIFE_SPAWN.z, 2);
                    await sleep(1000);  // Wait for item to appear in view
                    continue;
                }
            }

            // Step 2: Get logs if needed
            if (!logs) {
                const tree = sdk.findNearbyLoc(/^tree$/i);
                if (tree) {
                    console.log(`Turn ${turn}: Chopping tree at (${tree.x}, ${tree.z})`);
                    await bot.chopTree(tree);
                    continue;
                } else {
                    // Walk to tree area in Lumbridge
                    const TREE_AREA = { x: 3220, z: 3235 };
                    console.log(`Turn ${turn}: Walking to tree area`);
                    await bot.walkTo(TREE_AREA.x, TREE_AREA.z, 3);
                    continue;
                }
            }

            // Step 3: Fletch logs with knife
            if (knife && logs) {
                console.log(`Turn ${turn}: Fletching ${logs.name} with ${knife.name}`);
                await sdk.sendUseItemOnItem(knife.slot, logs.slot);
                await sleep(600);
                continue;
            }

            await sleep(300);
        }

        const finalLevel = sdk.getSkill('Fletching')?.baseLevel ?? 1;
        console.log(`Final Fletching level: ${finalLevel}`);
        return finalLevel > initialLevel;

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

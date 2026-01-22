#!/usr/bin/env bun
/**
 * Combat Training Test (SDK)
 * Train combat skills by fighting NPCs.
 * Success: Gain at least 1 level in Attack, Strength, AND Defence
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';
import type { NearbyNpc, InventoryItem } from '../agent/types';

const BOT_NAME = process.env.BOT_NAME;
const MAX_TURNS = 500;
const HEALTH_THRESHOLD = 10;

async function runTest(): Promise<boolean> {
    console.log('=== Combat Training Test (SDK) ===');
    console.log('Goal: Gain 1 level in Attack, Strength, AND Defence');

    let session: SDKSession | null = null;

    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false });
        const { sdk, bot } = session;
        console.log(`Bot '${session.botName}' ready!`);

        // Record initial combat levels
        const initialAtk = sdk.getSkill('Attack')?.baseLevel ?? 1;
        const initialStr = sdk.getSkill('Strength')?.baseLevel ?? 1;
        const initialDef = sdk.getSkill('Defence')?.baseLevel ?? 1;
        console.log(`Initial levels: Atk=${initialAtk}, Str=${initialStr}, Def=${initialDef}`);

        // Equip weapon - prefer sword over axe
        const sword = sdk.getInventory().find(i =>
            /sword|scimitar|dagger/i.test(i.name)
        );
        const weapon = sword ?? sdk.getInventory().find(i =>
            /axe|mace/i.test(i.name) && !/pickaxe/i.test(i.name)
        );
        if (weapon) {
            const wieldOpt = weapon.optionsWithIndex.find(o => /wield|wear/i.test(o.text));
            if (wieldOpt) {
                console.log(`Equipping ${weapon.name}`);
                await sdk.sendUseItem(weapon.slot, wieldOpt.opIndex);
                await sleep(500);
            }
        }

        // Helper to get style index for a skill from current weapon's styles
        const getStyleForSkill = (skill: string): number | null => {
            const styleState = sdk.getState()?.combatStyle;
            if (!styleState) return null;
            const match = styleState.styles.find(s =>
                s.trainedSkill.toLowerCase() === skill.toLowerCase()
            );
            return match?.index ?? null;
        };

        // Set initial combat style - start with Strength
        await sleep(300);  // Wait for weapon equip to update styles
        const styleState = sdk.getState()?.combatStyle;
        if (styleState) {
            console.log(`Combat styles: ${styleState.styles.map(s => `${s.index}:${s.name}(${s.trainedSkill})`).join(', ')}`);
        }

        let currentTrainingSkill = 'Strength';
        const strStyle = getStyleForSkill('Strength');
        if (strStyle !== null) {
            console.log(`Setting combat style to train ${currentTrainingSkill} (style ${strStyle})`);
            await sdk.sendSetCombatStyle(strStyle);
        }

        let kills = 0;
        let foodEaten = 0;
        let lastAtkLevel = initialAtk;
        let lastStrLevel = initialStr;
        let lastDefLevel = initialDef;

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
            // Check for success every 10 turns
            if (turn % 10 === 0) {
                const atk = sdk.getSkill('Attack')?.baseLevel ?? 1;
                const str = sdk.getSkill('Strength')?.baseLevel ?? 1;
                const def = sdk.getSkill('Defence')?.baseLevel ?? 1;

                const gainedAtk = atk > initialAtk;
                const gainedStr = str > initialStr;
                const gainedDef = def > initialDef;

                if (gainedAtk && gainedStr && gainedDef) {
                    console.log(`Turn ${turn}: SUCCESS - All 3 combat skills gained!`);
                    console.log(`  Attack: ${initialAtk} -> ${atk}`);
                    console.log(`  Strength: ${initialStr} -> ${str}`);
                    console.log(`  Defence: ${initialDef} -> ${def}`);
                    console.log(`  Kills: ${kills}, Food eaten: ${foodEaten}`);
                    return true;
                }

                if (turn % 50 === 0) {
                    console.log(`Turn ${turn}: Atk=${atk}(+${atk-initialAtk}), Str=${str}(+${str-initialStr}), Def=${def}(+${def-initialDef}), kills=${kills}`);
                }
            }

            // Check for level ups and switch style after each level gain
            const atk = sdk.getSkill('Attack')?.baseLevel ?? 1;
            const str = sdk.getSkill('Strength')?.baseLevel ?? 1;
            const def = sdk.getSkill('Defence')?.baseLevel ?? 1;

            const leveledUp = atk > lastAtkLevel || str > lastStrLevel || def > lastDefLevel;
            if (leveledUp) {
                lastAtkLevel = atk;
                lastStrLevel = str;
                lastDefLevel = def;

                // Cycle to next skill: Str -> Atk -> Def -> Str...
                let nextSkill: string;
                if (currentTrainingSkill === 'Strength') {
                    nextSkill = 'Attack';
                } else if (currentTrainingSkill === 'Attack') {
                    nextSkill = 'Defence';
                } else {
                    nextSkill = 'Strength';
                }

                const nextStyle = getStyleForSkill(nextSkill);
                if (nextStyle !== null) {
                    console.log(`Turn ${turn}: Level up! Switching to ${nextSkill} training (Atk=${atk}, Str=${str}, Def=${def})`);
                    await sdk.sendSetCombatStyle(nextStyle);
                    currentTrainingSkill = nextSkill;
                }
            }

            // Handle dialogs (level-up, etc.)
            const state = sdk.getState();
            if (state?.dialog.isOpen) {
                await sdk.sendClickDialog(0);
                await sleep(300);
                continue;
            }

            // Check for "I can't reach that" message - try to open nearby door
            const cantReachMsg = state?.gameMessages.find(m =>
                m.text.toLowerCase().includes("can't reach") ||
                m.text.toLowerCase().includes("cannot reach")
            );
            if (cantReachMsg && cantReachMsg.tick > (state?.tick ?? 0) - 5) {
                const door = sdk.getNearbyLocs().find(loc =>
                    /door/i.test(loc.name) && loc.distance <= 3
                );
                if (door) {
                    const openOpt = door.optionsWithIndex.find(o => /open/i.test(o.text));
                    if (openOpt) {
                        console.log(`Turn ${turn}: Opening door at (${door.x}, ${door.z})`);
                        await sdk.sendInteractLoc(door.x, door.z, door.id, openOpt.opIndex);
                        await sleep(600);
                        continue;
                    }
                }
            }

            // Check health and eat food if needed
            const hpSkill = sdk.getSkill('Hitpoints');
            const currentHp = hpSkill?.level ?? 10;  // level is current, baseLevel is max
            if (currentHp < HEALTH_THRESHOLD) {
                const food = findFood(sdk.getInventory());
                if (food) {
                    const eatOpt = food.optionsWithIndex.find(o => /eat/i.test(o.text));
                    if (eatOpt) {
                        console.log(`Turn ${turn}: Eating ${food.name} (hp=${currentHp})`);
                        await sdk.sendUseItem(food.slot, eatOpt.opIndex);
                        foodEaten++;
                        await sleep(500);
                        continue;
                    }
                }
            }

            // Find and attack NPC
            const target = findAttackableNpc(sdk.getNearbyNpcs());
            if (target) {
                const attackOpt = target.optionsWithIndex.find(o => /attack/i.test(o.text));
                if (attackOpt) {
                    if (turn % 20 === 1) {
                        console.log(`Turn ${turn}: Attacking ${target.name} (distance=${target.distance})`);
                    }
                    try {
                        await sdk.sendInteractNpc(target.index, attackOpt.opIndex);
                        kills++;
                    } catch (e: any) {
                        console.log(`Turn ${turn}: Attack failed - ${e.message}`);
                    }
                    await sleep(1500); // Wait for combat tick
                    continue;
                }
            } else if (turn % 20 === 0) {
                // Wander to find targets
                const px = state?.player?.worldX ?? 3222;
                const pz = state?.player?.worldZ ?? 3218;
                const dx = Math.floor(Math.random() * 10) - 5;
                const dz = Math.floor(Math.random() * 10) - 5;
                console.log(`Turn ${turn}: No targets, wandering...`);
                await bot.walkTo(px + dx, pz + dz, 2);
            }

            await sleep(600);
        }

        // Final check
        const finalAtk = sdk.getSkill('Attack')?.baseLevel ?? 1;
        const finalStr = sdk.getSkill('Strength')?.baseLevel ?? 1;
        const finalDef = sdk.getSkill('Defence')?.baseLevel ?? 1;

        console.log(`\n--- Combat Training Complete ---`);
        console.log(`Attack: ${initialAtk} -> ${finalAtk}`);
        console.log(`Strength: ${initialStr} -> ${finalStr}`);
        console.log(`Defence: ${initialDef} -> ${finalDef}`);
        console.log(`Kills: ${kills}, Food eaten: ${foodEaten}`);

        return finalAtk > initialAtk && finalStr > initialStr && finalDef > initialDef;

    } finally {
        if (session) {
            await session.cleanup();
        }
    }
}

function findFood(inventory: InventoryItem[]): InventoryItem | null {
    const foodNames = [
        'bread', 'meat', 'chicken', 'beef', 'shrimp', 'anchovies',
        'sardine', 'herring', 'trout', 'salmon', 'tuna', 'lobster',
        'cake', 'pie', 'pizza', 'cheese', 'cabbage', 'cooked'
    ];
    return inventory.find(item =>
        foodNames.some(food => item.name.toLowerCase().includes(food))
    ) ?? null;
}

function findAttackableNpc(npcs: NearbyNpc[]): NearbyNpc | null {
    const targetNames = ['man', 'woman', 'rat', 'guard', 'goblin', 'chicken'];

    for (const targetName of targetNames) {
        const target = npcs.find(npc => {
            const name = npc.name.toLowerCase();
            const hasAttack = npc.optionsWithIndex.some(o =>
                o.text.toLowerCase() === 'attack'
            );
            return name.includes(targetName) && hasAttack;
        });
        if (target) return target;
    }

    // Fallback: any NPC with attack option
    return npcs.find(npc =>
        npc.optionsWithIndex.some(o => o.text.toLowerCase() === 'attack')
    ) ?? null;
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

#!/usr/bin/env bun
/**
 * Shop Test (SDK)
 * Sell the bronze dagger to get coins, then buy a hammer.
 */

import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';

const BOT_NAME = process.env.BOT_NAME;
const SHOP_LOCATION = { x: 3212, z: 3246 };

async function runTest(): Promise<boolean> {
    console.log('=== Shop Test (SDK) ===');
    console.log('Goal: Sell dagger, buy hammer');

    let session: SDKSession | null = null;
    try {
        session = await launchBotWithSDK(BOT_NAME, { headless: false });
        const { sdk, bot } = session;
        console.log(`Bot '${session.botName}' ready!`);

        // Check if we already have a hammer
        if (sdk.findInventoryItem(/hammer/i)) {
            console.log('Already have hammer!');
            return true;
        }

        // Verify we have a dagger to sell
        const dagger = sdk.findInventoryItem(/dagger/i);
        if (!dagger) {
            console.log('ERROR: No dagger in inventory to sell');
            return false;
        }
        console.log(`Have ${dagger.name} to sell`);

        // Walk to shop
        console.log('Walking to shop...');
        await bot.walkTo(SHOP_LOCATION.x, SHOP_LOCATION.z, 3);

        // Open shop
        console.log('Opening shop...');
        const openResult = await bot.openShop(/shop\s*keeper/i);
        if (!openResult.success) {
            console.log(`Failed to open shop: ${openResult.message}`);
            return false;
        }
        console.log(openResult.message);

        // Sell the dagger
        console.log('Selling dagger...');
        const sellResult = await bot.sellToShop(/dagger/i);
        if (!sellResult.success) {
            console.log(`Failed to sell dagger: ${sellResult.message}`);
            return false;
        }
        console.log(sellResult.message);

        // Check we got coins
        await sleep(300);
        const coins = sdk.findInventoryItem(/coins/i);
        if (!coins) {
            console.log('ERROR: No coins after selling dagger');
            return false;
        }
        console.log(`Got ${coins.count} coins`);

        // Buy hammer
        console.log('Buying hammer...');
        const buyResult = await bot.buyFromShop(/hammer/i);
        if (!buyResult.success) {
            console.log(`Failed to buy hammer: ${buyResult.message}`);
            return false;
        }
        console.log(buyResult.message);

        // Verify hammer in inventory
        const hammer = sdk.findInventoryItem(/hammer/i);
        if (!hammer) {
            console.log('ERROR: Hammer not in inventory after purchase');
            return false;
        }

        console.log(`Success! Have ${hammer.name} in inventory`);
        await sdk.sendCloseShop();
        return true;

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

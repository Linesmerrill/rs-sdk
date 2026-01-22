/**
 * Browser launch helper for SDK-based tests.
 * Launches a Puppeteer browser with the game client.
 * No CLI dependency - just browser management.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { BotSDK } from '../../agent/sdk';
import { BotActions } from '../../agent/sdk-porcelain';

const BOT_URL = process.env.BOT_URL || 'http://localhost:8888/bot';

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface BrowserSession {
    browser: Browser;
    page: Page;
    botName: string;
    cleanup: () => Promise<void>;
}

export interface SDKSession extends BrowserSession {
    sdk: BotSDK;
    bot: BotActions;
}

/**
 * Launches a browser with the game client and waits for login.
 * Does NOT skip tutorial - use launchBotWithSDK for that.
 */
export async function launchBotBrowser(
    botName?: string,
    options: { headless?: boolean } = {}
): Promise<BrowserSession> {
    const name = botName || 'bot' + Math.random().toString(36).substring(2, 5);
    const headless = options.headless ?? true;

    const browser = await puppeteer.launch({
        headless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--mute-audio'  // Mute all audio
        ]
    });

    const page = await browser.newPage();

    // Navigate to bot URL with bot name
    await page.goto(`${BOT_URL}?bot=${name}`, { waitUntil: 'networkidle2' });

    // Wait for client to be ready for auto-login
    let attempts = 0;
    while (!await page.evaluate(() => (window as any).gameClient?.autoLogin)) {
        await sleep(200);
        attempts++;
        if (attempts > 50) {
            await browser.close();
            throw new Error('Timeout waiting for game client to load');
        }
    }

    // Perform auto-login
    await page.evaluate(
        (username: string) => (window as any).gameClient.autoLogin(username, 'test'),
        name
    );

    // Wait for in-game
    attempts = 0;
    while (!await page.evaluate(() => (window as any).gameClient?.ingame)) {
        await sleep(200);
        attempts++;
        if (attempts > 100) {
            await browser.close();
            throw new Error('Timeout waiting for login');
        }
    }

    console.log(`[Browser] Bot '${name}' logged in and in-game`);

    return {
        browser,
        page,
        botName: name,
        cleanup: async () => {
            console.log(`[Browser] Closing browser for '${name}'`);
            await browser.close();
        }
    };
}

/**
 * Skip tutorial using SDK.
 * Returns true if tutorial was skipped successfully.
 */
export async function skipTutorial(sdk: BotSDK, maxAttempts: number = 30): Promise<boolean> {
    // Accept character design if modal is open
    const state = sdk.getState();
    if (state?.modalOpen && state.modalInterface === 269) {
        await sdk.sendAcceptCharacterDesign();
        await sleep(500);
    }

    // Check if we're in tutorial (x < 3200)
    const isInTutorial = () => {
        const s = sdk.getState();
        return !s?.player || s.player.worldX < 3200;
    };

    let attempts = 0;
    while (isInTutorial() && attempts < maxAttempts) {
        await sdk.sendSkipTutorial();
        await sleep(1000);
        attempts++;
    }

    return !isInTutorial();
}

/**
 * Launches browser, connects SDK, and skips tutorial.
 * This is the main entry point for most tests.
 */
export async function launchBotWithSDK(
    botName?: string,
    options: { headless?: boolean; skipTutorial?: boolean } = {}
): Promise<SDKSession> {
    const shouldSkipTutorial = options.skipTutorial ?? true;

    // Launch browser
    const browser = await launchBotBrowser(botName, options);

    // Connect SDK
    const sdk = new BotSDK({ botUsername: browser.botName });
    await sdk.connect();

    // Wait for game state
    await sdk.waitForCondition(s => s.inGame, 30000);

    // Skip tutorial if requested
    if (shouldSkipTutorial) {
        const success = await skipTutorial(sdk);
        if (!success) {
            await sdk.disconnect();
            await browser.cleanup();
            throw new Error('Failed to skip tutorial');
        }
        // Wait for state to settle after tutorial
        await sleep(1000);
    }

    // Create porcelain wrapper
    const bot = new BotActions(sdk);

    return {
        ...browser,
        sdk,
        bot,
        cleanup: async () => {
            await sdk.disconnect();
            await browser.cleanup();
        }
    };
}

/**
 * Helper to check if player is in tutorial area (x < 3200)
 */
export async function isInTutorial(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
        const client = (window as any).gameClient;
        if (!client?.localPlayer) return true;
        const sceneBaseX = client.sceneBaseTileX || 0;
        const playerTileX = (client.localPlayer.x || 0) >> 7;
        const worldX = sceneBaseX + playerTileX;
        return worldX < 3200;
    });
}

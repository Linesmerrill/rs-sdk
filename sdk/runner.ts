// Script Runner - Zero boilerplate script execution
// Auto-finds bot.env sibling to script, or from command line arg, or --env-file

import { BotSDK } from './index';
import { BotActions } from './actions';
import { formatWorldState } from './formatter';
import type { BotWorldState } from './types';
import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

// ============ Types ============

export interface ScriptContext {
    bot: BotActions;
    sdk: BotSDK;
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
}

export type ScriptFunction = (ctx: ScriptContext) => Promise<any>;

export interface RunOptions {
    /** Overall timeout in ms (default: none) */
    timeout?: number;
    /** Existing connection - use instead of process.env for MCP context */
    connection?: { bot: BotActions; sdk: BotSDK };
    /** Connect if not connected (default: true) */
    autoConnect?: boolean;
    /** Disconnect when done (default: false) */
    disconnectAfter?: boolean;
    /** Print world state after execution (default: true) */
    printState?: boolean;
}

export interface LogEntry {
    timestamp: Date;
    level: 'log' | 'warn' | 'error';
    message: string;
}

export interface RunResult {
    success: boolean;
    result?: any;
    error?: Error;
    duration: number;
    logs: LogEntry[];
    finalState: BotWorldState | null;
}

// ============ Connection Management ============

interface BotConnection {
    sdk: BotSDK;
    bot: BotActions;
    username: string;
}

const connections = new Map<string, BotConnection>();

/**
 * Parse a bot.env file and load into process.env
 */
function loadEnvFile(envPath: string): void {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim();
            process.env[key] = value;
        }
    }
}

/**
 * Load bot credentials automatically.
 * Priority:
 * 1. Already set in process.env (via --env-file)
 * 2. bot.env sibling to the script file
 * 3. Command line arg: bun script.ts <botname> -> bots/<botname>/bot.env
 */
function loadEnvFromArgs(): void {
    // Skip if already have credentials (e.g., from --env-file)
    if (process.env.BOT_USERNAME && process.env.PASSWORD) return;

    // Try bot.env sibling to the script file
    const scriptPath = process.argv[1];
    if (scriptPath) {
        const scriptDir = dirname(resolve(scriptPath));
        const siblingEnv = join(scriptDir, 'bot.env');
        if (existsSync(siblingEnv)) {
            loadEnvFile(siblingEnv);
            return;
        }
    }

    // Try bot name from command line args
    const args = process.argv.slice(2);
    const botName = args.find(arg => !arg.startsWith('-'));

    if (!botName) return;

    const envPath = join(process.cwd(), 'bots', botName, 'bot.env');
    if (!existsSync(envPath)) {
        throw new Error(`Bot "${botName}" not found at ${envPath}`);
    }

    loadEnvFile(envPath);
}

async function getOrCreateConnection(): Promise<BotConnection> {
    // Try to load from command line args first
    loadEnvFromArgs();

    // Read credentials from process.env
    const username = process.env.BOT_USERNAME;
    const password = process.env.PASSWORD;
    const server = process.env.SERVER;

    if (!username) {
        throw new Error('BOT_USERNAME not set. Run with: bun --env-file=bots/{name}/bot.env script.ts\nOr: bun script.ts {botname}');
    }

    if (!password) {
        throw new Error('PASSWORD not set. Run with: bun --env-file=bots/{name}/bot.env script.ts\nOr: bun script.ts {botname}');
    }

    const existing = connections.get(username);
    if (existing && existing.sdk.isConnected()) {
        return existing;
    }

    let gatewayUrl = 'ws://localhost:7780';
    if (server) {
        gatewayUrl = `wss://${server}/gateway`;
    }

    console.error(`[Runner] Connecting to bot "${username}"...`);

    const sdk = new BotSDK({
        botUsername: username,
        password,
        gatewayUrl,
        connectionMode: 'control',
        autoReconnect: false
    });

    const bot = new BotActions(sdk);

    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timed out after 30s')), 30000);
    });

    await Promise.race([sdk.connect(), timeoutPromise]);

    console.error(`[Runner] Connected to bot "${username}"`);

    const connection: BotConnection = { sdk, bot, username };
    connections.set(username, connection);

    return connection;
}

// ============ Core Runner ============

/**
 * Run a script with zero boilerplate.
 *
 * Credentials are loaded automatically:
 * 1. From process.env (via bun --env-file)
 * 2. From bot.env sibling to the script (bun bots/mybot/script.ts)
 * 3. From command line arg (bun script.ts mybot)
 *
 * @example
 * // Just run from the bot directory - auto-finds bot.env:
 * // bun bots/mybot/script.ts
 *
 * import { runScript } from '../../sdk/runner';
 *
 * await runScript(async (ctx) => {
 *   await ctx.bot.chopTree();
 * });
 *
 * @example
 * // With existing connection (MCP context)
 * await runScript(async (ctx) => {
 *   await ctx.bot.chopTree();
 * }, { connection: { bot, sdk } });
 */
export async function runScript(
    script: ScriptFunction,
    options: RunOptions = {}
): Promise<RunResult> {
    const {
        timeout,
        connection,
        autoConnect = true,
        disconnectAfter = false,
        printState = true
    } = options;

    const startTime = Date.now();
    const logs: LogEntry[] = [];

    // Get bot/sdk either from connection or by connecting
    let bot: BotActions;
    let sdk: BotSDK;
    let managedConnection = false;

    if (connection) {
        bot = connection.bot;
        sdk = connection.sdk;
    } else {
        // Use process.env for credentials (loaded by bun --env-file or command line arg)
        try {
            if (autoConnect) {
                const conn = await getOrCreateConnection();
                bot = conn.bot;
                sdk = conn.sdk;
                managedConnection = true;
            } else {
                // Try to load env from args first
                loadEnvFromArgs();
                const username = process.env.BOT_USERNAME;
                if (!username) {
                    throw new Error('BOT_USERNAME not set. Run with: bun --env-file=bots/{name}/bot.env script.ts\nOr: bun script.ts {botname}');
                }
                const existing = connections.get(username);
                if (!existing || !existing.sdk.isConnected()) {
                    throw new Error(`Bot "${username}" is not connected and autoConnect is false`);
                }
                bot = existing.bot;
                sdk = existing.sdk;
                managedConnection = true;
            }
        } catch (error: any) {
            return {
                success: false,
                error,
                duration: Date.now() - startTime,
                logs,
                finalState: null
            };
        }
    }

    // Create captured console functions
    const capturedLog = (...args: any[]) => {
        logs.push({
            timestamp: new Date(),
            level: 'log',
            message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')
        });
    };

    const capturedWarn = (...args: any[]) => {
        logs.push({
            timestamp: new Date(),
            level: 'warn',
            message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')
        });
    };

    const capturedError = (...args: any[]) => {
        logs.push({
            timestamp: new Date(),
            level: 'error',
            message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')
        });
    };

    // Create script context
    const ctx: ScriptContext = {
        bot,
        sdk,
        log: capturedLog,
        warn: capturedWarn,
        error: capturedError
    };

    // Execute script
    let result: any;
    let error: Error | undefined;

    try {
        if (timeout) {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(`Script timeout after ${timeout}ms`)), timeout);
            });
            result = await Promise.race([script(ctx), timeoutPromise]);
        } else {
            result = await script(ctx);
        }
    } catch (e: any) {
        error = e;
    }

    // Get final state
    const finalState = sdk.getState();
    const duration = Date.now() - startTime;

    // Print logs if any
    if (logs.length > 0) {
        console.log('');
        console.log('── Console ──');
        for (const log of logs) {
            const prefix = log.level === 'warn' ? '[warn] ' : log.level === 'error' ? '[error] ' : '';
            console.log(prefix + log.message);
        }
    }

    // Print result if any
    if (result !== undefined && !error) {
        console.log('');
        console.log('── Result ──');
        console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
    }

    // Print error if any
    if (error) {
        console.log('');
        console.log('── Error ──');
        console.log(error.message);
        if (error.stack) {
            console.log(error.stack);
        }
    }

    // Print state if requested
    if (printState && finalState) {
        console.log('');
        console.log('── World State ──');
        console.log(formatWorldState(finalState, sdk.getStateAge()));
    }

    // Disconnect if requested (only for managed connections)
    if (disconnectAfter && managedConnection) {
        const username = process.env.BOT_USERNAME;
        if (username) {
            console.error(`[Runner] Disconnecting bot "${username}"...`);
            await sdk.disconnect();
            connections.delete(username);
        }
    }

    return {
        success: !error,
        result: error ? undefined : result,
        error,
        duration,
        logs,
        finalState
    };
}

/**
 * Disconnect a bot by name
 */
export async function disconnectBot(botName: string): Promise<void> {
    const connection = connections.get(botName);
    if (connection) {
        await connection.sdk.disconnect();
        connections.delete(botName);
    }
}

/**
 * Get list of connected bots (managed by runner)
 */
export function listConnectedBots(): string[] {
    return Array.from(connections.keys()).filter(name => {
        const conn = connections.get(name);
        return conn && conn.sdk.isConnected();
    });
}

# Test Principles

## Speed
- Tests should complete (or fail) as quickly as possible
- Exit immediately when success criteria is met - don't keep running
- Exit immediately when failure is certain - don't waste time
- Minimize sleeps/delays to only what's necessary for game tick sync

## Success Criteria
- Each test has a clear, minimal success criteria (e.g., "gain 1 level in X")
- Check success criteria frequently and exit early when met
- Don't over-test - once the goal is achieved, stop

## Logging
- Log useful information for debugging (start state, key actions, final state)
- Don't spam logs in loops - log every Nth iteration or on state changes
- Always log the final result clearly (PASSED/FAILED)

## Shared Utilities
- Use shared utilities from `test/utils/` folder
- Use `launchBotWithSDK()` from `utils/browser.ts` to handle:
  - Browser launch (with muted audio)
  - Bot login
  - SDK connection
  - Tutorial skip
  - Cleanup
- Don't duplicate boilerplate across tests

## No Cheating
- **NEVER** use Puppeteer's `page.evaluate()` to directly manipulate game state
- **NEVER** reach into the engine or database to complete tasks
- All game actions must go through the SDK
- Tests should prove the bot can accomplish tasks the same way a real agent would

## Structure
```typescript
import { launchBotWithSDK, sleep, type SDKSession } from './utils/browser';

async function runTest(): Promise<boolean> {
    let session: SDKSession | null = null;
    try {
        session = await launchBotWithSDK(process.env.BOT_NAME);
        const { sdk, bot } = session;

        // ... test logic with early exit on success ...

        return success;
    } finally {
        if (session) await session.cleanup();
    }
}

runTest()
    .then(ok => { console.log(ok ? 'PASSED' : 'FAILED'); process.exit(ok ? 0 : 1); })
    .catch(() => process.exit(1));
```

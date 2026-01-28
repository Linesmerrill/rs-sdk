# TODO

## Investigate `bot.navigateDialog` introspectability

The current implementation clicks blindly every 600ms without feedback on what's happening. Consider:

- Return info about what was clicked at each step
- Option to wait for dialog state changes between clicks
- Better handling of `isWaiting` state
- Logging/debug mode that shows dialog flow

Current behavior works but is a black box - hard to debug when dialogs don't complete as expected.



Test with sonnet.






Clean up sdk layers
Refine sdk connection management
Refine a runner-script in claude.md with nice feedback

Repo needs to be a prompt that's all compatible
consider typescript MCP again


save file Download/upload flow! (no guarantees for save file durabilitiy  


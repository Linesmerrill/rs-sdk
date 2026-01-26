# Pathfinding/Navigation Failures in Bot Arcs

## Executive Summary

The bot arcs experience systematic pathfinding and navigation failures that prevent successful completion of banking/selling/upgrade operations. Analysis of 67+ failed runs across Adam_2, Adam_4, and adam_5 reveals three primary failure modes:

1. **"No path found" errors** - Pathfinding algorithm cannot locate viable routes
2. **walkTo timeouts** - Navigation actions exceed 30-second timeout limits
3. **Stuck positions** - Bot reaches dead-ends and cannot progress toward target

---

## Failure Pattern 1: "No Path Found" Loops

**Arc:** Adam_2's cowhide-banking
**File:** `bot_arcs/Adam_2/arcs/cowhide-banking/runs/2026-01-25T16-19-50-Adam_2-collect-and-bank-20-cowhides-for-gp/events.jsonl`

Bot stuck at (3259, 3292) attempting to navigate to Lumbridge Castle bank. Failed waypoints repeated 12+ times each:
- `walkTo(3210, 3217)` - "No path found"
- `walkTo(3206, 3208)` - "No path found"
- `walkTo(3208, 3220)` - "No path found"

**Root Cause:** Bot cannot enter Lumbridge Castle or navigate its interior (stairs issue).

---

## Failure Pattern 2: walkTo Timeout Failures

**Arc:** Adam_2's sell-and-upgrade
**File:** `bot_arcs/Adam_2/arcs/sell-and-upgrade/runs/2026-01-25T19-15-10-Adam_2-sell-hides-buy-adamant-weapon/events.jsonl`

- Attempt: `walkTo(3253, 3290)` - Banking at Varrock West Bank
- Duration: 30+ seconds with no progress
- Outcome: "Action timed out: walkTo"

**File:** `bot_arcs/Adam_2/arcs/sell-and-upgrade/runs/2026-01-25T22-31-05-Adam_2-sell-hides-buy-best-weapon/events.jsonl`

- Page crash detected before walkTo attempt
- Bot disconnected after 30-second timeout

---

## Failure Pattern 3: Stuck at Intermediate Waypoints

**Arc:** Adam_2's sell-and-upgrade
**File:** `bot_arcs/Adam_2/arcs/sell-and-upgrade/runs/2026-01-25T19-20-54-Adam_2-sell-hides-buy-adamant-weapon/events.jsonl`

```
walkTo(3253, 3290) - Success: Arrived at (3253, 3287)
walkTo(3240, 3320) - STUCK: "Stuck at (3247, 3270) - cannot reach (3240, 3320)"
walkTo(3230, 3350) - STUCK: "Stuck at (3235, 3309)" (only 4 tiles moved in 10s)
walkTo(3220, 3380) - Success after 22s
walkTo(3210, 3410) - Success after 15s
```

Bot gets stuck on intermediate waypoints, especially region transitions.

---

## Failure Pattern 4: Browser Crashes During Navigation

**Arc:** Adam_4's sell-and-upgrade
**File:** `bot_arcs/Adam_4/arcs/sell-and-upgrade/runs/2026-01-25T21-55-15-Adam_4-sell-items-buy-better-weapon/events.jsonl`

```
[Browser] Page error: Page crashed!
[Browser] Page closed for bot 'Adam_4'
[Restored state shows bot at (3247, 3286)]
walkTo(3253, 3255) - Action timed out after crash recovery
```

---

## Critical Stuck Positions

Bots consistently get stuck at these coordinates:

| Location | Coordinates | Issue |
|----------|-------------|-------|
| Lumbridge Castle entrance | (3206-3210, 3208-3220) | Cannot navigate stairs/interior |
| Cow field to Lumbridge road | (3240-3250, 3270-3290) | Waypoint (3240, 3320) unreachable |
| Fred's farm area | (3170, 3285) | Fences/buildings block path |
| Varrock West Bank | (3185, 3436) | Navigation fails despite being destination |

---

## Failure Rate Summary

| Arc | Errors | Success | Failure Rate |
|-----|--------|---------|--------------|
| Adam_2 sell-and-upgrade | 62 | 4 | 93% |
| Adam_2 cowhide-banking | 6 | 0 | 100% |
| Adam_4 combat-progression | Multiple | - | High |
| adam_5 quick-bank | Path errors | 1 | Partial |

---

## Root Cause Hypotheses

1. **Incomplete Collision Map** - Pathfinder lacks accurate map of interior areas
2. **Waypoint Coordinate Issues** - Script waypoints may not be walkable tiles
3. **30s Timeout Too Short** - Long paths (50+ tiles) need more time
4. **Gate/Door Handling** - Not opening obstacles before walking through
5. **Multi-Floor Navigation** - Bank locations on different floors cause failures

---

## Key Run Files for Investigation

**"No path found" loop:**
```
bot_arcs/Adam_2/arcs/cowhide-banking/runs/2026-01-25T16-19-50-Adam_2-collect-and-bank-20-cowhides-for-gp/events.jsonl
```

**walkTo timeouts:**
```
bot_arcs/Adam_2/arcs/sell-and-upgrade/runs/2026-01-25T19-15-10-Adam_2-sell-hides-buy-adamant-weapon/events.jsonl
bot_arcs/Adam_2/arcs/sell-and-upgrade/runs/2026-01-25T22-31-05-Adam_2-sell-hides-buy-best-weapon/events.jsonl
```

**Stuck position:**
```
bot_arcs/Adam_2/arcs/sell-and-upgrade/runs/2026-01-25T19-20-54-Adam_2-sell-hides-buy-adamant-weapon/events.jsonl
```

**Browser crash during nav:**
```
bot_arcs/Adam_4/arcs/sell-and-upgrade/runs/2026-01-25T21-55-15-Adam_4-sell-items-buy-better-weapon/events.jsonl
```

---

## Recommended Fixes

1. **Use ground-floor banks only** (Varrock West, Draynor) - avoid stairs
2. **Open gates/doors explicitly** before walking through fenced areas
3. **Increase walkTo timeout** for long-distance paths (60s+)
4. **Add stuck detection** with retry/alternative route logic
5. **Validate waypoints** are on walkable tiles before defining routes

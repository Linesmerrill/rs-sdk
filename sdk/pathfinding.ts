// Local pathfinding using bundled collision data
import * as rsmod from '../vendor/rsmod-pathfinder';
import { CollisionType } from '../vendor/rsmod-pathfinder';
import collisionData from './collision-data.json';

let initialized = false;

// Initialize collision data into rsmod
export function initPathfinding(): void {
    if (initialized) return;

    console.log(`Loading ${collisionData.tiles.length} collision tiles...`);
    const start = Date.now();

    // Track which zones we've allocated
    const allocatedZones = new Set<string>();

    for (const tile of collisionData.tiles) {
        const [level, x, z, flags] = tile as [number, number, number, number];
        // Allocate zone if needed (zones are 8x8)
        const zoneKey = `${level},${x >> 3},${z >> 3}`;
        if (!allocatedZones.has(zoneKey)) {
            rsmod.allocateIfAbsent(x, z, level);
            allocatedZones.add(zoneKey);
        }

        // Set collision flags
        rsmod.__set(x, z, level, flags);
    }

    initialized = true;
    console.log(`Pathfinding initialized in ${Date.now() - start}ms (${allocatedZones.size} zones)`);
}

// Check if a zone has collision data
export function isZoneAllocated(level: number, x: number, z: number): boolean {
    return rsmod.isZoneAllocated(x, z, level);
}

// Find path between two points
export function findPath(
    level: number,
    srcX: number,
    srcZ: number,
    destX: number,
    destZ: number
): Array<{ x: number; z: number; level: number }> {
    if (!initialized) {
        initPathfinding();
    }

    const waypointsRaw = rsmod.findPath(
        level, srcX, srcZ, destX, destZ,
        1, 1, 1, 0, -1, true, 0, 25, CollisionType.NORMAL
    );

    return unpackWaypoints(waypointsRaw);
}

// Find long-distance path (512x512 search grid)
export function findLongPath(
    level: number,
    srcX: number,
    srcZ: number,
    destX: number,
    destZ: number,
    maxWaypoints: number = 500
): Array<{ x: number; z: number; level: number }> {
    if (!initialized) {
        initPathfinding();
    }

    const waypointsRaw = rsmod.findLongPath(
        level, srcX, srcZ, destX, destZ,
        1, 1, 1, 0, -1, true, 0, maxWaypoints, CollisionType.NORMAL
    );

    return unpackWaypoints(waypointsRaw);
}

// Unpack waypoints from rsmod format
function unpackWaypoints(waypointsRaw: Uint32Array): Array<{ x: number; z: number; level: number }> {
    const waypoints: Array<{ x: number; z: number; level: number }> = [];
    for (let i = 0; i < waypointsRaw.length; i++) {
        const packed = waypointsRaw[i]!;
        waypoints.push({
            z: packed & 0x3FFF,
            x: (packed >> 14) & 0x3FFF,
            level: (packed >> 28) & 0x3
        });
    }
    return waypoints;
}

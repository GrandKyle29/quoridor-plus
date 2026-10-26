import type { GameState } from "./state";
import type { Coord, Move, Wall } from "./types";
import { isPlayerGoal } from "./game"; // Add this import at the top

// Helper: Is this coordinate actually on the board?
function isOnBoard(coord: Coord, boardSize: number): boolean {
  return (
    coord.x >= 0 && coord.x < boardSize && coord.y >= 0 && coord.y < boardSize
  );
}

// Helper: Is there a player at this coordinate?
function getPlayerAt(state: GameState, coord: Coord) {
  return state.players.find(
    (p) =>
      !p.eliminated && p.position.x === coord.x && p.position.y === coord.y,
  );
}

//Helper: checks if a coordinate is a winning square for a specific player.
function isGoal(state: GameState, playerId: string, coord: Coord): boolean {
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  return isPlayerGoal(state, playerIndex, coord);
}

function isBlockedByWall(state: GameState, from: Coord, to: Coord): boolean {
  for (const wall of state.walls) {
    const { x, y } = wall.coord;

    if (wall.orientation === "horizontal") {
      // A horizontal wall blocks vertical movement
      if (from.x === to.x && from.x >= x && from.x <= x + 1) {
        const wallY = y + 1;
        if (
          (from.y === wallY && to.y === wallY - 1) ||
          (from.y === wallY - 1 && to.y === wallY)
        ) {
          return true;
        }
      }
    } else {
      // A vertical wall blocks horizontal movement
      if (from.y === to.y && from.y >= y && from.y <= y + 1) {
        const wallX = x + 1;
        if (
          (from.x === wallX && to.x === wallX - 1) ||
          (from.x === wallX - 1 && to.x === wallX)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

//This function takes a player's start position and determines if they can reach their...
//...goal without moving through walls or other players.
function canReachGoal(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId)!;
  const { boardSize } = state.config;

  const queue: Coord[] = [player.position];
  const visited = new Set<string>();
  visited.add(`${player.position.x},${player.position.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;

    // If we reached the goal, we win!
    if (isGoal(state, playerId, current)) {
      return true;
    }

    // Check all 4 directions
    const dirs = [
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    for (const dir of dirs) {
      const next: Coord = { x: current.x + dir.dx, y: current.y + dir.dy };

      // Skip if off board
      if (
        next.x < 0 ||
        next.x >= boardSize ||
        next.y < 0 ||
        next.y >= boardSize
      )
        continue;

      // Skip if already visited
      if (visited.has(`${next.x},${next.y}`)) continue;

      // Skip if blocked by wall
      if (isBlockedByWall(state, current, next)) continue;

      // Skip if another player is there (for pathfinding, we assume players are obstacles)
      // In real Quoridor, you can jump, but for the pathfinding check, if you can't even step around, it's blocked.
      // Actually, for pathfinding, we should treat other players as walls to be safe.
      //if (getPlayerAt(state, next)) continue;

      visited.add(`${next.x},${next.y}`);
      queue.push(next);
    }
  }

  return false; // No path found
}

function isWallPlacementValid(state: GameState, newWall: Wall): boolean {
  const { boardSize } = state.config;
  const { x, y } = newWall.coord;

  // 1. Bounds check
  // Walls take up 2 spaces, so the max anchor is boardSize - 2
  if (x < 0 || x > boardSize - 2 || y < 0 || y > boardSize - 2) {
    return false;
  }

  for (const existing of state.walls) {
    // 2. Exact overlap check
    if (
      existing.coord.x === x &&
      existing.coord.y === y &&
      existing.orientation === newWall.orientation
    ) {
      return false;
    }

    // 3. Crossing check (H crosses V)
    if (
      existing.orientation !== newWall.orientation &&
      existing.coord.x === x &&
      existing.coord.y === y
    ) {
      return false;
    }

    // 4. Partial overlap check
    if (existing.orientation === newWall.orientation) {
      if (newWall.orientation === "horizontal") {
        // If same y, and x coords are within 1 of each other
        if (existing.coord.y === y && Math.abs(existing.coord.x - x) < 2) {
          return false;
        }
      } else {
        // If same x, and y coords are within 1 of each other
        if (existing.coord.x === x && Math.abs(existing.coord.y - y) < 2) {
          return false;
        }
      }
    }
  }

  // 5. Pathfinding check
  if (state.config.mustNotBlockPath) {
    // Temporarily add the wall
    state.walls.push(newWall);

    // Check if *any* player is now trapped
    const isTrapped = state.players.some(
      (p) => !p.eliminated && !canReachGoal(state, p.id),
    );

    // Remove the temporary wall
    state.walls.pop();

    if (isTrapped) return false;
  }

  return true;
}

export function legalMoves(state: GameState): Move[] {
  const moves: Move[] = [];
  const currentPlayer = state.players[state.turnIndex]!;
  const boardSize = state.config.boardSize;
  const { x, y } = currentPlayer.position;

  // The 4 cardinal directions
  const directions = [
    { dx: 0, dy: 1 }, // Up
    { dx: 0, dy: -1 }, // Down
    { dx: 1, dy: 0 }, // Right
    { dx: -1, dy: 0 }, // Left
  ];
  // Pawn movements
  for (const dir of directions) {
    const adjacent: Coord = { x: x + dir.dx, y: y + dir.dy };

    // 1. If it's off the board, skip
    if (!isOnBoard(adjacent, boardSize)) continue;

    // NEW: Check if a wall blocks the path to the adjacent square
    if (isBlockedByWall(state, currentPlayer.position, adjacent)) continue;

    const adjacentPlayer = getPlayerAt(state, adjacent);

    // 2. If it's empty, it's a valid move!
    if (!adjacentPlayer) {
      moves.push({ kind: "move", to: adjacent });
      continue;
    }

    // 3. If there's a player there, we must jump!
    const jumpOver: Coord = { x: x + dir.dx * 2, y: y + dir.dy * 2 };

    // Can we land directly behind them?
    if (
      isOnBoard(jumpOver, boardSize) &&
      !getPlayerAt(state, jumpOver) &&
      !isBlockedByWall(state, adjacent, jumpOver) // NEW: Check wall between opponent and jumpOver
    ) {
      moves.push({ kind: "move", to: jumpOver });
    } else {
      // 4. The square behind is blocked/off-board. Check diagonal jumps.
      if (state.config.allowDiagonalJumps) {
        const diagonalDirs =
          dir.dx === 0
            ? [
                { dx: 1, dy: 0 },
                { dx: -1, dy: 0 },
              ]
            : [
                { dx: 0, dy: 1 },
                { dx: 0, dy: -1 },
              ];

        for (const dDir of diagonalDirs) {
          const diagonal: Coord = {
            x: adjacent.x + dDir.dx,
            y: adjacent.y + dDir.dy,
          };

          // The corner square we step through to go around the opponent
          const corner: Coord = {
            x: x + dDir.dx,
            y: y + dDir.dy,
          };

          if (
            isOnBoard(diagonal, boardSize) &&
            !getPlayerAt(state, diagonal) &&
            // DELETE THIS LINE: !isBlockedByWall(state, currentPlayer.position, corner) &&
            !isBlockedByWall(state, corner, diagonal)
          ) {
            moves.push({ kind: "move", to: diagonal });
          }
        }
      }
    }
  }

  // Wall placements
  if (
    currentPlayer.wallsRemaining > 0 &&
    state.config.wallPool === "per-player"
  ) {
    for (let wx = 0; wx < boardSize - 1; wx++) {
      for (let wy = 0; wy < boardSize - 1; wy++) {
        const coord = { x: wx, y: wy };

        const hWall: Wall = { coord, orientation: "horizontal" };
        const vWall: Wall = { coord, orientation: "vertical" };

        // TODO: Add pathfinding check later!
        if (isWallPlacementValid(state, hWall)) {
          moves.push({ kind: "wall", wall: hWall });
        }
        if (isWallPlacementValid(state, vWall)) {
          moves.push({ kind: "wall", wall: vWall });
        }
      }
    }
  }

  return moves;
}

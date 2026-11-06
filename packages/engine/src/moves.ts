import type { GameState } from "./state";
import type { Coord, Move, Wall } from "./types";
import { isPlayerGoal } from "./game";

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

// Helper: checks if a coordinate is a winning square for a specific player.
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

// BFS from a player's position to their goal (treating other players as passable).
function canReachGoal(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId)!;
  const { boardSize } = state.config;

  const queue: Coord[] = [player.position];
  const visited = new Set<string>();
  visited.add(`${player.position.x},${player.position.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (isGoal(state, playerId, current)) {
      return true;
    }

    const dirs = [
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    for (const dir of dirs) {
      const next: Coord = { x: current.x + dir.dx, y: current.y + dir.dy };

      if (
        next.x < 0 ||
        next.x >= boardSize ||
        next.y < 0 ||
        next.y >= boardSize
      )
        continue;

      if (visited.has(`${next.x},${next.y}`)) continue;
      if (isBlockedByWall(state, current, next)) continue;

      // Note: other players are treated as passable for pathfinding — they can
      // be jumped over in real play, so they don't permanently trap anyone.
      visited.add(`${next.x},${next.y}`);
      queue.push(next);
    }
  }

  return false;
}

function isWallPlacementValid(state: GameState, newWall: Wall): boolean {
  const { boardSize } = state.config;
  const { x, y } = newWall.coord;

  // 1. Bounds check
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
        if (existing.coord.y === y && Math.abs(existing.coord.x - x) < 2) {
          return false;
        }
      } else {
        if (existing.coord.x === x && Math.abs(existing.coord.y - y) < 2) {
          return false;
        }
      }
    }
  }

  // 5. Pathfinding check
  if (state.config.mustNotBlockPath) {
    state.walls.push(newWall);
    const isTrapped = state.players.some(
      (p) => !p.eliminated && !canReachGoal(state, p.id),
    );
    state.walls.pop();
    if (isTrapped) return false;
  }

  return true;
}

// Helper: check diagonals off a given opponent.
function checkDiagonals(
  state: GameState,
  over: Coord,
  dx: number,
  dy: number,
  jumps: Coord[],
  queue: { from: Coord; over: Coord }[],
  visitedHops: Set<string>,
) {
  const diagonalDirs =
    dx === 0
      ? [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
        ]
      : [
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ];

  for (const dDir of diagonalDirs) {
    const diagonal = { x: over.x + dDir.dx, y: over.y + dDir.dy };

    if (
      !isOnBoard(diagonal, state.config.boardSize) ||
      isBlockedByWall(state, over, diagonal)
    )
      continue;

    const hopKey = `${over.x},${over.y},${diagonal.x},${diagonal.y}`;
    if (visitedHops.has(hopKey)) continue;
    visitedHops.add(hopKey);

    if (!getPlayerAt(state, diagonal)) {
      if (!jumps.some((j) => j.x === diagonal.x && j.y === diagonal.y)) {
        jumps.push(diagonal);
      }
    } else {
      queue.push({ from: over, over: diagonal });
    }
  }
}

function getChainJumps(state: GameState, start: Coord): Coord[] {
  const { boardSize } = state.config;
  const jumps: Coord[] = [];
  const visitedHops = new Set<string>();
  const queue: { from: Coord; over: Coord }[] = [];

  const dirs = [
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
  ];

  // Seed with adjacent players
  for (const dir of dirs) {
    const adj = { x: start.x + dir.dx, y: start.y + dir.dy };
    if (getPlayerAt(state, adj) && !isBlockedByWall(state, start, adj)) {
      queue.push({ from: start, over: adj });
      visitedHops.add(`${start.x},${start.y},${adj.x},${adj.y}`);
    }
  }

  while (queue.length > 0) {
    const { from, over } = queue.shift()!;

    const dx = over.x - from.x;
    const dy = over.y - from.y;
    const behind = { x: over.x + dx, y: over.y + dy };

    if (!isOnBoard(behind, boardSize) || isBlockedByWall(state, over, behind)) {
      // Straight jump blocked: only diagonals
      checkDiagonals(state, over, dx, dy, jumps, queue, visitedHops);
    } else {
      // Straight jump possible
      const hopKey = `${over.x},${over.y},${behind.x},${behind.y}`;
      if (!visitedHops.has(hopKey)) {
        visitedHops.add(hopKey);

        if (!getPlayerAt(state, behind)) {
          if (!jumps.some((j) => j.x === behind.x && j.y === behind.y)) {
            jumps.push(behind);
          }
        } else {
          queue.push({ from: over, over: behind });
        }
      }

      // Lenient mode: diagonals are ALSO available even when straight works
      if (state.config.lenientJumps) {
        checkDiagonals(state, over, dx, dy, jumps, queue, visitedHops);
      }
    }
  }

  return jumps;
}

export function legalMoves(state: GameState): Move[] {
  const moves: Move[] = [];
  const currentPlayer = state.players[state.turnIndex]!;
  const boardSize = state.config.boardSize;
  const { x, y } = currentPlayer.position;

  const directions = [
    { dx: 0, dy: 1 }, // Up
    { dx: 0, dy: -1 }, // Down
    { dx: 1, dy: 0 }, // Right
    { dx: -1, dy: 0 }, // Left
  ];

  // --- Pawn movements ---
  for (const dir of directions) {
    const adjacent: Coord = { x: x + dir.dx, y: y + dir.dy };

    // Standard move: adjacent tile must be on board and not wall-blocked
    if (
      !isOnBoard(adjacent, boardSize) ||
      isBlockedByWall(state, currentPlayer.position, adjacent)
    )
      continue;

    const adjacentPlayer = getPlayerAt(state, adjacent);

    // 1. Empty adjacent tile: regular 1-tile move
    if (!adjacentPlayer) {
      moves.push({ kind: "move", to: adjacent });
      continue;
    }

    // 2. Adjacent player: jump logic
    if (state.players.length === 2) {
      // --- 2-player mode ---
      const jumpOver: Coord = { x: x + dir.dx * 2, y: y + dir.dy * 2 };
      const straightIsValid =
        isOnBoard(jumpOver, boardSize) &&
        !getPlayerAt(state, jumpOver) &&
        !isBlockedByWall(state, adjacent, jumpOver);

      if (straightIsValid) {
        moves.push({ kind: "move", to: jumpOver });
      }

      // Diagonals: always available in lenient mode; fallback-only in strict mode
      const shouldCheckDiagonals =
        state.config.allowDiagonalJumps &&
        (state.config.lenientJumps || !straightIsValid);

      if (shouldCheckDiagonals) {
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

          if (
            isOnBoard(diagonal, boardSize) &&
            !getPlayerAt(state, diagonal) &&
            !isBlockedByWall(state, adjacent, diagonal)
          ) {
            moves.push({ kind: "move", to: diagonal });
          }
        }
      }
    }
    // 3+ player chain jumps are handled below (once, from current position)
  }

  // --- Chain jumps (3+ players only) ---
  if (state.players.length > 2) {
    const chainJumps = getChainJumps(state, currentPlayer.position);
    for (const jump of chainJumps) {
      if (
        !moves.some(
          (m) => m.kind === "move" && m.to.x === jump.x && m.to.y === jump.y,
        )
      ) {
        moves.push({ kind: "move", to: jump });
      }
    }
  }

  // --- Wall placements ---
  const hasWallsAvailable =
    state.config.wallPool === "shared"
      ? (state.sharedWallsRemaining ?? 0) > 0
      : currentPlayer.wallsRemaining > 0;

  if (hasWallsAvailable) {
    for (let wx = 0; wx < boardSize - 1; wx++) {
      for (let wy = 0; wy < boardSize - 1; wy++) {
        const coord = { x: wx, y: wy };
        const hWall: Wall = { coord, orientation: "horizontal" };
        const vWall: Wall = { coord, orientation: "vertical" };

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

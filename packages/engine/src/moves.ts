import type { GameState } from "./state";
import type { Coord, Move, Wall } from "./types";

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
      existing.coord.x === x &&
      existing.coord.y === y &&
      existing.orientation !== newWall.orientation
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
  //Pawn movements
  for (const dir of directions) {
    const adjacent: Coord = { x: x + dir.dx, y: y + dir.dy };

    // 1. If it's off the board, skip
    if (!isOnBoard(adjacent, boardSize)) continue;

    const adjacentPlayer = getPlayerAt(state, adjacent);

    // 2. If it's empty, it's a valid move!
    if (!adjacentPlayer) {
      // TODO: Add wall check here later!
      moves.push({ kind: "move", to: adjacent });
      continue;
    }

    // 3. If there's a player there, we must jump!
    const jumpOver: Coord = { x: x + dir.dx * 2, y: y + dir.dy * 2 };

    // Can we land directly behind them?
    if (
      isOnBoard(jumpOver, boardSize) &&
      !getPlayerAt(state, jumpOver) // TODO: Add wall check here later!
    ) {
      moves.push({ kind: "move", to: jumpOver });
    } else {
      // 4. The square behind is blocked/off-board. Check diagonal jumps.
      if (state.config.allowDiagonalJumps) {
        // If we are moving Up/Down, check Left/Right for diagonals
        // If we are moving Left/Right, check Up/Down for diagonals
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
          if (isOnBoard(diagonal, boardSize) && !getPlayerAt(state, diagonal)) {
            // TODO: Add wall check here later!
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

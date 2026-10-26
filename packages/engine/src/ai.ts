import type { GameState } from "./state";
import type { Move, Coord } from "./types";
import { legalMoves } from "./moves";
import { applyMove } from "./game";

// Helper: BFS to find the shortest distance to the goal for a player
function getDistanceToGoal(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId)!;
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  const { boardSize } = state.config;

  const queue: { coord: Coord; dist: number }[] = [
    { coord: player.position, dist: 0 },
  ];
  const visited = new Set<string>();
  visited.add(`${player.position.x},${player.position.y}`);

  while (queue.length > 0) {
    const { coord, dist } = queue.shift()!;

    let isGoal = false;
    if (state.players.length === 2) {
      if (playerIndex === 0 && coord.y === boardSize - 1) isGoal = true;
      if (playerIndex === 1 && coord.y === 0) isGoal = true;
    } else {
      if (playerIndex === 0 && coord.y === boardSize - 1) isGoal = true;
      if (playerIndex === 1 && coord.y === 0) isGoal = true;
      if (playerIndex === 2 && coord.x === boardSize - 1) isGoal = true;
      if (playerIndex === 3 && coord.x === 0) isGoal = true;
    }

    if (isGoal) return dist;

    const dirs = [
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];
    for (const d of dirs) {
      const next = { x: coord.x + d.dx, y: coord.y + d.dy };
      if (
        next.x < 0 ||
        next.x >= boardSize ||
        next.y < 0 ||
        next.y >= boardSize
      )
        continue;
      if (visited.has(`${next.x},${next.y}`)) continue;

      let blocked = false;
      for (const wall of state.walls) {
        const { x, y } = wall.coord;
        if (
          wall.orientation === "horizontal" &&
          next.x === coord.x &&
          next.x >= x &&
          next.x <= x + 1
        ) {
          const wy = y + 1;
          if (
            (coord.y === wy && next.y === wy - 1) ||
            (coord.y === wy - 1 && next.y === wy)
          )
            blocked = true;
        } else if (
          wall.orientation === "vertical" &&
          next.y === coord.y &&
          next.y >= y &&
          next.y <= y + 1
        ) {
          const wx = x + 1;
          if (
            (coord.x === wx && next.x === wx - 1) ||
            (coord.x === wx - 1 && next.x === wx)
          )
            blocked = true;
        }
      }
      if (blocked) continue;

      visited.add(`${next.x},${next.y}`);
      queue.push({ coord: next, dist: dist + 1 });
    }
  }
  return 999;
}

// The main AI function
export function getBestMove(state: GameState): Move {
  const currentPlayer = state.players[state.turnIndex]!;
  const moves = legalMoves(state);
  if (moves.length === 1) return moves[0]!;

  let bestMove = moves[0]!;
  let bestScore = Infinity;

  // 1. How close is the opponent RIGHT NOW?
  let currentMinOppDist = 999;
  for (const p of state.players) {
    if (p.id !== currentPlayer.id) {
      const d = getDistanceToGoal(state, p.id);
      if (d < currentMinOppDist) currentMinOppDist = d;
    }
  }

  for (const move of moves) {
    const nextState = applyMove(state, move);

    if (
      nextState.status === "finished" &&
      nextState.winner === currentPlayer.id
    ) {
      return move;
    }

    const myDist = getDistanceToGoal(nextState, currentPlayer.id);

    let minOppDist = 999;
    let maxOppWalls = 0;
    for (const p of nextState.players) {
      if (p.id !== currentPlayer.id) {
        const d = getDistanceToGoal(nextState, p.id);
        if (d < minOppDist) minOppDist = d;
        if (p.wallsRemaining > maxOppWalls) maxOppWalls = p.wallsRemaining;
      }
    }

    // Base score: difference in distance
    let score = myDist - minOppDist;

    // Evaluate Walls
    if (move.kind === "wall") {
      // If the opponent is about to win, we heavily reward blocking.
      if (currentMinOppDist <= 2) {
        score -= 5; // Big bonus for blocking a threat
      } else {
        // If we are safe, we manage our wall economy.
        score += 2; // Base cost for using a wall

        const myWalls = nextState.players.find(
          (p) => p.id === currentPlayer.id,
        )!.wallsRemaining;
        const wallDiff = maxOppWalls - myWalls;

        // If we have fewer walls than the opponent, add a massive penalty.
        if (wallDiff > 0) {
          score += wallDiff * 4;
        }

        // If we are already winning the race, absolutely do not waste a wall.
        if (myDist < minOppDist) {
          score += 10;
        }
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

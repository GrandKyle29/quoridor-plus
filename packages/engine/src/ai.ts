import type { GameState } from "./state";
import type { Move, Coord } from "./types";
import { legalMoves } from "./moves";
import { applyMove, isPlayerGoal } from "./game"; // Added isPlayerGoal

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

    // Use the engine's goal checker so King of the Hill works automatically
    if (isPlayerGoal(state, playerIndex, coord)) {
      return dist;
    }

    // Check 4 directions
    const dirs = [
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    for (const d of dirs) {
      const next = { x: coord.x + d.dx, y: coord.y + d.dy };

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

      // Inline wall block check
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

  return 999; // Unreachable
}

// The main AI function (Heuristic 1-Ply)
export function getBestMove(state: GameState): Move {
  const currentPlayer = state.players[state.turnIndex]!;
  const moves = legalMoves(state);

  if (moves.length === 1) return moves[0]!;

  let bestMove = moves[0]!;
  let bestScore = Infinity;

  // How close is the closest opponent RIGHT NOW?
  let currentMinOppDist = 999;
  for (const p of state.players) {
    if (p.id !== currentPlayer.id) {
      const d = getDistanceToGoal(state, p.id);
      if (d < currentMinOppDist) currentMinOppDist = d;
    }
  }

  for (const move of moves) {
    const nextState = applyMove(state, move);

    // If this move wins the game, take it immediately!
    if (
      nextState.status === "finished" &&
      nextState.winner === currentPlayer.id
    ) {
      return move;
    }

    const myDist = getDistanceToGoal(nextState, currentPlayer.id);

    let minOppDist = 999;
    let totalOppDist = 0;
    let opponentCount = 0;
    let maxOppWalls = 0;

    for (const p of nextState.players) {
      if (p.id !== currentPlayer.id) {
        const d = getDistanceToGoal(nextState, p.id);
        if (d < minOppDist) minOppDist = d;
        totalOppDist += d;
        opponentCount++;
        if (p.wallsRemaining > maxOppWalls) maxOppWalls = p.wallsRemaining;
      }
    }

    const avgOppDist = opponentCount > 0 ? totalOppDist / opponentCount : 999;

    // Base score: We want myDist to be low, and we want to push opponents away.
    // We weight the CLOSEST opponent heavily (threat), and the AVERAGE opponent slightly.
    let score = myDist - minOppDist * 0.8 - avgOppDist * 0.2;

    // Evaluate Walls
    if (move.kind === "wall") {
      // If an opponent is about to win, heavily reward blocking
      if (currentMinOppDist <= 2) {
        score -= 5;
      } else {
        // If we are safe, manage our wall economy.
        score += 2; // Base cost for placing a wall

        const myWalls = nextState.players.find(
          (p) => p.id === currentPlayer.id,
        )!.wallsRemaining;
        const wallDiff = maxOppWalls - myWalls;

        // Penalty for having fewer walls than the leader
        if (wallDiff > 0) {
          score += wallDiff * 4;
        }

        // If we are already winning the race, do not waste a wall
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

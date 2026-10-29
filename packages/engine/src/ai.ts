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
// --- MINIMAX AI ---

// Helper: Evaluate the board from the current player's perspective
function evaluate(state: GameState, botId: string): number {
  if (state.status === "finished") {
    return state.winner === botId ? 10000 : -10000;
  }

  const botPlayer = state.players.find((p) => p.id === botId)!;
  const botDist = getDistanceToGoal(state, botId);

  // Find the closest opponent
  let minOppDist = 999;
  for (const p of state.players) {
    if (p.id !== botId) {
      const d = getDistanceToGoal(state, p.id);
      if (d < minOppDist) minOppDist = d;
    }
  }

  // A simple heuristic:
  // 1. I want to be close to my goal (lower botDist is better).
  // 2. I want opponents to be far (higher minOppDist is better).
  // 3. I want to have walls if the opponent gets close.
  let score = -botDist + minOppDist * 1.5;

  // Small bonus for having more walls
  score += botPlayer.wallsRemaining * 0.1;

  return score;
}

// Helper: Filter out walls that are far away from all players
function getPrunedMoves(state: GameState): Move[] {
  const allMoves = legalMoves(state);

  // Always keep pawn moves
  const pawnMoves = allMoves.filter((m) => m.kind === "move");

  // Filter walls: Only keep walls within 3 tiles of any player
  const wallMoves = allMoves.filter((m) => {
    if (m.kind !== "wall") return false;

    return state.players.some((p) => {
      const dx = Math.abs(m.wall.coord.x - p.position.x);
      const dy = Math.abs(m.wall.coord.y - p.position.y);
      return dx <= 3 && dy <= 3;
    });
  });

  return [...pawnMoves, ...wallMoves];
}

export function getBestMove(state: GameState): Move {
  const botId = state.players[state.turnIndex]!.id;

  // Generate and order moves to make Alpha-Beta pruning effective
  const moves = getPrunedMoves(state);

  // Sort moves: Pawn moves first, then walls (this drastically speeds up pruning)
  moves.sort((a, b) => {
    if (a.kind === "move" && b.kind === "wall") return -1;
    if (a.kind === "wall" && b.kind === "move") return 1;
    return 0;
  });

  let bestMove = moves[0]!;
  let bestScore = -Infinity;

  const depth = 3; // 3 plies = Bot move -> Opponent move -> Bot move
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of moves) {
    const nextState = applyMove(state, move);
    const score = minimax(nextState, depth - 1, alpha, beta, botId, false);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    alpha = Math.max(alpha, score);
  }

  return bestMove;
}

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  botId: string,
  isMaximizing: boolean,
): number {
  // Base cases
  if (depth === 0 || state.status === "finished") {
    return evaluate(state, botId);
  }
  const moves = getPrunedMoves(state);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const nextState = applyMove(state, move);
      const evalScore = minimax(
        nextState,
        depth - 1,
        alpha,
        beta,
        botId,
        false,
      );
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break; // Prune
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const nextState = applyMove(state, move);
      const evalScore = minimax(nextState, depth - 1, alpha, beta, botId, true);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break; // Prune
    }
    return minEval;
  }
}

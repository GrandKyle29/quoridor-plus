import type { GameState } from "./state";
import type { Move, Coord } from "./types";
import { legalMoves } from "./moves";
import { applyMove, isPlayerGoal } from "./game";

// BFS Distance to goal (kept from before)
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
    if (isPlayerGoal(state, playerIndex, coord)) return dist;

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

// 1. Pruning: Only consider walls near players
function getPrunedMoves(state: GameState): Move[] {
  const allMoves = legalMoves(state);
  const pawnMoves = allMoves.filter((m) => m.kind === "move");

  // Only keep walls within 3 tiles of ANY player
  const wallMoves = allMoves.filter((m) => {
    if (m.kind !== "wall") return false;
    return state.players.some((p) => {
      const dx = Math.abs(m.wall.coord.x - p.position.x);
      const dy = Math.abs(m.wall.coord.y - p.position.y);
      return dx <= 3 && dy <= 3;
    });
  });

  // Sort moves to help alpha-beta pruning find good moves first:
  // 1. Moves closer to the goal first
  // 2. Walls second
  return [...pawnMoves, ...wallMoves].sort((a, b) => {
    if (a.kind === "move" && b.kind === "wall") return -1;
    if (a.kind === "wall" && b.kind === "move") return 1;
    return 0;
  });
}

function evaluate(state: GameState, botId: string): number {
  if (state.status === "finished")
    return state.winner === botId ? 100000 : -100000;

  const botPlayer = state.players.find((p) => p.id === botId)!;
  const botDist = getDistanceToGoal(state, botId);

  let minOppDist = 999;
  for (const p of state.players) {
    if (p.id !== botId) {
      const d = getDistanceToGoal(state, p.id);
      if (d < minOppDist) minOppDist = d;
    }
  }

  // Score:
  // 1. Lower myDist is good (negative)
  // 2. Higher oppDist is good (positive)
  // 3. More walls is good (bonus)
  return -botDist * 1.0 + minOppDist * 1.5 + botPlayer.wallsRemaining * 0.2;
}

export function getBestMove(state: GameState): Move {
  const botId = state.players[state.turnIndex]!.id;
  const startTime = Date.now();
  const TIME_LIMIT = 1500; // Max 1.5 seconds per move

  let bestMove = getPrunedMoves(state)[0]!;

  // Iterative Deepening: Try depth 1, then 2, then 3, then 4...
  // Stop if we run out of time.
  for (let depth = 1; depth <= 4; depth++) {
    let currentBestScore = -Infinity;
    let currentBestMove = bestMove;
    let alpha = -Infinity;
    const beta = Infinity;

    const moves = getPrunedMoves(state);
    let timedOut = false;

    for (const move of moves) {
      if (Date.now() - startTime > TIME_LIMIT) {
        timedOut = true;
        break;
      }

      const nextState = applyMove(state, move);
      const score = minimax(
        nextState,
        depth - 1,
        alpha,
        beta,
        botId,
        false,
        startTime,
        TIME_LIMIT,
      );

      if (score > currentBestScore) {
        currentBestScore = score;
        currentBestMove = move;
      }
      alpha = Math.max(alpha, score);
    }

    bestMove = currentBestMove;

    // If we timed out, stop searching deeper
    if (timedOut) break;
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
  startTime: number,
  timeLimit: number,
): number {
  // Time limit check
  if (Date.now() - startTime > timeLimit) {
    return evaluate(state, botId);
  }

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
        startTime,
        timeLimit,
      );
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const nextState = applyMove(state, move);
      const evalScore = minimax(
        nextState,
        depth - 1,
        alpha,
        beta,
        botId,
        true,
        startTime,
        timeLimit,
      );
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

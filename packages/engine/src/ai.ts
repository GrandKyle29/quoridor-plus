import type { GameState } from "./state";
import type { Move, Coord } from "./types";
import { legalMoves } from "./moves";
import { applyMove, isPlayerGoal } from "./game";

// --- 1. Distance BFS ---
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

// --- 2. Move Pruning ---
function getPrunedMoves(state: GameState): Move[] {
  const allMoves = legalMoves(state);
  const pawnMoves = allMoves.filter((m) => m.kind === "move");

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

// --- 3. Evaluation Cache ---
const evalCache = new Map<string, number>();

// --- 4. Evaluation Function ---
function evaluate(state: GameState, botId: string): number {
  if (state.status === "finished") {
    return state.winner === botId ? 100000 : -100000;
  }

  const wallString = state.walls
    .map((w) => `${w.coord.x},${w.coord.y},${w.orientation}`)
    .sort()
    .join("|");

  const key = `${botId}-${state.players
    .map((p) => `${p.position.x},${p.position.y},${p.wallsRemaining}`)
    .join("|")}-${wallString}`;

  if (evalCache.has(key)) return evalCache.get(key)!;

  const botPlayer = state.players.find((p) => p.id === botId)!;
  const botDist = getDistanceToGoal(state, botId);

  let minOppDist = 999;
  for (const p of state.players) {
    if (p.id !== botId) {
      const d = getDistanceToGoal(state, p.id);
      if (d < minOppDist) minOppDist = d;
    }
  }

  let score = minOppDist * 1.8 - botDist * 1.0;

  if (minOppDist <= 2) score -= 50;

  if (botDist < minOppDist) {
    score += botPlayer.wallsRemaining * 0.5;
  } else {
    score += botPlayer.wallsRemaining * 1.5;
  }

  evalCache.set(key, score);
  return score;
}

// --- 5. Minimax ---
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
  if (Date.now() - startTime > timeLimit) return evaluate(state, botId);
  if (depth === 0 || state.status === "finished") return evaluate(state, botId);

  const moves = getPrunedMoves(state);
  const sortedMoves = moves
    .map((move) => {
      const nextState = applyMove(state, move);
      return { move, quickScore: evaluate(nextState, botId) };
    })
    .sort((a, b) =>
      isMaximizing ? b.quickScore - a.quickScore : a.quickScore - b.quickScore,
    );

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const { move } of sortedMoves) {
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
    for (const { move } of sortedMoves) {
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

// --- 6. Heuristic AI ---
function getHeuristicMove(state: GameState): Move {
  const currentPlayer = state.players[state.turnIndex]!;
  const moves = getPrunedMoves(state);
  if (moves.length === 1) return moves[0]!;

  let bestMove = moves[0]!;
  let bestScore = -Infinity;

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
    )
      return move;

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

    let score = -myDist + minOppDist * 2.0;

    if (minOppDist <= 2) score -= 100;

    if (move.kind === "wall") {
      const myWalls = nextState.players.find(
        (p) => p.id === currentPlayer.id,
      )!.wallsRemaining;
      const wallDiff = myWalls - maxOppWalls;
      if (wallDiff < 0) score += wallDiff * 5;
      if (myDist < minOppDist) score -= 20;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

// --- 7. Unified Entry Point ---
export type AIMode = "heuristic" | "minimax";

export function getBestMove(
  state: GameState,
  timeLimit: number = 1500,
  mode: AIMode = "heuristic",
): Move {
  if (mode === "heuristic") return getHeuristicMove(state);

  // MINIMAX
  const botId = state.players[state.turnIndex]!.id;
  const startTime = Date.now();
  evalCache.clear();

  const moves = getPrunedMoves(state);
  let bestMove = moves[0]!;

  for (let depth = 1; depth <= 5; depth++) {
    let currentBestScore = -Infinity;
    let currentBestMove: Move | null = null;
    let alpha = -Infinity;
    const beta = Infinity;
    let timedOut = false;

    for (const move of moves) {
      if (Date.now() - startTime > timeLimit) {
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
        timeLimit,
      );
      if (score > currentBestScore) {
        currentBestScore = score;
        currentBestMove = move;
      }
      alpha = Math.max(alpha, score);
    }
    if (!timedOut && currentBestMove) bestMove = currentBestMove;
    if (timedOut) break;
  }
  return bestMove;
}

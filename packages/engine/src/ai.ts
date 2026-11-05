import type { GameState } from "./state";
import type { Move, Coord } from "./types";
import { legalMoves } from "./moves";
import { applyMove, isPlayerGoal } from "./game";

// --- 1. Distance BFS ---
export function getDistanceToGoal(state: GameState, playerId: string): number {
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

// --- 2. Evaluation ---
// --- WEIGHTS ---
const botDistWeight = 1; // How much each tile away is worth (bot)
const minOppDistWeight = 1.5; // How much each tile away is worth (opponent)
const wallBonusWeight = 0.1; // How much each wall the bot owns is worth
const topThreatWeight = 0.3; // How much the bot reacts to the max threat
const sharedWallBonusWeight = 0.0; // How many points Each wall left in the shared pool is worth
const sharedSpentWeight = 0.1; // How many points Each wall placed by the bot is worth
const topClearLaneWeight = 0.5; // How much open lanes amplify a threat
// ----------------
//helper: How far is each player from closest horizontal wall above?
function getClearLaneDistance(state: GameState, playerId: string): number {
  const { boardSize } = state.config;
  const player = state.players.find((p) => p.id === playerId)!;
  const { x, y } = player.position;

  let nearestWallY = boardSize;
  for (const wall of state.walls) {
    if (wall.orientation !== "horizontal") continue;
    const wx = wall.coord.x;
    const wy = wall.coord.y;
    if (x !== wx && x !== wx + 1) continue;
    if (wy >= y && wy < nearestWallY) {
      nearestWallY = wy;
    }
  }

  return nearestWallY - y;
}
//the actual evaluation function.
function evaluate(state: GameState, botId: string): number {
  if (state.status === "finished") {
    return state.winner === botId ? 10000 : -10000;
  }

  const botPlayer = state.players.find((p) => p.id === botId)!;
  const botDist = getDistanceToGoal(state, botId);

  let minOppDist = 999;
  for (const p of state.players) {
    if (p.id !== botId) {
      const d = getDistanceToGoal(state, p.id);
      if (d < minOppDist) minOppDist = d;
    }
  }

  let score = -botDist * botDistWeight + minOppDist * minOppDistWeight;

  if (state.config.wallPool === "shared") {
    const sharedRemaining = state.sharedWallsRemaining ?? 0;
    score += sharedRemaining * sharedWallBonusWeight;
    score += state.walls.length * sharedSpentWeight;
  } else {
    score += botPlayer.wallsRemaining * wallBonusWeight;
  }

  if (state.config.goalCondition === "top" && state.players.length > 2) {
    let maxThreat = 0;
    for (const p of state.players) {
      if (p.id === botId) continue;
      const oppDist = getDistanceToGoal(state, p.id);
      const clearLane = getClearLaneDistance(state, p.id);
      const threat =
        (state.config.boardSize - oppDist) * clearLane * topClearLaneWeight;
      if (threat > maxThreat) maxThreat = threat;
    }
    score -= topThreatWeight * maxThreat;
  }
  // DEBUG: only log every ~10 evals to avoid console spam
  /*if (Math.random() < 0.01) {
    console.log("🤖 eval", {
      bot: botId,
      finalScore: score,
      botDist,
      minOppDist,
      baseScore: -botDist * botDistWeight + minOppDist * minOppDistWeight,
      wallBonus: wallBonusWeight,
      topThreatWeight,
    });
  }*/
  return score;
}

// --- 3. Move Pruning ---
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

// --- 4. The Minimax function with timer ---
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
  // Time check
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

// --- 5. Main Entry Point ---
// --- Delta heuristic for move ordering ---
// For a wall placement, computes:
//   wallScore = 1.5 * (ΔOppDist) - 1.0 * (ΔMyDist)
// where Δ is (distance after) - (distance before).
// For pawn moves, returns the raw distance delta (simple).
function evaluateMoveDelta(
  state: GameState,
  move: Move,
  botId: string,
): number {
  //const currentTurnPlayer = state.players[state.turnIndex]!;
  const botDistBefore = getDistanceToGoal(state, botId);

  let minOppDistBefore = 999;
  for (const p of state.players) {
    if (p.id !== botId) {
      const d = getDistanceToGoal(state, p.id);
      if (d < minOppDistBefore) minOppDistBefore = d;
    }
  }

  // Simulate the move
  const nextState = applyMove(state, move);
  const botDistAfter = getDistanceToGoal(nextState, botId);

  let minOppDistAfter = 999;
  for (const p of nextState.players) {
    if (p.id !== botId) {
      const d = getDistanceToGoal(nextState, p.id);
      if (d < minOppDistAfter) minOppDistAfter = d;
    }
  }

  const deltaOpp = minOppDistAfter - minOppDistBefore;
  const deltaMy = botDistAfter - botDistBefore;

  if (move.kind === "wall") {
    return 1.5 * deltaOpp - 1.0 * deltaMy;
  }
  // Pawn move: just reward reducing my own distance
  return -deltaMy;
}

// --- Modified getBestMove to use delta for move ordering ---
export function getBestMove(state: GameState, timeLimit: number = 1500): Move {
  const botId = state.players[state.turnIndex]!.id;
  const startTime = Date.now();

  const moves = getPrunedMoves(state);

  // Use the delta heuristic to sort moves (best first for Alpha-Beta pruning)
  const scoredMoves = moves.map((move) => ({
    move,
    deltaScore: evaluateMoveDelta(state, move, botId),
  }));
  scoredMoves.sort((a, b) => b.deltaScore - a.deltaScore);

  let bestMove = scoredMoves[0]!.move;

  for (let depth = 1; depth <= 6; depth++) {
    let currentBestMove = bestMove;
    let currentBestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    let timedOut = false;

    for (const { move } of scoredMoves) {
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

    if (!timedOut) {
      bestMove = currentBestMove;
    }
    if (timedOut) break;
  }

  return bestMove;
}

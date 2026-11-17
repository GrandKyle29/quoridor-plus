import type { GameState } from "./state";
import type { Move, Coord } from "./types";
import { legalMoves } from "./moves";
import { applyMove, isPlayerGoal } from "./game";

// --- 1. Distance BFS ---
export function getDistanceToGoal(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.eliminated) return 999; // no pawn on the board
  if (player.finished) return 0; // <-- NEW
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
const botDistWeight = 1;
const minOppDistWeight = 1.5;
const wallBonusWeight = 0.1;
const topThreatWeight = 0.3;
const sharedWallBonusWeight = 0.0;
const sharedSpentWeight = 0.1;
const topClearLaneWeight = 0.5;

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
    if (wy >= y && wy < nearestWallY) nearestWallY = wy;
  }
  return nearestWallY - y;
}

// FAST trap check: Doesn't use legalMoves.
// Just checks if the player can win via a normal move OR a chain jump in this exact state.
function canOpponentWinFast(state: GameState, playerId: string): boolean {
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) return false;

  const p = state.players[playerIndex]!;
  if (p.finished || p.eliminated) return false;
  const { boardSize, goalCondition } = state.config;
  const { x, y } = p.position;

  const isGoal = (cx: number, cy: number) => {
    if (goalCondition === "center") {
      const mid = Math.floor(boardSize / 2);
      return cx === mid && cy === mid;
    }
    if (goalCondition === "top") return cy === boardSize - 1;
    const edge = (p.startIndex ?? playerIndex) % 4;
    if (edge === 0) return cy === boardSize - 1;
    if (edge === 1) return cy === 0;
    if (edge === 2) return cx === boardSize - 1;
    if (edge === 3) return cx === 0;
    return false;
  };

  const dirs = [
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
  ];

  for (const dir of dirs) {
    let cx = x,
      cy = y,
      jumped = false;
    while (true) {
      cx += dir.dx;
      cy += dir.dy;
      if (cx < 0 || cx >= boardSize || cy < 0 || cy >= boardSize) break;

      // Check for wall between previous and current
      let blocked = false;
      const prevX = cx - dir.dx;
      const prevY = cy - dir.dy;
      for (const wall of state.walls) {
        const { x: wx, y: wy } = wall.coord;
        if (
          wall.orientation === "horizontal" &&
          cx === prevX &&
          cx >= wx &&
          cx <= wx + 1
        ) {
          const wallY = wy + 1;
          if (
            (prevY === wallY && cy === wallY - 1) ||
            (prevY === wallY - 1 && cy === wallY)
          )
            blocked = true;
        } else if (
          wall.orientation === "vertical" &&
          cy === prevY &&
          cy >= wy &&
          cy <= wy + 1
        ) {
          const wallX = wx + 1;
          if (
            (prevX === wallX && cx === wallX - 1) ||
            (prevX === wallX - 1 && cx === wallX)
          )
            blocked = true;
        }
      }
      if (blocked) break;

      const occupant = state.players.find(
        (op) =>
          op.id !== playerId && op.position.x === cx && op.position.y === cy,
      );
      if (occupant) {
        jumped = true;
      } else if (jumped) {
        if (isGoal(cx, cy)) return true;
        break;
      } else {
        if (isGoal(cx, cy)) return true;
        break;
      }
    }
  }
  return false;
}

function canCurrentPlayerWinFast(state: GameState): boolean {
  const currentPlayer = state.players[state.turnIndex];
  if (!currentPlayer) return false;
  return canOpponentWinFast(state, currentPlayer.id);
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
    if (p.id !== botId && !p.finished && !p.eliminated) {
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
      if (p.id === botId || p.finished || p.eliminated) continue;
      const oppDist = getDistanceToGoal(state, p.id);
      const clearLane = getClearLaneDistance(state, p.id);
      const threat =
        (state.config.boardSize - oppDist) * clearLane * topClearLaneWeight;
      if (threat > maxThreat) maxThreat = threat;
    }
    score -= topThreatWeight * maxThreat;
  }

  // FAST Panic: Only panic if the player acting *now* is 1 move away.
  // We use getDistanceToGoal instead of the slow legalMoves.
  const currentOpp = state.players[state.turnIndex];
  if (
    currentOpp &&
    currentOpp.id !== botId &&
    !currentOpp.finished &&
    !currentOpp.eliminated
  ) {
    if (getDistanceToGoal(state, currentOpp.id) <= 1) {
      score -= 500;
    }
  }

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

// --- 4. Minimax ---
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

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const nextState = applyMove(state, move, true);
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
      const nextState = applyMove(state, move, true);
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
function evaluateMoveDelta(
  state: GameState,
  move: Move,
  botId: string,
): number {
  const botDistBefore = getDistanceToGoal(state, botId);
  let minOppDistBefore = 999;
  for (const p of state.players) {
    if (p.id !== botId && !p.finished && !p.eliminated) {
      const d = getDistanceToGoal(state, p.id);
      if (d < minOppDistBefore) minOppDistBefore = d;
    }
  }

  const nextState = applyMove(state, move, true);
  const botDistAfter = getDistanceToGoal(nextState, botId);
  let minOppDistAfter = 999;
  for (const p of nextState.players) {
    if (p.id !== botId && !p.finished && !p.eliminated) {
      const d = getDistanceToGoal(nextState, p.id);
      if (d < minOppDistAfter) minOppDistAfter = d;
    }
  }

  const deltaOpp = minOppDistAfter - minOppDistBefore;
  const deltaMy = botDistAfter - botDistBefore;

  if (move.kind === "wall") return 1.5 * deltaOpp - 1.0 * deltaMy;
  return -deltaMy;
}

export function getBestMove(state: GameState, timeLimit: number = 1500): Move {
  const botId = state.players[state.turnIndex]!.id;
  const startTime = Date.now();
  const moves = getPrunedMoves(state);

  // 1. INSTANT WIN CHECK
  for (const move of moves) {
    if (move.kind === "move") {
      const nextState = applyMove(state, move, true);
      if (nextState.status === "finished" && nextState.winner === botId)
        return move;
    }
  }

  // 2. THREAT SCAN (Only run slow checks if someone is actually 1 move away)
  const nextPlayerIndex = (state.turnIndex + 1) % state.players.length;
  const nextPlayer = state.players[nextPlayerIndex];
  let threatExists = false;
  let nextPlayerThreat = false;

  for (const p of state.players) {
    if (p.id !== botId && !p.finished && !p.eliminated) {
      if (getDistanceToGoal(state, p.id) <= 2) threatExists = true;
      if (p.id === nextPlayer?.id && getDistanceToGoal(state, p.id) <= 2)
        nextPlayerThreat = true;
    }
  }

  // 3. INSTANT BLOCK CHECK (Only if the next player is a threat)
  if (nextPlayerThreat) {
    const blockingMoves = moves.filter((move) => {
      const nextState = applyMove(state, move, true);
      return !canOpponentWinFast(nextState, nextPlayer!.id);
    });
    if (blockingMoves.length > 0) {
      const scoredBlocks = blockingMoves.map((move) => ({
        move,
        deltaScore: evaluateMoveDelta(state, move, botId),
      }));
      scoredBlocks.sort((a, b) => b.deltaScore - a.deltaScore);
      return scoredBlocks[0]!.move;
    }
  }

  // 4. MINIMAX
  const scoredMoves = moves.map((move) => ({
    move,
    deltaScore: evaluateMoveDelta(state, move, botId),
  }));
  scoredMoves.sort((a, b) => b.deltaScore - a.deltaScore);

  let topMoves = scoredMoves;

  // Only apply the safe-move filter if someone is close to winning.
  if (threatExists) {
    topMoves = scoredMoves.slice(0, 15).filter(({ move }) => {
      const nextState = applyMove(state, move, true);
      return !canCurrentPlayerWinFast(nextState);
    });
    if (topMoves.length === 0) topMoves = scoredMoves.slice(0, 15);
  }

  let bestMove = topMoves[0]!.move;

  for (let depth = 1; depth <= 6; depth++) {
    let currentBestMove = bestMove;
    let currentBestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    let timedOut = false;

    for (const { move } of topMoves) {
      if (Date.now() - startTime > timeLimit) {
        timedOut = true;
        break;
      }

      const nextState = applyMove(state, move, true);
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

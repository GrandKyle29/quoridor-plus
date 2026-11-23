import type { GameState } from "./state";
import type { Move, Coord, Player } from "./types";
import { legalMoves } from "./moves";
import { applyMove, isPlayerGoal } from "./game";

// Is there a placed wall on the edge between two neighbouring tiles?
function isWallBetween(state: GameState, from: Coord, to: Coord): boolean {
  for (const wall of state.walls) {
    const { x, y } = wall.coord;
    if (wall.orientation === "horizontal") {
      // A horizontal wall blocks vertical steps.
      if (from.x !== to.x || from.x < x || from.x > x + 1) continue;
      const wallY = y + 1;
      if (
        (from.y === wallY && to.y === wallY - 1) ||
        (from.y === wallY - 1 && to.y === wallY)
      )
        return true;
    } else {
      // A vertical wall blocks horizontal steps.
      if (from.y !== to.y || from.y < y || from.y > y + 1) continue;
      const wallX = x + 1;
      if (
        (from.x === wallX && to.x === wallX - 1) ||
        (from.x === wallX - 1 && to.x === wallX)
      )
        return true;
    }
  }
  return false;
}

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

      if (isWallBetween(state, coord, next)) continue;

      visited.add(`${next.x},${next.y}`);
      queue.push({ coord: next, dist: dist + 1 });
    }
  }
  return 999;
}

// --- 1b. Team awareness ---
// Two different players who share a team. In free-for-all this is always false.
function isAlly(state: GameState, a: string, b: string): boolean {
  const teams = state.config.teams;
  if (!teams) return false;
  const team = teams[a];
  return !!team && team === teams[b];
}

function isAllMustFinish(state: GameState): boolean {
  return (
    !!state.config.teams && (state.config.teamWinCondition ?? "all") === "all"
  );
}

// The distance at which this player's side actually wins. In a first-to-finish
// race a single pawn crossing the line ends it, so that pawn's own distance is
// the answer. When every member has to finish the game only ends once the
// slowest pawn arrives, so an enemy sitting on the line is not a threat while
// its teammate still has the board to cross: that side's clock is the laggard's
// distance, not the leader's.
function getWinClock(state: GameState, playerId: string): number {
  if (!isAllMustFinish(state)) return getDistanceToGoal(state, playerId);

  const teams = state.config.teams!;
  const team = teams[playerId];
  let clock = getDistanceToGoal(state, playerId);
  if (!team) return clock;

  for (const p of state.players) {
    if (p.eliminated || teams[p.id] !== team) continue;
    const d = getDistanceToGoal(state, p.id);
    if (d > clock) clock = d;
  }
  return clock;
}

// Did this finished game go to the bot (or its team)?
function isWinFor(state: GameState, botId: string): boolean {
  if (!state.winner) return false;
  return state.winner === botId || isAlly(state, botId, state.winner);
}

// Progress towards the goal as the bot should think about it: in team games a
// teammate getting home matters too, in free-for-all only the bot does.
function getProgressDistance(state: GameState, botId: string): number {
  const teams = state.config.teams;
  const team = teams?.[botId];
  if (!teams || !team) return getDistanceToGoal(state, botId);

  const mates = state.players.filter(
    (p) => !p.eliminated && !p.finished && teams[p.id] === team,
  );
  if (mates.length === 0) return getDistanceToGoal(state, botId);

  if (!isAllMustFinish(state)) {
    // First to finish: the team's best runner is what wins, but the bot still
    // has to make progress itself or it would idle behind a winning teammate.
    const best = Math.min(...mates.map((p) => getDistanceToGoal(state, p.id)));
    return 0.5 * getDistanceToGoal(state, botId) + 0.5 * best;
  }

  // All must finish: every team member's distance counts the same as the bot's,
  // so add them up instead of averaging them. Two reasons for the total:
  //  - an average split each step into 1/teamSize, so every move looked almost
  //    equal and the tie-break randomness took over; and
  //  - an average over the members still on the board made *arriving* worse: the
  //    bot's own small distance dropped out of the mean, which is why a team
  //    with someone one step from home would stop moving towards the goal.
  // A finished member simply contributes 0 and stays in the sum.
  let total = 0;
  for (const p of state.players) {
    if (p.eliminated || teams[p.id] !== team) continue;
    total += getDistanceToGoal(state, p.id);
  }
  return total;
}

// Threat pressure: the closest enemy dominates, but the progress of everyone
// else still counts a little. Without the pack term, blocking any opponent who
// is not currently the leader changes nothing, so such walls look free and get
// played at random — very visible in big free-for-all games.
const PACK_WEIGHT = 0.3;

function getEnemyPressure(state: GameState, botId: string): number {
  const dists: number[] = [];
  for (const p of state.players) {
    if (p.id === botId || p.finished || p.eliminated) continue;
    if (isAlly(state, botId, p.id)) continue;
    dists.push(getDistanceToGoal(state, p.id));
  }
  if (dists.length === 0) return 999;

  // All must finish: the enemy team's clock is its slowest pawn, so a wall on
  // their leader buys nothing while their laggard is still far out - the game
  // does not end when the fast pawn arrives. Anchor the threat on the slowest
  // pawn of each team (the side whose laggard is closest to home is the one
  // actually about to win) and keep the small pack term so walls that delay a
  // non-laggard still count for something instead of looking free.
  if (isAllMustFinish(state)) {
    const teams = state.config.teams!;
    const clocks = new Map<string, number>();
    for (const p of state.players) {
      if (p.id === botId || p.finished || p.eliminated) continue;
      if (isAlly(state, botId, p.id)) continue;
      const team = teams[p.id] ?? p.id;
      const d = getDistanceToGoal(state, p.id);
      clocks.set(team, Math.max(clocks.get(team) ?? 0, d));
    }
    if (clocks.size === 0) return 999;

    const clock = Math.min(...clocks.values());
    const average = dists.reduce((a, b) => a + b, 0) / dists.length;
    return clock + PACK_WEIGHT * Math.max(0, average - clock);
  }

  const closest = Math.min(...dists);
  const average = dists.reduce((a, b) => a + b, 0) / dists.length;
  return closest + PACK_WEIGHT * (average - closest);
}

// The enemy side's clock: the distance its slowest member still has to cross,
// i.e. the number of turns before anyone else can win. In free-for-all games
// that is just the closest enemy, so the two modes share this helper.
function getEnemyClock(state: GameState, botId: string): number {
  let clock = Infinity;
  for (const p of state.players) {
    if (p.id === botId || p.finished || p.eliminated) continue;
    if (isAlly(state, botId, p.id)) continue;
    const d = getWinClock(state, p.id);
    if (d < clock) clock = d;
  }
  return clock;
}

// In an all-must-finish game the enemy clock is its slowest pawn, and while that
// pawn still has most of the board to cross a wall that costs it a turn or two
// changes nothing about who arrives first. Anchoring threat on the laggard made
// many more walls look profitable than the old leader anchor did, so the bots
// started spending walls from the first move. Price them: a wall has to buy at
// least this many turns of enemy clock to beat a pawn move, and the bar relaxes
// as their laggard reaches home, where a single turn is the whole race.
const TEAM_WALL_BAR_FAR = 2;
const TEAM_WALL_BAR_NEAR = 0.25;

function getTeamWallBar(state: GameState, botId: string): number {
  const clock = getEnemyClock(state, botId);
  if (!Number.isFinite(clock)) return 0;
  const { boardSize } = state.config;
  const closeness = Math.min(
    1,
    Math.max(0, (boardSize - clock) / Math.max(1, boardSize - 1)),
  );
  return (
    TEAM_WALL_BAR_FAR + (TEAM_WALL_BAR_NEAR - TEAM_WALL_BAR_FAR) * closeness
  );
}

// How many walls this bot may still place under the game's pool rule.
function getWallsLeft(state: GameState, playerId: string): number {
  if (state.config.wallPool === "shared")
    return state.sharedWallsRemaining ?? 0;
  if (state.config.wallPool === "team") {
    const team = state.config.teams?.[playerId];
    return team ? (state.sharedWallsPerTeam?.[team] ?? 0) : 0;
  }
  return state.players.find((p) => p.id === playerId)?.wallsRemaining ?? 0;
}

// All-must-finish teams: a pawn that crosses the line stops taking turns, and
// every turn it keeps is another chance to place a wall. In a 4v4 where one
// side's laggard is still crossing, the side whose pawns wait on the line has
// several wall-layers defending while the other side has one, so a pawn on the
// doorstep is worth more to its team standing there than finished. Waiting only
// pays while the team's slowest pawn still has ground to cover - otherwise it
// just delays the win - and while a wall is left to place, so a team that is
// ready to close the game walks in.
const HOLD_DOORSTEP_GAP = 3;

function shouldHoldDoorstep(state: GameState, botId: string): boolean {
  if (!isAllMustFinish(state)) return false;
  if (getWallsLeft(state, botId) <= 0) return false;
  const own = getDistanceToGoal(state, botId);
  return getWinClock(state, botId) - own >= HOLD_DOORSTEP_GAP;
}

// Mirrors the engine's turn rotation (skips finished and eliminated players).
function getNextActivePlayer(state: GameState): Player | undefined {
  const count = state.players.length;
  for (let i = 1; i <= count; i++) {
    const p = state.players[(state.turnIndex + i) % count];
    if (p && !p.finished && !p.eliminated) return p;
  }
  return undefined;
}

// --- 2. Evaluation ---
const botDistWeight = 1;
const minOppDistWeight = 1.5;
const wallBonusWeight = 0.1;
const sharedWallBonusWeight = 0.0;
const sharedSpentWeight = 0.1;
const topClearLaneWeight = 0.5;
const topThreatWeight = 0.3;

export type BotWeights = {
  enemyDistWeight: number;
  wallBonusWeight: number;
  topThreatWeight: number;
  tieEpsilon: number;
};

const DEFAULT_WEIGHTS: BotWeights = {
  enemyDistWeight: minOppDistWeight,
  wallBonusWeight: wallBonusWeight,
  topThreatWeight: topThreatWeight,
  tieEpsilon: 0.75,
};

function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each bot gets a stable personality for a whole game, but a different one from
// game to game: the seed comes from the game's creation time plus its player id.
// Within a game the bot's numbers never change, so it cannot oscillate.
function buildBotWeights(
  state: GameState,
  botId: string,
  seed?: number,
): BotWeights {
  const source = seed ?? hashString(`${state.createdAt ?? "no-date"}:${botId}`);
  const rng = mulberry32(source);
  const jitter = (center: number, spread: number) =>
    center * (1 + (rng() * 2 - 1) * spread);

  // Openings are the place where several moves really are equal, so widen the
  // tie-break window for each bot's first couple of moves.
  const moveNumber = state.moveCount ?? state.moveLog.length;
  const opening = moveNumber < 2 * state.players.length;

  return {
    enemyDistWeight: jitter(minOppDistWeight, 0.1),
    wallBonusWeight: jitter(wallBonusWeight, 0.25),
    topThreatWeight: jitter(topThreatWeight, 0.2),
    tieEpsilon: opening ? 1 : 0.35,
  };
}

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

      // Eliminated and finished pawns are not on the board, so they can't be
      // jumped over either.
      const occupant = state.players.find(
        (op) =>
          op.id !== playerId &&
          !op.eliminated &&
          !op.finished &&
          op.position.x === cx &&
          op.position.y === cy,
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
export function evaluate(
  state: GameState,
  botId: string,
  weights: BotWeights = DEFAULT_WEIGHTS,
): number {
  if (state.status === "finished") {
    // A teammate winning is a win for this bot too.
    return isWinFor(state, botId) ? 10000 : -10000;
  }

  const botPlayer = state.players.find((p) => p.id === botId)!;
  const botDist = getProgressDistance(state, botId);
  const enemyPressure = getEnemyPressure(state, botId);

  let score =
    -botDist * botDistWeight + enemyPressure * weights.enemyDistWeight;

  if (state.config.wallPool === "shared") {
    const sharedRemaining = state.sharedWallsRemaining ?? 0;
    score += sharedRemaining * sharedWallBonusWeight;
    score += state.walls.length * sharedSpentWeight;
  } else if (state.config.wallPool === "team") {
    // A team pool is one resource for the whole side. This branch used to add
    // the per-player count, which never changes in team mode, so every wall
    // looked free and the bots emptied the pool on principle.
    const team = state.config.teams?.[botId];
    const remaining = team ? (state.sharedWallsPerTeam?.[team] ?? 0) : 0;
    score += remaining * weights.wallBonusWeight;
  } else {
    score += botPlayer.wallsRemaining * weights.wallBonusWeight;
  }

  if (state.config.goalCondition === "top" && state.players.length > 2) {
    let maxThreat = 0;
    for (const p of state.players) {
      if (p.id === botId || p.finished || p.eliminated) continue;
      if (isAlly(state, botId, p.id)) continue;
      const oppDist = getDistanceToGoal(state, p.id);
      const clearLane = getClearLaneDistance(state, p.id);
      const threat =
        (state.config.boardSize - oppDist) * clearLane * topClearLaneWeight;
      if (threat > maxThreat) maxThreat = threat;
    }
    score -= weights.topThreatWeight * maxThreat;
  }

  // FAST Panic: Only panic if an *enemy* is 1 move away and about to act.
  const currentOpp = state.players[state.turnIndex];
  if (
    currentOpp &&
    currentOpp.id !== botId &&
    !currentOpp.finished &&
    !currentOpp.eliminated &&
    !isAlly(state, botId, currentOpp.id)
  ) {
    if (
      getDistanceToGoal(state, currentOpp.id) <= 1 &&
      getWinClock(state, currentOpp.id) <= 1
    ) {
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
      if (p.eliminated) return false;
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
  weights: BotWeights,
): number {
  if (Date.now() - startTime > timeLimit)
    return evaluate(state, botId, weights);
  if (depth === 0 || state.status === "finished")
    return evaluate(state, botId, weights);

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
        weights,
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
        weights,
      );
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// --- 5. Main Entry Point ---
export function evaluateMoveDelta(
  state: GameState,
  move: Move,
  botId: string,
  weights: BotWeights = DEFAULT_WEIGHTS,
): number {
  const botDistBefore = getProgressDistance(state, botId);
  const pressureBefore = getEnemyPressure(state, botId);

  const nextState = applyMove(state, move, true);
  const botDistAfter = getProgressDistance(nextState, botId);
  const pressureAfter = getEnemyPressure(nextState, botId);

  const deltaOpp = pressureAfter - pressureBefore;
  const deltaMy = botDistAfter - botDistBefore;

  if (move.kind === "wall")
    return weights.enemyDistWeight * deltaOpp - botDistWeight * deltaMy;
  return -botDistWeight * deltaMy;
}

// Shortest walk from a tile with the other pawns treated as solid.
// getDistanceToGoal lets a shortest path run straight through an occupied tile,
// so a lane blocked by a pawn reads as "no progress in any direction" and the
// pawn can only shuffle sideways on it. As a tie-break this separates the tile
// that really is closer from the one that only looks closer from here.
function getWalkDistance(
  state: GameState,
  playerId: string,
  start: Coord,
): number {
  const { boardSize } = state.config;
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) return 999;

  const occupied = new Set(
    state.players
      .filter((p) => p.id !== playerId && !p.eliminated && !p.finished)
      .map((p) => `${p.position.x},${p.position.y}`),
  );
  const queue: { coord: Coord; dist: number }[] = [{ coord: start, dist: 0 }];
  const visited = new Set<string>([`${start.x},${start.y}`]);

  while (queue.length > 0) {
    const { coord, dist } = queue.shift()!;
    if (isPlayerGoal(state, playerIndex, coord)) return dist;

    for (const d of [
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ]) {
      const next = { x: coord.x + d.dx, y: coord.y + d.dy };
      if (
        next.x < 0 ||
        next.x >= boardSize ||
        next.y < 0 ||
        next.y >= boardSize
      )
        continue;
      const key = `${next.x},${next.y}`;
      if (visited.has(key) || occupied.has(key)) continue;
      if (isWallBetween(state, coord, next)) continue;
      visited.add(key);
      queue.push({ coord: next, dist: dist + 1 });
    }
  }
  return 999;
}

// Where this pawn's goal lies, as one step along the crossing axis.
function getGoalAim(state: GameState, playerId: string): Coord {
  const { boardSize, goalCondition } = state.config;
  const player = state.players.find((p) => p.id === playerId)!;
  if (goalCondition === "center") {
    const mid = Math.floor(boardSize / 2);
    return {
      x: Math.sign(mid - player.position.x),
      y: Math.sign(mid - player.position.y),
    };
  }
  if (goalCondition === "top") return { x: 0, y: 1 };

  const index = state.players.findIndex((p) => p.id === playerId);
  const edge = (player.startIndex ?? index) % 4;
  if (edge === 0) return { x: 0, y: 1 };
  if (edge === 1) return { x: 0, y: -1 };
  if (edge === 2) return { x: 1, y: 0 };
  return { x: -1, y: 0 };
}

// Tie-break for pawn moves the search rates equally.
// Settling those with a dice roll is what makes a bot pace between two tiles:
// two routes of the same length, or a lane another pawn is standing in, leave
// nothing to choose between them, so on every turn the coin can send it back
// where it came from. Score the destination instead - the walk from it (pawns
// solid), then how far it advances towards the goal edge, then a fixed tile
// order - so a move back onto the tile it just left never outranks carrying on.
// Bots keep some individuality by preferring opposite tile orders.
function getMoveTieScore(
  state: GameState,
  botId: string,
  move: Move,
  tileSign: number,
): number {
  if (move.kind !== "move") return -Infinity;
  const bot = state.players.find((p) => p.id === botId)!;
  const aim = getGoalAim(state, botId);
  const walked = getWalkDistance(state, botId, move.to);
  const advanced =
    (move.to.x - bot.position.x) * aim.x + (move.to.y - bot.position.y) * aim.y;
  const tile = move.to.y * state.config.boardSize + move.to.x;
  return -walked * 1e6 + advanced * 1e3 + tile * tileSign;
}

export function getBestMove(
  state: GameState,
  timeLimit: number = 1500,
  seed?: number,
): Move {
  const botId = state.players[state.turnIndex]!.id;
  const startTime = Date.now();
  const seedUsed =
    seed ?? hashString(`${state.createdAt ?? "no-date"}:${botId}`);
  const weights = buildBotWeights(state, botId, seedUsed);
  const rng = mulberry32(seedUsed);
  const tileSign = (seedUsed & 1) === 0 ? 1 : -1;
  const moves = getPrunedMoves(state);

  // In a team game a wall also has to buy real enemy clock: while their laggard
  // is still far out, walls that only shuffle it along are not worth the pool.
  // A wall's delta is exactly enemyDistWeight * the clock it bought, so the bar
  // is expressed in the same turns.
  const wallBar = isAllMustFinish(state)
    ? getTeamWallBar(state, botId) * weights.enemyDistWeight
    : 0;

  // 1. INSTANT WIN CHECK
  for (const move of moves) {
    if (move.kind === "move") {
      const nextState = applyMove(state, move, true);
      if (nextState.status === "finished" && isWinFor(nextState, botId))
        return move;
    }
  }

  // 2. THREAT SCAN (Only run slow checks if an enemy is actually 1 move away)
  const nextPlayer = getNextActivePlayer(state);
  let threatExists = false;
  let nextPlayerThreat = false;

  for (const p of state.players) {
    if (p.id === botId || p.finished || p.eliminated) continue;
    if (isAlly(state, botId, p.id)) continue;
    // Only a pawn near the line can be near a win, so the clock check runs for
    // a handful of pawns: it has to gather the whole team's distances.
    if (getDistanceToGoal(state, p.id) > 2) continue;
    // ...and in an all-must-finish game that pawn arriving is not enough: the
    // side wins when its slowest member does, so a lone enemy on the line is
    // no reason to spend a wall.
    if (getWinClock(state, p.id) > 2) continue;
    threatExists = true;
    if (p.id === nextPlayer?.id) nextPlayerThreat = true;
  }

  // 3. INSTANT BLOCK CHECK (Only if the next player is an enemy threat)
  if (nextPlayerThreat && nextPlayer) {
    const blockingMoves = moves.filter((move) => {
      const nextState = applyMove(state, move, true);
      return !canOpponentWinFast(nextState, nextPlayer.id);
    });
    if (blockingMoves.length > 0) {
      const scoredBlocks = blockingMoves.map((move) => ({
        move,
        deltaScore: evaluateMoveDelta(state, move, botId, weights),
      }));
      scoredBlocks.sort((a, b) => b.deltaScore - a.deltaScore);
      return scoredBlocks[0]!.move;
    }
  }

  // 3b. WALK IN: when every member has to finish, a pawn arriving does not end
  // the game, so the search is free to spend the turn on a wall and leave that
  // pawn on the doorstep, where an enemy wall can then cost it two more turns.
  // Arriving is one turn, no wall and one fewer pawn to carry, so it is taken
  // ahead of the slower plans - unless standing there is worth more. A pawn on
  // the line still takes turns, so while the team's laggard is far back it waits
  // and walls with them instead, as long as a wall actually buys enemy clock.
  let rootMoves = moves;
  if (isAllMustFinish(state) && getDistanceToGoal(state, botId) <= 1) {
    const finishMove = moves.find((move) => {
      if (move.kind !== "move") return false;
      const nextState = applyMove(state, move, true);
      return !!nextState.players.find((p) => p.id === botId)?.finished;
    });
    if (finishMove) {
      // Any wall that costs the enemy clock a turn is worth more here than the
      // turn spent arriving: standing on the line does not slow the team's own
      // clock - its slowest pawn sets that - so the wait is close to free.
      const holdWalls = shouldHoldDoorstep(state, botId)
        ? moves.filter(
            (move) =>
              move.kind === "wall" &&
              evaluateMoveDelta(state, move, botId, weights) > 0,
          )
        : [];
      if (holdWalls.length === 0) return finishMove;
      rootMoves = holdWalls;
    }
  }

  // 4. MINIMAX
  const scoredMoves = rootMoves.map((move) => ({
    move,
    deltaScore: evaluateMoveDelta(state, move, botId, weights),
  }));
  scoredMoves.sort((a, b) => b.deltaScore - a.deltaScore);

  const deltaByMove = new Map<Move, number>(
    scoredMoves.map(({ move, deltaScore }) => [move, deltaScore]),
  );

  // A wall that slows nobody is a wasted resource. When the bot can make real
  // progress, drop those walls instead of treating them as free moves.
  const hasImprovingPawnMove = scoredMoves.some(
    ({ move, deltaScore }) => move.kind === "move" && deltaScore > 0,
  );
  const playableMoves = hasImprovingPawnMove
    ? scoredMoves.filter(
        ({ move, deltaScore }) => move.kind !== "wall" || deltaScore > wallBar,
      )
    : scoredMoves;

  let topMoves = playableMoves;

  // Only apply the safe-move filter if an enemy is close to winning. A
  // teammate's win is our win, so it is never something to avoid.
  const current = state.players[state.turnIndex];
  const currentIsEnemy =
    !!current && current.id !== botId && !isAlly(state, botId, current.id);
  if (threatExists && currentIsEnemy) {
    topMoves = playableMoves.slice(0, 15).filter(({ move }) => {
      const nextState = applyMove(state, move, true);
      return !canCurrentPlayerWinFast(nextState);
    });
    if (topMoves.length === 0) topMoves = playableMoves.slice(0, 15);
  } else {
    // Keep the search focused: big games have well over a hundred legal moves.
    topMoves = playableMoves.slice(0, 15);
  }

  let bestMove = topMoves[0]!.move;
  // Root scores from the last completed depth, kept so equally good moves can
  // be chosen between at random.
  let finalScores: { move: Move; score: number }[] | null = null;

  for (let depth = 1; depth <= 6; depth++) {
    const scores: { move: Move; score: number }[] = [];
    let currentBestMove = bestMove;
    let currentBestScore = -Infinity;
    let timedOut = false;

    for (const { move } of topMoves) {
      if (Date.now() - startTime > timeLimit) {
        timedOut = true;
        break;
      }

      const nextState = applyMove(state, move, true);
      // Search every root move with a full window: alpha at the root would let
      // a bad move come back as an upper bound that looks tied with the best.
      const score = minimax(
        nextState,
        depth - 1,
        -Infinity,
        Infinity,
        botId,
        false,
        startTime,
        timeLimit,
        weights,
      );
      scores.push({ move, score });

      if (score > currentBestScore) {
        currentBestScore = score;
        currentBestMove = move;
      }
    }

    if (!timedOut) {
      bestMove = currentBestMove;
      finalScores = scores;
    }
    if (timedOut) break;
  }

  if (!finalScores || finalScores.length === 0) return bestMove;

  // Break ties between moves the search rates as (nearly) equal, so the same
  // position doesn't always produce the same game. A move also has to be close
  // on the cheap heuristic: otherwise a large tier of do-nothing walls can
  // outnumber the one good move and win the dice roll.
  const bestScore = Math.max(...finalScores.map((s) => s.score));
  const bestDelta = Math.max(
    ...finalScores.map((s) => deltaByMove.get(s.move) ?? 0),
  );
  const candidates = finalScores.filter((s) => {
    if (s.score < bestScore - weights.tieEpsilon) return false;
    return (deltaByMove.get(s.move) ?? 0) >= bestDelta - 0.7;
  });
  if (candidates.length <= 1) return candidates[0]?.move ?? bestMove;

  // Pawn moves the search cannot separate are settled by destination instead of
  // by a dice roll, which is what keeps a bot from pacing between two tiles.
  const pawnCandidates = candidates.filter((s) => s.move.kind === "move");
  if (pawnCandidates.length > 0) {
    let best = pawnCandidates[0]!;
    let bestTie = getMoveTieScore(state, botId, best.move, tileSign);
    for (const candidate of pawnCandidates.slice(1)) {
      const tie = getMoveTieScore(state, botId, candidate.move, tileSign);
      if (tie > bestTie) {
        best = candidate;
        bestTie = tie;
      }
    }
    return best.move;
  }

  // Cap the pool so equally-scored near-misses can't drown out the real choices.
  const pool = candidates.slice(0, 5);
  return pool[Math.floor(rng() * pool.length)]!.move;
}

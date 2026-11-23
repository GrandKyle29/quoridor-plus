import type { GameConfig } from "./config";
import type { GameState } from "./state";
import type { Move, Player, Coord } from "./types";
import { legalMoves } from "./moves"; // We need this to validate!

/**
 * Build the initial GameState from a config and player list.
 * This is THE source of truth for initial state construction.
 * Both createGame and any reconstruction (replay, rewind, etc.)
 * must use this to guarantee they produce identical states.
 */
export function buildInitialState(
  config: GameConfig,
  playerData: { name: string; color?: string; startIndex: number }[],
): GameState {
  // 1. Resolve teams
  const playerIds = playerData.map((_, i) => `p${i}`);
  let teams: { [id: string]: "A" | "B" } | undefined;
  if (config.useTeams) {
    teams = assignTeamsForGame(playerIds, config.teams ?? {});
  }

  // 2. Compute start positions based on goal condition
  let startPositions: Coord[];
  let teamStartIndices: number[] | undefined;

  if (config.goalCondition === "opposite-edge") {
    if (teams) {
      const layout = getOppositeEdgeTeamLayout(
        playerIds,
        teams,
        config.boardSize,
      );
      startPositions = layout.positions;
      teamStartIndices = layout.startIndices;
    } else {
      startPositions = getStartPositionsRaw(
        playerData.length,
        config.boardSize,
      );
    }
  } else if (config.goalCondition === "center") {
    if (teams) {
      const teamAIds = playerIds.filter((id) => teams![id] === "A");
      const teamBIds = playerIds.filter((id) => teams![id] === "B");

      // We no longer need a fallback; getDiamondTeamPositions
      // will automatically compress the diamond to fit the board.
      const aPositions = getDiamondTeamPositions(
        teamAIds.length,
        config.boardSize,
        "A",
      );
      const bPositions = getDiamondTeamPositions(
        teamBIds.length,
        config.boardSize,
        "B",
      );

      startPositions = new Array(playerData.length);
      teamAIds.forEach((id, i) => {
        startPositions[playerIds.indexOf(id)] = aPositions[i]!;
      });
      teamBIds.forEach((id, i) => {
        startPositions[playerIds.indexOf(id)] = bPositions[i]!;
      });
    } else {
      startPositions = getCenterStartPositions(
        playerData.length,
        config.boardSize,
      );
    }
  } else {
    // "top"
    startPositions = getTopRowStartPositions(
      playerData.length,
      config.boardSize,
    );
  }

  // 3. Starting walls + wall pools
  const startingWalls =
    config.startingWalls === "scaled"
      ? Math.max(3, 10 - playerData.length)
      : config.startingWalls;

  let sharedWallsRemaining: number | undefined;
  if (config.wallPool === "shared") {
    // In team mode, startingWalls means "per team" (so 2 teams = 2x the pool).
    // Otherwise it means "per player" (pool = startingWalls * playerCount).
    sharedWallsRemaining = teams
      ? startingWalls * 2
      : startingWalls * playerData.length;
  }

  let sharedWallsPerTeam: { A: number; B: number } | undefined;
  if (config.wallPool === "team" && teams) {
    sharedWallsPerTeam = {
      A: startingWalls,
      B: startingWalls,
    };
  }

  // 4. Build players
  const players: Player[] = playerData.map((p, i) => ({
    id: `p${i}`,
    name: p.name,
    color: p.color,
    position: startPositions[i]!,
    wallsRemaining: config.wallPool === "shared" ? 0 : startingWalls,
    connected: true,
    eliminated: false,
    startIndex: teamStartIndices ? teamStartIndices[i] : i,
    finished: false,
  }));

  // 5. Resolved config
  const finalConfig: GameConfig = {
    ...config,
    teams,
  };

  return {
    config: finalConfig,
    players,
    walls: [],
    turnIndex: 0,
    moveLog: [],
    moveCount: 0,
    status: "active",
    winner: null,
    finishOrder: [],
    sharedWallsRemaining,
    sharedWallsPerTeam,
    createdAt: new Date().toISOString(), // <-- NEW
  };
}
export function getStartPositions(count: number, size: number): Coord[] {
  return getStartPositionsRaw(count, size);
}
// Auto-assign players to teams by alternating index.
// p0, p2, p4... → team A (if teamAIsEven); p1, p3... → team B.
export function assignTeamsByAlternation(
  playerIds: string[],
  teamAIsEven: boolean = true,
): { [id: string]: "A" | "B" } {
  const teams: { [id: string]: "A" | "B" } = {};
  playerIds.forEach((id, i) => {
    const isEvenIndex = i % 2 === 0;
    teams[id] = isEvenIndex === teamAIsEven ? "A" : "B";
  });
  return teams;
}

// Only used for goalCondition === "opposite-edge" with teams.
// Team A → bottom edge, spreads N players evenly. Team B → top edge.
// Also returns startIndices (0 for team A, 1 for team B) so isPlayerGoal works.
function getOppositeEdgeTeamLayout(
  playerIds: string[],
  teams: { [id: string]: "A" | "B" },
  boardSize: number,
): { positions: Coord[]; startIndices: number[] } {
  const teamA = playerIds.filter((id) => teams[id] === "A");
  const teamB = playerIds.filter((id) => teams[id] === "B");
  const mid = Math.floor(boardSize / 2);
  const positions: Coord[] = new Array(playerIds.length);
  const startIndices: number[] = new Array(playerIds.length);

  // Spread count players evenly along x, 2 tiles apart, centered on mid.
  const spreadX = (count: number): number[] => {
    if (count === 1) return [mid];
    const xs: number[] = [];
    const span = (count - 1) * 2;
    const startX = Math.max(0, mid - Math.floor(span / 2));
    for (let i = 0; i < count; i++) {
      xs.push(Math.min(boardSize - 1, startX + i * 2));
    }
    return xs;
  };

  const aXs = spreadX(teamA.length);
  teamA.forEach((id, i) => {
    const idx = playerIds.indexOf(id);
    positions[idx] = { x: aXs[i]!, y: 0 };
    startIndices[idx] = 0; // team A from bottom, goal top
  });

  const bXs = spreadX(teamB.length);
  teamB.forEach((id, i) => {
    const idx = playerIds.indexOf(id);
    positions[idx] = { x: bXs[i]!, y: boardSize - 1 };
    startIndices[idx] = 1; // team B from top, goal bottom
  });

  return { positions, startIndices };
}
export function getCenterStartPositions(count: number, size: number): Coord[] {
  const positions = getStartPositionsRaw(count, size);
  const mid = Math.floor(size / 2);
  const max = size - 1;

  // For 5-8 player KotH, offset players (not on their edge's midpoint)
  // start 1 tile further from center. Pull them 1 tile inward.
  // 2-4 player games have all midpoint starts, so this is a no-op for them.
  if (count > 4) {
    for (let i = 0; i < count; i++) {
      const p = positions[i]!;
      const isMidpoint =
        (p.x === mid && (p.y === 0 || p.y === max)) ||
        (p.y === mid && (p.x === 0 || p.x === max));
      if (isMidpoint) continue;

      if (p.y === 0) p.y = 1;
      else if (p.y === max) p.y = max - 1;
      else if (p.x === 0) p.x = 1;
      else if (p.x === max) p.x = max - 1;
    }
  }

  return positions;
}
export function getStartPositionsRaw(count: number, size: number): Coord[] {
  const mid = Math.floor(size / 2);
  const max = size - 1;

  if (count === 2)
    return [
      { x: mid, y: 0 },
      { x: mid, y: max },
    ];

  if (count === 3)
    return [
      { x: mid, y: 0 },
      { x: mid, y: max },
      { x: 0, y: mid },
    ];

  if (count === 4)
    return [
      { x: mid, y: 0 },
      { x: mid, y: max },
      { x: 0, y: mid },
      { x: max, y: mid },
    ];

  if (count < 5 || count > 8) {
    throw new Error("Opposite-edge mode supports 2-8 players");
  }

  const positions: Coord[] = [];
  for (let i = 0; i < count; i++) {
    const edge = i % 4; // 0=bottom, 1=top, 2=left, 3=right
    const slot = Math.floor(i / 4); // 0 or 1

    // Is this edge alone (only one player) for this player count?
    const alone = count <= 4 + edge;

    if (alone) {
      // Centered on the edge
      if (edge === 0) positions.push({ x: mid, y: 0 });
      else if (edge === 1) positions.push({ x: mid, y: max });
      else if (edge === 2) positions.push({ x: 0, y: mid });
      else positions.push({ x: max, y: mid });
    } else {
      // Two players on this edge, offset by ±1
      if (edge === 0) {
        // Bottom: slot 0 left, slot 1 right
        positions.push({ x: slot === 0 ? mid - 1 : mid + 1, y: 0 });
      } else if (edge === 1) {
        // Top: slot 0 right, slot 1 left
        positions.push({ x: slot === 0 ? mid + 1 : mid - 1, y: max });
      } else if (edge === 2) {
        // Left: slot 0 bottom, slot 1 top
        positions.push({ x: 0, y: slot === 0 ? mid + 1 : mid - 1 });
      } else {
        // Right: slot 0 top, slot 1 bottom
        positions.push({ x: max, y: slot === 0 ? mid - 1 : mid + 1 });
      }
    }
  }
  return positions;
}
export function getTopRowStartPositions(
  count: number,
  boardSize: number,
): Coord[] {
  const y = 0;
  const center = Math.floor(boardSize / 2);
  const clamp = (x: number) => Math.max(0, Math.min(boardSize - 1, x));

  if (count === 2) {
    return [
      { x: clamp(center - 1), y },
      { x: clamp(center + 1), y },
    ];
  }
  if (count === 3) {
    return [
      { x: clamp(center - 2), y },
      { x: clamp(center), y },
      { x: clamp(center + 2), y },
    ];
  }
  if (count === 4) {
    return [
      { x: clamp(center - 3), y },
      { x: clamp(center - 1), y },
      { x: clamp(center + 1), y },
      { x: clamp(center + 3), y },
    ];
  }

  if (count < 2 || count > 8) {
    throw new Error("Top-row mode supports 2-8 players");
  }

  // Try gap = 2
  const gap2Span = (count - 1) * 2;
  if (gap2Span <= boardSize - 1) {
    const startX = center - Math.floor(gap2Span / 2);
    return Array.from({ length: count }, (_, i) => ({
      x: clamp(startX + i * 2),
      y,
    }));
  }

  // Fall back to gap = 1
  const gap1Span = count - 1;
  if (gap1Span <= boardSize - 1) {
    const startX = center - Math.floor(gap1Span / 2);
    return Array.from({ length: count }, (_, i) => ({
      x: clamp(startX + i),
      y,
    }));
  }

  throw new Error(`Cannot place ${count} players on a ${boardSize}-wide row`);
}

function getDiamondTeamPositions(
  teamSize: number,
  boardSize: number,
  team: "A" | "B",
): Coord[] {
  const center = Math.floor(boardSize / 2);

  // Calculate how far we can safely spread horizontally before hitting the edge.
  // We subtract 1 from the edge to leave a gap.
  const maxHorizontalSpan = Math.min(
    teamSize - 1,
    Math.floor((boardSize - 3) / 2),
  );

  const offsets: number[] = [];
  for (let i = 0; i < teamSize; i++) {
    if (teamSize === 1) {
      offsets.push(0);
    } else {
      // Map index to the range [-maxHorizontalSpan, maxHorizontalSpan]
      const ratio = i / (teamSize - 1);
      const offset = Math.round(
        -maxHorizontalSpan + ratio * 2 * maxHorizontalSpan,
      );
      offsets.push(offset);
    }
  }

  return offsets.map((offset) => {
    const x = center + offset;
    const yOffset = Math.abs(offset);
    const y = team === "A" ? yOffset : boardSize - 1 - yOffset;
    return { x, y };
  });
}
// Assign teams for a team-mode game.
// Explicit assignments in config.teams are always honored.
// Anyone unassigned gets randomly distributed, with balance enforced
// (|teamA - teamB| <= 1). randomizeSpawns does NOT affect this.
export function assignTeamsForGame(
  playerIds: string[],
  explicitTeams: { [id: string]: "A" | "B" },
): { [id: string]: "A" | "B" } {
  const teams: { [id: string]: "A" | "B" } = { ...explicitTeams };

  const assignedA = Object.values(teams).filter((t) => t === "A").length;
  const assignedB = Object.values(teams).filter((t) => t === "B").length;

  const unassigned = playerIds.filter((id) => !teams[id]);

  // If nothing to assign, return
  if (unassigned.length === 0) return teams;

  // Sanity: if explicit assignments are already imbalanced by 2+,
  // throw so the caller can handle it.
  if (Math.abs(assignedA - assignedB) > 1) {
    throw new Error(
      `Team assignment is unbalanced: ${assignedA} on A, ${assignedB} on B.`,
    );
  }

  // Fisher-Yates shuffle of unassigned players
  const shuffled = [...unassigned];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  let aCount = assignedA;
  let bCount = assignedB;
  for (const id of shuffled) {
    if (aCount < bCount) {
      teams[id] = "A";
      aCount++;
    } else if (bCount < aCount) {
      teams[id] = "B";
      bCount++;
    } else {
      // Tie: random
      const choice = Math.random() < 0.5 ? "A" : "B";
      teams[id] = choice;
      if (choice === "A") aCount++;
      else bCount++;
    }
  }

  return teams;
}
// Fisher-Yates shuffle for randomizing player order
function shuffleArray<T>(array: T[]): T[] {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j]!, newArr[i]!];
  }
  return newArr;
}
export function createGame(
  config: GameConfig,
  playerNames: string[],
  playerColors?: string[],
) {
  const combinedPlayers = playerNames.map((name: string, i: number) => ({
    name,
    color: playerColors?.[i],
  }));

  const shouldRandomize = config.randomizeSpawns !== false;
  const shuffledPlayers = shouldRandomize
    ? shuffleArray(combinedPlayers)
    : combinedPlayers;

  const playerData = shuffledPlayers.map((p, i) => ({
    name: p.name,
    color: p.color,
    startIndex: i,
  }));

  return buildInitialState(config, playerData);
}

// Helper to deep-copy the state so we don't mutate the original
function copyState(state: GameState): GameState {
  return {
    config: { ...state.config },
    players: state.players.map((p) => ({ ...p, position: { ...p.position } })),
    walls: state.walls.map((w) => ({ ...w, coord: { ...w.coord } })),
    turnIndex: state.turnIndex,
    moveLog: [...state.moveLog],
    moveCount: state.moveCount,
    status: state.status,
    winner: state.winner,
    finishOrder: state.finishOrder ? [...state.finishOrder] : undefined,
    sharedWallsRemaining: state.sharedWallsRemaining,
    sharedWallsPerTeam: state.sharedWallsPerTeam
      ? { ...state.sharedWallsPerTeam }
      : undefined,
    createdAt: state.createdAt, // <-- NEW
  };
}
export function isPlayerGoal(
  state: GameState,
  playerIndex: number,
  coord: Coord,
): boolean {
  const { boardSize, goalCondition } = state.config;

  if (goalCondition === "center") {
    const center = Math.floor(boardSize / 2);
    return coord.x === center && coord.y === center;
  }

  if (goalCondition === "top") {
    return coord.y === boardSize - 1;
  }

  if (goalCondition === "opposite-edge") {
    const player = state.players[playerIndex];
    if (!player) return false;
    const edge = (player.startIndex ?? playerIndex) % 4;
    if (edge === 0) return coord.y === boardSize - 1;
    if (edge === 1) return coord.y === 0;
    if (edge === 2) return coord.x === boardSize - 1;
    if (edge === 3) return coord.x === 0;
  }

  return false;
}
/**
 * The order turns rotate through, as indices into state.players.
 *
 * "seat" (default) is the historical behaviour: p0 → p1 → … → p0.
 *
 * "alternating" interleaves the two team rosters in seat order (A1, B1, A2,
 * B2, …) so consecutive turns belong to different teams. When the teams are
 * uneven the larger team's spare player goes last, which puts the single
 * unavoidable same-team pair at the wrap (last → first).
 *
 * This only decides whose turn it is: spawns are computed from team membership,
 * so teammates still start on the same side / in the same diamond.
 */
export function getTurnRing(state: GameState): number[] {
  const seatRing = state.players.map((_, index) => index);
  const teams = state.config.teams;
  if (!teams || state.config.teamTurnOrder !== "alternating") return seatRing;

  const roster: { A: number[]; B: number[] } = { A: [], B: [] };
  const unassigned: number[] = [];
  state.players.forEach((player, index) => {
    const team = teams[player.id];
    if (team === "A" || team === "B") roster[team].push(index);
    else unassigned.push(index);
  });

  const ring: number[] = [];
  const laps = Math.max(roster.A.length, roster.B.length);
  for (let i = 0; i < laps; i++) {
    const a = roster.A[i];
    const b = roster.B[i];
    if (a !== undefined) ring.push(a);
    if (b !== undefined) ring.push(b);
  }
  // Shouldn't happen in team mode, but never drop a player from the rotation.
  ring.push(...unassigned);
  return ring;
}

function getNextActivePlayerIndex(state: GameState): number {
  const ring = getTurnRing(state);
  const start = ring.indexOf(state.turnIndex);
  if (start === -1) return state.turnIndex; // not in the rotation (shouldn't happen)

  for (let i = 1; i <= ring.length; i++) {
    const index = ring[(start + i) % ring.length]!;
    const player = state.players[index]!;
    if (!player.finished && !player.eliminated) return index;
  }
  return state.turnIndex; // fallback if everyone is out (shouldn't happen)
}
// Update checkWin to use the helper
function checkWin(state: GameState, player: Player): boolean {
  const playerIndex = state.players.findIndex((p) => p.id === player.id);
  return isPlayerGoal(state, playerIndex, player.position);
}
export function applyMove(
  state: GameState,
  move: Move,
  skipValidation = false,
): GameState {
  // 1. Is it this player's turn, and is the game active?
  if (state.status !== "active") throw new Error("Game is not active");

  // 2. Handle skip before validation (skips are always legal)
  if (move.kind === "skip") {
    const nextState = copyState(state);
    nextState.moveLog.push(move);
    nextState.moveCount = (nextState.moveCount ?? 0) + 1;
    nextState.turnIndex = getNextActivePlayerIndex(nextState);
    return nextState;
  }

  // 2b. Eliminations are out-of-band events (a player left or was kicked),
  // so they bypass turn validation like skips do.
  if (move.kind === "eliminate") {
    const nextState = copyState(state);
    const targetIndex = nextState.players.findIndex(
      (p) => p.id === move.playerId,
    );
    if (targetIndex === -1) throw new Error("Unknown player");
    const target = nextState.players[targetIndex]!;
    target.eliminated = true;
    target.eliminationReason = move.reason ?? "left";
    nextState.moveLog.push(move);
    nextState.moveCount = (nextState.moveCount ?? 0) + 1;

    const remaining = nextState.players.filter((p) => !p.eliminated);
    const teams = nextState.config.teams;
    const eliminatedTeam = teams?.[target.id];

    // Team games: losing a player loses the game for that player's team.
    if (teams && eliminatedTeam) {
      const opponents = remaining.filter(
        (p) => teams[p.id] !== eliminatedTeam,
      );
      nextState.status = "finished";
      nextState.winner = opponents[0]?.id ?? null;
      if (opponents[0]) {
        nextState.turnIndex = nextState.players.findIndex(
          (p) => p.id === opponents[0]!.id,
        );
      }
      return nextState;
    }

    // Free-for-all: the last player standing wins.
    if (remaining.length <= 1) {
      nextState.status = "finished";
      nextState.winner = remaining[0]?.id ?? null;
      if (remaining[0]) {
        nextState.turnIndex = nextState.players.findIndex(
          (p) => p.id === remaining[0]!.id,
        );
      }
      return nextState;
    }

    // If the eliminated player was up, hand the turn to the next live player.
    if (targetIndex === nextState.turnIndex) {
      nextState.turnIndex = getNextActivePlayerIndex(nextState);
    }
    return nextState;
  }

  // 3. Is the move legal?  // ONLY validate if skipValidation is false
  if (!skipValidation) {
    const validMoves = legalMoves(state);
    const isValid = validMoves.some((m) => {
      if (m.kind === "move" && move.kind === "move") {
        return m.to.x === move.to.x && m.to.y === move.to.y;
      }
      if (m.kind === "wall" && move.kind === "wall") {
        return (
          m.wall.coord.x === move.wall.coord.x &&
          m.wall.coord.y === move.wall.coord.y &&
          m.wall.orientation === move.wall.orientation
        );
      }
      return false;
    });
    if (!isValid) throw new Error("Illegal move");
  }

  // 4. Create a fresh copy of the state
  const nextState = copyState(state);
  const currentPlayer = nextState.players[nextState.turnIndex]!;

  // 5. Apply the move
  if (move.kind === "move") {
    currentPlayer.position = move.to;
  } else if (move.kind === "wall") {
    nextState.walls.push({ ...move.wall, placedBy: currentPlayer.id });
    if (nextState.config.wallPool === "shared") {
      nextState.sharedWallsRemaining =
        (nextState.sharedWallsRemaining ?? 0) - 1;
    } else if (nextState.config.wallPool === "team") {
      const team = nextState.config.teams?.[currentPlayer.id];
      if (team && nextState.sharedWallsPerTeam) {
        nextState.sharedWallsPerTeam[team] =
          nextState.sharedWallsPerTeam[team] - 1;
      }
    } else {
      currentPlayer.wallsRemaining -= 1;
    }
  }

  // 6. Log the move
  nextState.moveLog.push(move);
  nextState.moveCount = (nextState.moveCount ?? 0) + 1;

  // 7. Did this move win the game?
  if (checkWin(nextState, currentPlayer)) {
    currentPlayer.finished = true;
    // Track completion order: "all must finish" team games end on the last
    // teammate to cross the line, so the UI needs to know who finished first.
    nextState.finishOrder = [
      ...(nextState.finishOrder ?? []),
      currentPlayer.id,
    ];

    if (nextState.config.teams) {
      const team = nextState.config.teams[currentPlayer.id];
      const winCondition = nextState.config.teamWinCondition ?? "all";

      if (winCondition === "any") {
        nextState.status = "finished";
        nextState.winner = currentPlayer.id;
        return nextState;
      }

      // winCondition === "all"
      const teamPlayers = nextState.players.filter(
        (p) => nextState.config.teams?.[p.id] === team,
      );
      const allFinished = teamPlayers.every((p) => p.finished === true);

      if (allFinished) {
        nextState.status = "finished";
        nextState.winner = currentPlayer.id;
        return nextState;
      }

      nextState.turnIndex = getNextActivePlayerIndex(nextState);
      return nextState;
    }

    // Non-team mode
    nextState.status = "finished";
    nextState.winner = currentPlayer.id;
    return nextState;
  }

  // Advance to the next non-finished player
  nextState.turnIndex = getNextActivePlayerIndex(nextState);

  return nextState;
}

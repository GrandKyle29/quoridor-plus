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
  const startPositions =
    config.goalCondition === "top"
      ? getTopRowStartPositions(playerData.length, config.boardSize)
      : config.goalCondition === "center"
        ? getCenterStartPositions(playerData.length, config.boardSize)
        : getStartPositionsRaw(playerData.length, config.boardSize);
  const startingWalls =
    config.startingWalls === "scaled"
      ? Math.max(3, 10 - playerData.length)
      : config.startingWalls;

  let sharedWallsRemaining: number | undefined;
  if (config.wallPool === "shared") {
    sharedWallsRemaining = startingWalls * playerData.length;
  }

  const players: Player[] = playerData.map((p, i) => ({
    id: `p${i}`,
    name: p.name,
    color: p.color,
    position: startPositions[p.startIndex]!,
    wallsRemaining: config.wallPool === "shared" ? 0 : startingWalls,
    connected: true,
    eliminated: false,
    startIndex: p.startIndex,
  }));

  return {
    config,
    players,
    walls: [],
    turnIndex: 0,
    moveLog: [],
    status: "active",
    winner: null,
    sharedWallsRemaining,
  };
}
export function getStartPositions(count: number, size: number): Coord[] {
  return getStartPositionsRaw(count, size);
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
): GameState {
  const combinedPlayers = playerNames.map((name, i) => ({
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
    status: state.status,
    winner: state.winner,
    sharedWallsRemaining: state.sharedWallsRemaining,
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
    if (edge === 0) return coord.y === boardSize - 1; // started bottom → goal top
    if (edge === 1) return coord.y === 0; // started top → goal bottom
    if (edge === 2) return coord.x === boardSize - 1; // started left → goal right
    if (edge === 3) return coord.x === 0; // started right → goal left
  }

  return false;
}
// Update checkWin to use the helper
function checkWin(state: GameState, player: Player): boolean {
  const playerIndex = state.players.findIndex((p) => p.id === player.id);
  return isPlayerGoal(state, playerIndex, player.position);
}
export function applyMove(state: GameState, move: Move): GameState {
  // 1. Is it this player's turn, and is the game active?
  if (state.status !== "active") throw new Error("Game is not active");
  //2. is the move legal?
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

  // 3. Create a fresh copy of the state
  const nextState = copyState(state);
  const currentPlayer = nextState.players[nextState.turnIndex]!;

  // 4. Apply the move
  if (move.kind === "move") {
    currentPlayer.position = move.to;
  } else if (move.kind === "wall") {
    nextState.walls.push({ ...move.wall, placedBy: currentPlayer.id });

    if (nextState.config.wallPool === "shared") {
      nextState.sharedWallsRemaining =
        (nextState.sharedWallsRemaining ?? 0) - 1;
    } else {
      currentPlayer.wallsRemaining -= 1;
    }
  }
  // 5. Log the move (useful for replay/spectators later)
  nextState.moveLog.push(move);

  // 6. Did this move win the game?
  if (checkWin(nextState, currentPlayer)) {
    nextState.status = "finished";
    nextState.winner = currentPlayer.id;
    return nextState; // Game over, don't advance turn
  }

  // 7. Advance the turn to the next player (clockwise)
  nextState.turnIndex = (nextState.turnIndex + 1) % nextState.players.length;

  return nextState;
}

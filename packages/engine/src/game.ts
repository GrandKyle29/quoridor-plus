import type { GameConfig } from "./config";
import type { GameState } from "./state";
import type { Move, Player, Coord } from "./types";
import { legalMoves } from "./moves"; // We need this to validate!

export function getStartPositions(count: number, size: number): Coord[] {
  const mid = Math.floor(size / 2);
  const max = size - 1;

  if (count === 2)
    return [
      { x: mid, y: 0 },
      { x: mid, y: max },
    ];
  if (count === 4)
    return [
      { x: mid, y: 0 },
      { x: mid, y: max },
      { x: 0, y: mid },
      { x: max, y: mid },
    ];
  if (count === 3)
    return [
      { x: mid, y: 0 },
      { x: 0, y: max },
      { x: max, y: max },
    ];

  throw new Error("Player count must be 2, 3, or 4");
}
export function createGame(
  config: GameConfig,
  playerNames: string[],
): GameState {
  const startPositions = getStartPositions(
    playerNames.length,
    config.boardSize,
  );

  const startingWalls =
    config.startingWalls === "scaled"
      ? Math.max(3, 10 - playerNames.length) // just a placeholder logic for now
      : config.startingWalls;

  const players: Player[] = playerNames.map((name, index) => ({
    id: `p${index}`,
    name,
    position: startPositions[index]!,
    wallsRemaining: startingWalls,
    connected: true,
    eliminated: false,
    startIndex: index, // <-- ADD THIS
  }));

  return {
    config,
    players,
    walls: [],
    turnIndex: 0,
    moveLog: [],
    status: "active",
    winner: null,
  };
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

  if (goalCondition === "opposite-edge") {
    const player = state.players[playerIndex];
    if (!player) return false;
    const startIndex = player.startIndex ?? playerIndex;
    if (startIndex === 0) return coord.y === boardSize - 1;
    if (startIndex === 1) return coord.y === 0;
    if (startIndex === 2) return coord.x === boardSize - 1;
    if (startIndex === 3) return coord.x === 0;
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

  // 2. Is the move actually legal?
  // We use .some() and JSON.stringify for a deep equality check
  const validMoves = legalMoves(state);
  const isValid = validMoves.some(
    (m) => JSON.stringify(m) === JSON.stringify(move),
  );
  if (!isValid) throw new Error("Illegal move");

  // 3. Create a fresh copy of the state
  const nextState = copyState(state);
  const currentPlayer = nextState.players[nextState.turnIndex]!;

  // 4. Apply the move
  if (move.kind === "move") {
    currentPlayer.position = move.to;
  } else if (move.kind === "wall") {
    // NEW: Attach the player's ID to the wall
    nextState.walls.push({ ...move.wall, placedBy: currentPlayer.id });
    currentPlayer.wallsRemaining -= 1;
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

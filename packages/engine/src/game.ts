import type { GameConfig } from "./config";
import type { GameState } from "./state";
import type { Move, Player, Coord } from "./types";
import { legalMoves } from "./moves"; // We need this to validate!

export function getStartPositions(count: number, size: number): Coord[] {
  const mid = Math.floor(size / 2);
  const max = size - 1;

  // 2 players: classic bottom and top
  if (count === 2) {
    return [
      { x: mid, y: 0 },
      { x: mid, y: max },
    ];
  }

  // 4 players: all four edges
  if (count === 4) {
    return [
      { x: mid, y: 0 }, // bottom
      { x: 0, y: mid }, // left
      { x: mid, y: max }, // top
      { x: max, y: mid }, // right
    ];
  }

  // 3 players: bottom, top-left, top-right
  if (count === 3) {
    return [
      { x: mid, y: 0 }, // bottom
      { x: 0, y: max }, // top-left
      { x: max, y: max }, // top-right
    ];
  }

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

// Helper to check if a player reached their goal
function checkWin(state: GameState, player: Player): boolean {
  const { boardSize, goalCondition } = state.config;
  const playerIndex = state.players.findIndex((p) => p.id === player.id);

  if (goalCondition === "opposite-edge") {
    if (playerIndex === 0) return player.position.y === boardSize - 1; // P0 goes Up
    if (playerIndex === 1) return player.position.y === 0; // P1 goes Down
    // We will expand this for 4-player modes later
  }
  return false;
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
    nextState.walls.push(move.wall);
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

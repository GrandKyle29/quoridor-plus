import { createGame, applyMove } from "@quoridor/engine";
import type { GameConfig, GameState, Move } from "@quoridor/engine";

export type ShareData = {
  config: GameConfig;
  playerNames: string[];
  playerColors?: string[];
  moveLog: Move[];
};

export function encodeShareCode(state: GameState): string {
  const data: ShareData = {
    config: state.config,
    playerNames: state.players.map((p) => p.name),
    playerColors: state.players.map((p) => p.color || "#ffffff"),
    moveLog: state.moveLog,
  };

  const json = JSON.stringify(data);

  // Use btoa to encode as Base64 (safe for URLs after encoding)
  // Note: btoa doesn't handle unicode, so we use encodeURIComponent
  return btoa(encodeURIComponent(json));
}

export function decodeShareCode(code: string): GameState | null {
  try {
    const json = decodeURIComponent(atob(code));
    const data = JSON.parse(json) as ShareData;

    // Reconstruct the game
    const initialState = createGame(
      data.config,
      data.playerNames,
      data.playerColors,
    );
    let currentState = initialState;

    // Apply every move in the log to reach the final state
    for (const move of data.moveLog) {
      currentState = applyMove(currentState, move);
    }

    return currentState;
  } catch (e) {
    console.error("Failed to decode share code:", e);
    return null;
  }
}

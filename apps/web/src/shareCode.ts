import { createGame, applyMove } from "@quoridor/engine";
import type { GameConfig, GameState, Move } from "@quoridor/engine";

export type ShareData = {
  config: GameConfig;
  playerNames: string[];
  playerColors?: string[];
  moveLog: Move[];
};

export type ShareData = {
  config: GameConfig;
  players: { name: string; color: string }[]; // Original order, unshuffled
  moveLog: Move[];
};

export type ShareData = {
  config: GameConfig;
  players: { name: string; color: string }[]; // Original order, unshuffled
  moveLog: Move[];
};

export function encodeShareCode(state: GameState): string {
  // Use the FIRST move's resulting state to get the original order
  // (or just state.players if the game hasn't started)
  const data: ShareData = {
    config: state.config,
    players: state.players.map((p) => ({
      name: p.name,
      color: p.color || "#ffffff",
    })),
    moveLog: state.moveLog,
  };
  const json = JSON.stringify(data);
  return btoa(encodeURIComponent(json));
}

export function decodeShareCode(code: string): GameState | null {
  try {
    const json = decodeURIComponent(atob(code));
    const data = JSON.parse(json) as ShareData;

    // Reconstruct with randomizeSpawns OFF and playerColors mapped
    const configForReplay = { ...data.config, randomizeSpawns: false };
    let currentState = createGame(
      configForReplay,
      data.players.map((p) => p.name),
      data.players.map((p) => p.color),
    );

    for (const move of data.moveLog) {
      currentState = applyMove(currentState, move);
    }

    return currentState;
  } catch (e) {
    console.error("Failed to decode share code:", e);
    return null;
  }
}

import { createGame, applyMove } from "@quoridor/engine";
import type { GameConfig, GameState, Move } from "@quoridor/engine";

export type ShareData = {
  config: GameConfig;
  players: { name: string; color: string }[];
  moveLog: Move[];
};

export function encodeShareCode(state: GameState): string {
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

    // Force randomizeSpawns off to preserve the original player order
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

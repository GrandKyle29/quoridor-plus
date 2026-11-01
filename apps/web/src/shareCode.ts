import { applyMove, getStartPositionsRaw } from "@quoridor/engine";
import type { GameConfig, GameState, Move, Player } from "@quoridor/engine";

export type ShareData = {
  config: GameConfig;
  players: { name: string; color: string; startIndex: number }[];
  moveLog: Move[];
};

export function encodeShareCode(state: GameState): string {
  const data: ShareData = {
    config: state.config,
    players: state.players.map((p) => ({
      name: p.name,
      color: p.color || "#ffffff",
      startIndex: p.startIndex ?? 0,
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

    // Rebuild the player list in the exact saved order, using their saved startIndex
    const startPositions = getStartPositionsRaw(
      data.players.length,
      data.config.boardSize,
    );

    const players: Player[] = data.players.map((p, i) => ({
      id: `p${i}`,
      name: p.name,
      color: p.color,
      position: startPositions[p.startIndex]!,
      wallsRemaining:
        typeof data.config.startingWalls === "number"
          ? data.config.startingWalls
          : Math.max(3, 10 - data.players.length),
      connected: true,
      eliminated: false,
      startIndex: p.startIndex,
    }));

    // Build the initial state manually
    let currentState: GameState = {
      config: data.config,
      players,
      walls: [],
      turnIndex: 0,
      moveLog: [],
      status: "active",
      winner: null,
    };

    // Replay all the moves
    for (const move of data.moveLog) {
      currentState = applyMove(currentState, move);
    }

    // Preserve the full moveLog so the slider works
    return { ...currentState, moveLog: data.moveLog };
  } catch (e) {
    console.error("Failed to decode share code:", e);
    return null;
  }
}

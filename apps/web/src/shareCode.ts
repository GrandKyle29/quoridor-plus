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
  return btoa(encodeURIComponent(JSON.stringify(data)));
}

export function decodeShareCode(code: string): GameState | null {
  try {
    const json = decodeURIComponent(atob(code));
    const data = JSON.parse(json) as ShareData;

    const startPositions = getStartPositionsRaw(
      data.players.length,
      data.config.boardSize,
    );
    const startingWalls =
      typeof data.config.startingWalls === "number"
        ? data.config.startingWalls
        : Math.max(3, 10 - data.players.length);

    // Reconstruct players in their ORIGINAL startIndex positions
    const players: Player[] = data.players.map((p, i) => ({
      id: `p${i}`,
      name: p.name,
      color: p.color,
      position: startPositions[p.startIndex]!,
      wallsRemaining: startingWalls,
      connected: true,
      eliminated: false,
      startIndex: p.startIndex,
    }));

    let currentState: GameState = {
      config: data.config,
      players,
      walls: [],
      turnIndex: 0,
      moveLog: [],
      status: "active",
      winner: null,
    };

    for (const move of data.moveLog) {
      currentState = applyMove(currentState, move);
    }

    return { ...currentState, moveLog: data.moveLog };
  } catch (e) {
    console.error("Failed to decode share code:", e);
    return null;
  }
}

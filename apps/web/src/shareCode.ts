import LZString from "lz-string";
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

  // Compress + encode with lz-string. The "compressToEncodedURIComponent"
  // produces URL-safe output using only A-Z, a-z, 0-9, +, $ (or similar).
  return LZString.compressToEncodedURIComponent(json);
}

export function decodeShareCode(code: string): GameState | null {
  try {
    // Decompress
    const json = LZString.decompressFromEncodedURIComponent(code);
    if (!json) throw new Error("Invalid share code");

    const data = JSON.parse(json) as ShareData;

    if (data.config.schemaVersion !== 1) {
      throw new Error(
        `This replay uses schema version ${data.config.schemaVersion}, which is not compatible with the current game.`,
      );
    }

    const startPositions = getStartPositionsRaw(
      data.players.length,
      data.config.boardSize,
    );
    const startingWalls =
      typeof data.config.startingWalls === "number"
        ? data.config.startingWalls
        : Math.max(3, 10 - data.players.length);

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

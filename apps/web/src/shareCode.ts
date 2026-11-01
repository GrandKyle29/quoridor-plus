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

    console.group("🔍 Decoding Share Code");
    console.log("Config:", data.config);
    console.log("Players:", data.players);
    console.log("Move count:", data.moveLog.length);

    const startPositions = getStartPositionsRaw(
      data.players.length,
      data.config.boardSize,
    );
    console.log("Start positions:", startPositions);

    const startingWalls =
      typeof data.config.startingWalls === "number"
        ? data.config.startingWalls
        : Math.max(3, 10 - data.players.length);

    const players: Player[] = data.players.map((p, i) => {
      const position = startPositions[p.startIndex]!;
      console.log(
        `Player ${i}: ${p.name} | startIndex=${p.startIndex} | position=`,
        position,
      );
      return {
        id: `p${i}`,
        name: p.name,
        color: p.color,
        position,
        wallsRemaining: startingWalls,
        connected: true,
        eliminated: false,
        startIndex: p.startIndex,
      };
    });

    let currentState: GameState = {
      config: data.config,
      players,
      walls: [],
      turnIndex: 0,
      moveLog: [],
      status: "active",
      winner: null,
    };

    for (let i = 0; i < data.moveLog.length; i++) {
      const move = data.moveLog[i]!;
      try {
        currentState = applyMove(currentState, move);
      } catch (moveError) {
        console.error(`❌ Failed at move ${i}:`, move);
        console.error("Current turn index:", currentState.turnIndex);
        console.error(
          "Current player:",
          currentState.players[currentState.turnIndex],
        );
        console.error("Current players:", currentState.players);
        console.error("Current walls:", currentState.walls);
        throw moveError;
      }
    }

    console.log("✅ All moves applied successfully");
    console.groupEnd();

    return { ...currentState, moveLog: data.moveLog };
  } catch (e) {
    console.error("Failed to decode share code:", e);
    console.groupEnd();
    return null;
  }
}

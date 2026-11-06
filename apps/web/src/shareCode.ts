import LZString from "lz-string";
import {
  applyMove,
  buildInitialState,
  decodeMoves,
  encodeMoves,
  legalMoves,
} from "@quoridor/engine";
import type { GameConfig, GameState, Move } from "@quoridor/engine";

export type ShareData = {
  config: GameConfig;
  players: { name: string; color: string; startIndex: number }[];
  moveLog: Move[];
};

export function encodeShareCode(state: GameState): string {
  const data = {
    config: state.config,
    players: state.players.map((p) => ({
      name: p.name,
      color: p.color || "#ffffff",
      startIndex: p.startIndex ?? 0,
    })),
    moveLog: encodeMoves(state.moveLog),
  };

  const json = JSON.stringify(data);
  return LZString.compressToEncodedURIComponent(json);
}

export function decodeShareCode(code: string): GameState | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(code);
    if (!json) throw new Error("Invalid share code");

    const raw = JSON.parse(json);

    if (raw.config.schemaVersion !== 2 && raw.config.schemaVersion !== 3) {
      throw new Error(
        `This replay uses schema version ${raw.config.schemaVersion}, which is not compatible.`,
      );
    }

    const config: GameConfig = raw.config;
    const playerData: { name: string; color: string; startIndex: number }[] =
      raw.players;
    const moveLog: Move[] = decodeMoves(raw.moveLog);

    // Use the SAME builder that createGame uses — no duplicate logic!
    let currentState = buildInitialState(config, playerData);

    for (let i = 0; i < moveLog.length; i++) {
      const move = moveLog[i]!;
      try {
        currentState = applyMove(currentState, move);
      } catch (e) {
        console.error(`🚨 Failed at move ${i}/${moveLog.length}`);
        console.error("  Move:", JSON.stringify(move));
        console.error("  State before move:", {
          players: currentState.players.map((p) => ({
            id: p.id,
            position: p.position,
            wallsRemaining: p.wallsRemaining,
          })),
          wallsCount: currentState.walls.length,
          turnIndex: currentState.turnIndex,
          sharedWallsRemaining: currentState.sharedWallsRemaining,
        });
        const legal = legalMoves(currentState);
        console.error(
          "  Legal moves:",
          legal.map((m) =>
            m.kind === "move"
              ? `move(${m.to.x},${m.to.y})`
              : `wall(${m.wall.coord.x},${m.wall.coord.y},${m.wall.orientation})`,
          ),
        );
        throw e;
      }
    }

    return { ...currentState, moveLog };
  } catch (e) {
    console.error("Failed to decode share code:", e);
    return null;
  }
}

import type { GameConfig } from "./config";
import type { Move, Player, PlayerId, Wall } from "./types";

export type GameState = {
  config: GameConfig;
  players: Player[];
  walls: Wall[];
  turnIndex: number; // whose turn (index into players)
  moveLog: Move[]; // append-only; state = fold(log)
  status: "lobby" | "active" | "finished";
  winner: PlayerId | null;
};

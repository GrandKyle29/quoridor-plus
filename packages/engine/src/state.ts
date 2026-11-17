import type { GameConfig } from "./config";
import type { Move, Player, PlayerId, Wall } from "./types";

export type GameState = {
  config: GameConfig;
  players: Player[];
  walls: Wall[];
  turnIndex: number; // whose turn (index into players)
  moveLog: Move[]; // append-only; state = fold(log)
  moveCount?: number; // monotonic count of applied moves (replay ordering)
  status: "lobby" | "active" | "finished";
  winner: PlayerId | null;
  sharedWallsRemaining?: number; // <-- ADD this, only used when wallPool === "shared"
  sharedWallsPerTeam?: { A: number; B: number }; // <-- ADD
  createdAt?: string; // <-- NEW: ISO timestamp set at game creation
};

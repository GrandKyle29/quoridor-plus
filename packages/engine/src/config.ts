export type GoalCondition = "opposite-edge" | "center" | "top";
export type TurnOrder = "clockwise" | "reverse-score";
export type WallPool = "per-player" | "shared";

export type GameConfig = {
  schemaVersion: 3;
  boardSize: number; // odd, e.g. 9
  minPlayers: number;
  maxPlayers: number;
  startingWalls: number | "scaled"; // "scaled" = derived from player count
  wallPool: WallPool;
  goalCondition: GoalCondition;
  allowDiagonalJumps: boolean;
  lenientJumps?: boolean; // NEW: if true, diagonal jumps are always available (not just as fallback)
  mustNotBlockPath: boolean; // your Classic-mode rule, now a flag
  elimination: boolean;
  turnOrder: TurnOrder;
  randomizeSpawns?: boolean; // <-- ADD THIS
};

export type TurnOrder = "clockwise" | "reverse-score";
export type GoalCondition = "opposite-edge" | "center" | "top";
export type WallPool = "per-player" | "shared" | "team";
export type TeamWinCondition = "any" | "all";

export type GameConfig = {
  schemaVersion: 4;
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
  // --- Team mode (optional) ---
  useTeams?: boolean; // if true, auto-assign evens to A, odds to B
  teamAIsEven?: boolean; // default true; swap to give "even" players to B
  teamWinCondition?: TeamWinCondition; // default "all"
  // --- Explicit team assignment overrides useTeams ---
  teams?: { [playerId: string]: "A" | "B" };
};

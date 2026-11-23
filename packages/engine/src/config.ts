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
  // Turn order for team games.
  // "seat" (default): turns follow seat order, so teammates can take several
  // turns in a row. "alternating": the two team rosters are interleaved
  // (A,B,A,B,…) so turns belong to different teams, except for one unavoidable
  // same-team pair in odd lobbies. Defaults to "seat" so games and share codes
  // written before this option existed replay with the order they were played.
  teamTurnOrder?: "seat" | "alternating"; // default "seat"
  // --- Explicit team assignment overrides useTeams ---
  teams?: { [playerId: string]: "A" | "B" };
};

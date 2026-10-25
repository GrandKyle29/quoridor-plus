export type GoalCondition = "opposite-edge" | "any-edge" | "collect-n";
export type TurnOrder = "clockwise" | "reverse-score";
export type WallPool = "per-player" | "shared";

export type GameConfig = {
  schemaVersion: 1;
  boardSize: number; // odd, e.g. 9
  minPlayers: number;
  maxPlayers: number;
  startingWalls: number | "scaled"; // "scaled" = derived from player count
  wallPool: WallPool;
  goalCondition: GoalCondition;
  allowDiagonalJumps: boolean;
  mustNotBlockPath: boolean; // your Classic-mode rule, now a flag
  elimination: boolean;
  turnOrder: TurnOrder;
};

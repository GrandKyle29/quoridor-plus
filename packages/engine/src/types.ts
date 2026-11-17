export type Coord = { x: number; y: number };

export type PlayerId = string; // e.g. "p0", "p1" — guest name lives separately

export type EliminationReason = "left" | "kicked" | "resigned";

export type Player = {
  id: PlayerId;
  name: string;
  position: Coord;
  wallsRemaining: number;
  connected: boolean;
  eliminated: boolean;
  eliminationReason?: EliminationReason; // why the pawn left the board
  startIndex?: number; // <-- ADD THIS
  color?: string; // <-- Add this
  finished?: boolean; // <-- ADD
};

export type Orientation = "horizontal" | "vertical";

export type Wall = {
  coord: Coord;
  orientation: Orientation;
  placedBy?: string; // NEW: Who placed it (e.g., "p0")
};

export type Move =
  | { kind: "move"; to: Coord }
  | { kind: "wall"; wall: Wall }
  | { kind: "skip" } // <-- NEW;
  | {
      kind: "eliminate";
      playerId: PlayerId;
      reason?: EliminationReason; // defaults to "left"
    }; // player is out: pawn removed

export type Coord = { x: number; y: number };

export type PlayerId = string; // e.g. "p0", "p1" — guest name lives separately

export type Player = {
  id: PlayerId;
  name: string;
  position: Coord;
  wallsRemaining: number;
  connected: boolean; // for later — reconnection, spectators
  eliminated: boolean;
};

export type Orientation = "horizontal" | "vertical";

export type Wall = {
  coord: Coord; // anchor point on the grid
  orientation: Orientation;
};

export type Move = { kind: "move"; to: Coord } | { kind: "wall"; wall: Wall };

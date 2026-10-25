import type { GameConfig } from "./config";
import type { GameState } from "./state";
import type { Coord, Player } from "./types";

export function getStartPositions(count: number, size: number): Coord[] {
  const mid = Math.floor(size / 2);
  const max = size - 1;

  // 2 players: classic bottom and top
  if (count === 2) {
    return [
      { x: mid, y: 0 },
      { x: mid, y: max },
    ];
  }

  // 4 players: all four edges
  if (count === 4) {
    return [
      { x: mid, y: 0 }, // bottom
      { x: 0, y: mid }, // left
      { x: mid, y: max }, // top
      { x: max, y: mid }, // right
    ];
  }

  // 3 players: bottom, top-left, top-right
  if (count === 3) {
    return [
      { x: mid, y: 0 }, // bottom
      { x: 0, y: max }, // top-left
      { x: max, y: max }, // top-right
    ];
  }

  throw new Error("Player count must be 2, 3, or 4");
}

export function createGame(
  config: GameConfig,
  playerNames: string[],
): GameState {
  const startPositions = getStartPositions(
    playerNames.length,
    config.boardSize,
  );

  const startingWalls =
    config.startingWalls === "scaled"
      ? Math.max(3, 10 - playerNames.length) // just a placeholder logic for now
      : config.startingWalls;

  const players: Player[] = playerNames.map((name, index) => ({
    id: `p${index}`,
    name,
    position: startPositions[index]!,
    wallsRemaining: startingWalls,
    connected: true,
    eliminated: false,
  }));

  return {
    config,
    players,
    walls: [],
    turnIndex: 0,
    moveLog: [],
    status: "active",
    winner: null,
  };
}

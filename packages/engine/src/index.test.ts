import { describe, it, expect } from "vitest";
import { createGame } from "./index";
import type { GameConfig } from "./config";

const classicConfig: GameConfig = {
  schemaVersion: 1,
  boardSize: 9,
  minPlayers: 2,
  maxPlayers: 4,
  startingWalls: 10,
  wallPool: "per-player",
  goalCondition: "opposite-edge",
  allowDiagonalJumps: true,
  mustNotBlockPath: true,
  elimination: false,
  turnOrder: "clockwise",
};

describe("createGame", () => {
  it("sets up a 2-player game correctly", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);

    // 2 players
    expect(state.players.length).toBe(2);

    // Alice is at the bottom center
    expect(state.players[0]?.name).toBe("Alice");
    expect(state.players[0]?.position).toEqual({ x: 4, y: 0 });

    // Bob is at the top center
    expect(state.players[1]?.name).toBe("Bob");
    expect(state.players[1]?.position).toEqual({ x: 4, y: 8 });

    // 10 walls each
    expect(state.players[0]?.wallsRemaining).toBe(10);

    // It's Alice's turn, game is active, no winner
    expect(state.turnIndex).toBe(0);
    expect(state.status).toBe("active");
    expect(state.winner).toBeNull();
  });

  it("sets up a 4-player game correctly", () => {
    const state = createGame(classicConfig, ["P1", "P2", "P3", "P4"]);

    expect(state.players.length).toBe(4);
    expect(state.players[0]?.position).toEqual({ x: 4, y: 0 }); // bottom
    expect(state.players[1]?.position).toEqual({ x: 0, y: 4 }); // left
    expect(state.players[2]?.position).toEqual({ x: 4, y: 8 }); // top
    expect(state.players[3]?.position).toEqual({ x: 8, y: 4 }); // right
  });
});

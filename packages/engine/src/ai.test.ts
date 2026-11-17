import { describe, it, expect } from "vitest";
import { createGame, legalMoves } from "./index";
import { evaluate, evaluateMoveDelta, getBestMove } from "./ai";
import type { GameConfig } from "./config";
import type { GameState } from "./state";
import type { Move } from "./types";

const baseConfig: GameConfig = {
  schemaVersion: 4,
  boardSize: 9,
  minPlayers: 2,
  maxPlayers: 8,
  startingWalls: 10,
  wallPool: "per-player",
  goalCondition: "opposite-edge",
  allowDiagonalJumps: true,
  mustNotBlockPath: true,
  elimination: false,
  turnOrder: "clockwise",
  randomizeSpawns: false,
};

const teamConfig = (teamWinCondition: "any" | "all"): GameConfig => ({
  ...baseConfig,
  maxPlayers: 4,
  useTeams: true,
  teamWinCondition,
  teams: { p0: "A", p1: "B", p2: "A", p3: "B" },
});

const teamGame = (teamWinCondition: "any" | "all") =>
  createGame(teamConfig(teamWinCondition), ["A1", "B1", "A2", "B2"]);

function withWinner(state: GameState, winner: string): GameState {
  return { ...state, status: "finished", winner };
}

function movePlayer(state: GameState, id: string, y: number) {
  const player = state.players.find((p) => p.id === id)!;
  player.position = { x: player.position.x, y };
}

describe("bot team awareness", () => {
  it("treats a teammate's win as its own win", () => {
    // p2 is on p0's team, so the same finished state is a win for both.
    const state = withWinner(teamGame("any"), "p2");

    expect(evaluate(state, "p0")).toBe(10000);
    expect(evaluate(state, "p1")).toBe(-10000);
  });

  it("keeps free-for-all wins personal", () => {
    const state = withWinner(
      createGame({ ...baseConfig, maxPlayers: 2 }, ["A", "B"]),
      "p1",
    );

    expect(evaluate(state, "p0")).toBe(-10000);
  });

  it("counts a teammate's progress in all-must-finish games", () => {
    const state = teamGame("all");
    const before = evaluate(state, "p0");

    // Team A's goal is the far edge, so one step forward shortens the distance.
    movePlayer(state, "p2", state.players[2]!.position.y + 1);

    expect(evaluate(state, "p0")).toBeGreaterThan(before);
  });

  it("counts the team's best runner in first-to-finish games", () => {
    const state = teamGame("any");
    const before = evaluate(state, "p0");

    movePlayer(state, "p2", state.players[2]!.position.y + 1);

    expect(evaluate(state, "p0")).toBeGreaterThan(before);
  });

  it("walks into the goal even when the rest of the team is far behind", () => {
    // Team A starts on y = 0 and finishes on the far edge, so p0 is one step
    // away while its teammate is still near the start. Finishing must pay off:
    // dropping the bot's own distance out of a team average used to make the
    // score worse, and the bots wandered around instead of going home.
    const state = teamGame("all");
    state.players[0]!.position = { x: 0, y: 7 };
    state.players[2]!.position = { x: 5, y: 0 };
    state.turnIndex = 0;

    const finish: Move = { kind: "move", to: { x: 0, y: 8 } };
    expect(evaluateMoveDelta(state, finish, "p0")).toBeGreaterThan(0);

    const move = getBestMove(state, 400, 11);
    expect(move).toMatchObject({ kind: "move", to: { x: 0, y: 8 } });
  });

  it("does not panic about a teammate who is about to win", () => {
    const state = teamGame("all");
    // Team A (p0/p2) finishes on the far edge, team B (p1/p3) on the near edge.
    movePlayer(state, "p2", 7); // one move from team A's goal
    movePlayer(state, "p3", 1); // one move from team B's goal

    const allyToMove: GameState = { ...state, turnIndex: 2 };
    const enemyToMove: GameState = { ...state, turnIndex: 3 };

    // The enemy panic penalty must only apply to the enemy's turn.
    expect(
      evaluate(allyToMove, "p0") - evaluate(enemyToMove, "p0"),
    ).toBeCloseTo(500);
  });
});

describe("bot randomness", () => {
  it("never plays a wall that slows nobody while it can advance", () => {
    const state = createGame({ ...baseConfig, maxPlayers: 2 }, [
      "You",
      "Bot 1",
    ]);

    for (const seed of [3, 9, 42]) {
      const move = getBestMove(state, 200, seed);
      if (move.kind === "wall") {
        expect(evaluateMoveDelta(state, move, "p0")).toBeGreaterThan(0);
      }
    }
  });

  it("always picks a legal move, whatever the seed", () => {
    const state = createGame({ ...baseConfig, maxPlayers: 2 }, [
      "You",
      "Bot 1",
    ]);
    const legal = legalMoves(state);

    for (const seed of [1, 7, 12345]) {
      const move = getBestMove(state, 150, seed);
      expect(legal).toContainEqual(move);
    }
  });
});

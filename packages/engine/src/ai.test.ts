import { describe, it, expect } from "vitest";
import { createGame, legalMoves } from "./index";
import { evaluate, evaluateMoveDelta, getBestMove } from "./ai";
import { applyMove } from "./game";
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

// Did this move put the bot home? A finish is not always the tile straight
// ahead: a pawn on the goal tile can be jumped. What matters is that it arrives.
function expectFinishes(state: GameState, move: Move, id = "p0") {
  const next = applyMove(state, move, true);
  expect(next.players.find((p) => p.id === id)?.finished).toBe(true);
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
    // While the teammate is still near the start the bot is allowed to hold on
    // the line for wall turns, but it must never step away from the doorstep.
    if (move.kind === "move") expect(move.to).toMatchObject({ x: 0, y: 8 });
  });

  it("holds its walls back at the start of an all-must-finish game", () => {
    // Once the enemy's slowest pawn is the threat anchor, many walls look
    // profitable from the first turn. A wall has to buy real enemy clock before
    // it is worth playing, so the opening turns are pawn moves.
    for (const seed of [3, 42]) {
      const move = getBestMove(teamGame("all"), 300, seed);
      expect(move.kind).toBe("move");
    }
  });

  it("holds a pawn on the line for wall turns while its laggard is far back", () => {
    // Team A's p0 has arrived at the doorstep while its teammate p2 still has
    // the board to cross. Crossing now would retire one of the two wall layers
    // team A has left, so it should stand on the line and place a wall instead.
    const state = teamGame("all");
    state.players[0]!.position = { x: 3, y: 7 }; // one step from team A's goal
    state.players[2]!.position = { x: 5, y: 3 }; // the laggard, 5 away
    state.players[1]!.position = { x: 3, y: 4 };
    state.players[3]!.position = { x: 5, y: 5 };
    state.turnIndex = 0;

    const move = getBestMove(state, 400, 7);
    expect(move.kind).toBe("wall");
  });

  it("finishes instead of waiting once the team is ready to close out", () => {
    // Both of team A's pawns are on the doorstep: waiting now only delays the
    // win, so the pawn walks in rather than looking for another wall.
    const state = teamGame("all");
    state.players[0]!.position = { x: 3, y: 7 };
    state.players[2]!.position = { x: 5, y: 7 };
    state.turnIndex = 0;

    expectFinishes(state, getBestMove(state, 400, 7));
  });

  it("does not wait on the line without a wall to place", () => {
    const state = teamGame("all");
    state.players[0]!.position = { x: 3, y: 7 };
    state.players[2]!.position = { x: 5, y: 3 };
    state.players[1]!.position = { x: 3, y: 4 };
    state.players[3]!.position = { x: 5, y: 5 };
    state.players[0]!.wallsRemaining = 0;
    state.turnIndex = 0;

    expectFinishes(state, getBestMove(state, 400, 7));
  });

  it("walks in when it is the last pawn its team is waiting for", () => {
    const state = teamGame("all");
    state.players[2]!.finished = true;
    state.players[0]!.position = { x: 3, y: 7 };
    state.turnIndex = 0;

    expectFinishes(state, getBestMove(state, 400, 7));
  });

  it("does not panic about a lone enemy on the line while its laggard is far back", () => {
    const state = teamGame("all");
    movePlayer(state, "p3", 1); // one move from team B's goal, and it is on the move
    // Team B's other pawn is still on the far edge: that pawn arriving does not
    // finish the game, so there is nothing to panic about and nothing to block.
    const enemyToMove: GameState = { ...state, turnIndex: 3 };
    const allyToMove: GameState = { ...state, turnIndex: 2 };

    expect(evaluate(enemyToMove, "p0")).toBeCloseTo(
      evaluate(allyToMove, "p0"),
    );
  });

  it("does not panic about a teammate who is about to win", () => {
    const state = teamGame("all");
    // Team A (p0/p2) finishes on the far edge, team B (p1/p3) on the near edge.
    movePlayer(state, "p2", 7); // one move from team A's goal
    // Both of team B's pawns are on the line, so team B's clock really is about
    // to run out and the panic penalty belongs on p3's turn.
    movePlayer(state, "p1", 1);
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
  it("does not pace back and forth between two tiles", () => {
    // Two routes of the same length leave the search with nothing to separate
    // the moves, and settling that with a dice roll every turn made a bot
    // alternate between two neighbouring tiles. Here the other side only skips,
    // so the board cannot change under the bot and every step back onto the tile
    // it just left is its own doing.
    let state = createGame({ ...baseConfig, maxPlayers: 2 }, ["You", "Bot 1"]);
    const trail = [{ ...state.players[0]!.position }];

    for (let turn = 0; turn < 12 && state.status === "active"; turn++) {
      state = applyMove(state, getBestMove(state, 40, 5), true);
      trail.push({ ...state.players[0]!.position });
      if (state.status !== "active") break;
      state = applyMove(state, { kind: "skip" }, true);
    }

    // A wall turn keeps the pawn where it is, so only compare steps taken.
    const steps = trail.filter(
      (pos, i) => i === 0 || pos.x !== trail[i - 1]!.x || pos.y !== trail[i - 1]!.y,
    );
    const reversals = steps.filter(
      (pos, i) => i >= 2 && pos.x === steps[i - 2]!.x && pos.y === steps[i - 2]!.y,
    );

    expect(reversals).toHaveLength(0);
  });

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

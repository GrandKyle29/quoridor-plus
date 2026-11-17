import { describe, it, expect } from "vitest";
import { applyMove, createGame, legalMoves } from "./index";
import { decodeMove, decodeMoves, encodeMove, encodeMoves } from "./encoding";
import type { GameConfig } from "./config";
import type { Move } from "./types";

const config: GameConfig = {
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

const newGame = (names: string[]) => createGame(config, names);

describe("player elimination", () => {
  it("removes the pawn and passes the turn when the eliminated player was up", () => {
    const state = newGame(["Alice", "Bob", "Carol"]);
    state.turnIndex = 1;

    const next = applyMove(state, { kind: "eliminate", playerId: "p1" });

    expect(next.players[1]!.eliminated).toBe(true);
    expect(next.turnIndex).toBe(2);
    expect(next.status).toBe("active");
    expect(next.moveLog).toContainEqual({
      kind: "eliminate",
      playerId: "p1",
    });
  });

  it("skips eliminated players when the turn advances", () => {
    const state = newGame(["Alice", "Bob", "Carol"]);
    state.players[1]!.eliminated = true;

    const next = applyMove(state, { kind: "move", to: { x: 4, y: 1 } });

    expect(next.turnIndex).toBe(2);
  });

  it("leaves the dead pawn's square empty for movement", () => {
    const state = newGame(["Alice", "Bob"]);
    state.players[1]!.position = { x: 4, y: 1 };
    state.players[1]!.eliminated = true;

    const pawnMoves = legalMoves(state).filter((m) => m.kind === "move");

    expect(pawnMoves).toContainEqual({ kind: "move", to: { x: 4, y: 1 } });
    expect(pawnMoves).not.toContainEqual({ kind: "move", to: { x: 4, y: 2 } });
  });

  it("ignores dead players when validating wall placements", () => {
    const state = newGame(["Alice", "Bob"]);
    const dead = state.players[1]!;
    dead.eliminated = true;
    dead.position = { x: 8, y: 8 };
    // Seal the dead pawn into the corner so it can no longer reach its goal.
    state.walls.push({ coord: { x: 7, y: 7 }, orientation: "horizontal" });
    state.walls.push({ coord: { x: 7, y: 7 }, orientation: "vertical" });

    const wallMoves = legalMoves(state).filter((m) => m.kind === "wall");

    expect(wallMoves.length).toBeGreaterThan(0);
  });

  it("ends a two-player game when one player is eliminated", () => {
    const state = newGame(["Alice", "Bob"]);

    const next = applyMove(state, { kind: "eliminate", playerId: "p1" });

    expect(next.status).toBe("finished");
    expect(next.winner).toBe("p0");
  });

  it("is idempotent for an already-eliminated player", () => {
    const state = newGame(["Alice", "Bob", "Carol"]);

    const once = applyMove(state, { kind: "eliminate", playerId: "p1" });
    const twice = applyMove(once, { kind: "eliminate", playerId: "p1" });

    expect(twice.players[1]!.eliminated).toBe(true);
    expect(twice.status).toBe("active");
  });

  it("records why a player is out, including resignation", () => {
    const state = newGame(["Alice", "Bob", "Carol"]);

    const next = applyMove(state, {
      kind: "eliminate",
      playerId: "p1",
      reason: "resigned",
    });

    expect(next.players[1]!.eliminated).toBe(true);
    expect(next.players[1]!.eliminationReason).toBe("resigned");
    expect(next.turnIndex).toBe(0);
  });

  it("ends a team game on any elimination and awards the other team", () => {
    const teamConfig: GameConfig = {
      ...config,
      maxPlayers: 4,
      useTeams: true,
      teamWinCondition: "all",
      teams: { p0: "A", p1: "B", p2: "A", p3: "B" },
    };
    const state = createGame(teamConfig, ["A1", "B1", "A2", "B2"]);

    const next = applyMove(state, { kind: "eliminate", playerId: "p1" });

    expect(next.status).toBe("finished");
    expect(next.winner).not.toBeNull();
    expect(next.config.teams?.[next.winner!]).toBe("A");
    expect(next.players.find((p) => p.id === next.winner)?.eliminated).toBe(
      false,
    );
  });

  it("roundtrips eliminations and resignations through the encoding", () => {
    const moves: Move[] = [
      { kind: "move", to: { x: 4, y: 1 } },
      { kind: "eliminate", playerId: "p2" },
      { kind: "skip" },
      { kind: "eliminate", playerId: "p0" },
      { kind: "eliminate", playerId: "p1", reason: "resigned" },
    ];

    expect(encodeMove({ kind: "eliminate", playerId: "p3" })).toBe("e3");
    expect(decodeMove("e3")).toEqual({ kind: "eliminate", playerId: "p3" });
    expect(
      encodeMove({ kind: "eliminate", playerId: "p1", reason: "resigned" }),
    ).toBe("r1");
    expect(decodeMove("r1")).toEqual({
      kind: "eliminate",
      playerId: "p1",
      reason: "resigned",
    });
    expect(decodeMoves(encodeMoves(moves))).toEqual(moves);
  });
});

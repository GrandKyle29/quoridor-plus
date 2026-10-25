import { describe, it, expect } from "vitest";
import { createGame, legalMoves } from "./index";
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

describe("legalMoves - pawn movement", () => {
  it("returns standard moves for a player in the middle", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 4, y: 4 };

    const moves = legalMoves(state);
    // FILTER: only look at pawn moves
    const pawnMoves = moves.filter((m) => m.kind === "move");

    expect(pawnMoves.length).toBe(4); // Now this will pass!
    expect(pawnMoves).toContainEqual({ kind: "move", to: { x: 4, y: 5 } });
    expect(pawnMoves).toContainEqual({ kind: "move", to: { x: 4, y: 3 } });
    expect(pawnMoves).toContainEqual({ kind: "move", to: { x: 5, y: 4 } });
    expect(pawnMoves).toContainEqual({ kind: "move", to: { x: 3, y: 4 } });
  });

  it("does not allow moving off the board", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    // Alice is at {x: 4, y: 0} (bottom edge) by default
    const moves = legalMoves(state);
    const pawnMoves = moves.filter((m) => m.kind === "move");

    expect(pawnMoves).not.toContainEqual({ kind: "move", to: { x: 4, y: -1 } });
    expect(pawnMoves.length).toBe(3); // Up, Left, Right
  });

  it("allows jumping over an opponent", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 4, y: 4 }; // Alice
    state.players[1]!.position = { x: 4, y: 5 }; // Bob (directly above Alice)

    const moves = legalMoves(state);

    // Alice should be able to jump to {x: 4, y: 6}
    expect(moves).toContainEqual({ kind: "move", to: { x: 4, y: 6 } });
    // Alice should NOT be able to move to {x: 4, y: 5} (Bob's spot)
    expect(moves).not.toContainEqual({ kind: "move", to: { x: 4, y: 5 } });
  });

  it("allows diagonal jumps when blocked", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 4, y: 4 }; // Alice
    state.players[1]!.position = { x: 4, y: 5 }; // Bob

    // Let's put Alice near the top edge so she can't jump straight over Bob
    // wait, y: 5 is not near the top. Let's move them:
    state.players[0]!.position = { x: 4, y: 7 }; // Alice
    state.players[1]!.position = { x: 4, y: 8 }; // Bob (at the top edge)

    // Board size is 9, so y: 8 is the max. Jumping straight over Bob would be y: 9 (off board).
    const moves = legalMoves(state);

    // Alice should be able to jump diagonally to {x: 3, y: 8} or {x: 5, y: 8}
    expect(moves).toContainEqual({ kind: "move", to: { x: 3, y: 8 } });
    expect(moves).toContainEqual({ kind: "move", to: { x: 5, y: 8 } });
  });
});

describe("legalMoves - wall placements", () => {
  it("does not allow walls to hang off the board", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 4, y: 4 }; // move away to avoid blocking pawns
    const moves = legalMoves(state);

    // Horizontal wall at x: 8 (boardSize is 9, so max anchor is 7)
    const badHWall = {
      kind: "wall" as const,
      wall: { coord: { x: 8, y: 4 }, orientation: "horizontal" as const },
    };
    expect(moves).not.toContainEqual(badHWall);
  });

  it("does not allow overlapping walls", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 4, y: 4 };
    // Manually add a wall to the state
    state.walls.push({ coord: { x: 4, y: 4 }, orientation: "horizontal" });

    const moves = legalMoves(state);

    // Exact same wall should be illegal
    const exactWall = {
      kind: "wall" as const,
      wall: { coord: { x: 4, y: 4 }, orientation: "horizontal" as const },
    };
    expect(moves).not.toContainEqual(exactWall);

    // Crossing wall should be illegal
    const crossWall = {
      kind: "wall" as const,
      wall: { coord: { x: 4, y: 4 }, orientation: "vertical" as const },
    };
    expect(moves).not.toContainEqual(crossWall);

    // Partial overlap should be illegal (shifted by 1 on x)
    const partialWall = {
      kind: "wall" as const,
      wall: { coord: { x: 5, y: 4 }, orientation: "horizontal" as const },
    };
    expect(moves).not.toContainEqual(partialWall);
  });

  it("allows valid walls near existing ones", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 4, y: 4 };
    state.walls.push({ coord: { x: 4, y: 4 }, orientation: "horizontal" });

    const moves = legalMoves(state);

    // A wall right next to it (x: 6) should be valid
    const validWall = {
      kind: "wall" as const,
      wall: { coord: { x: 6, y: 4 }, orientation: "horizontal" as const },
    };
    expect(moves).toContainEqual(validWall);
  });
});

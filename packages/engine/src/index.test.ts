import { describe, it, expect } from "vitest";
import { createGame, legalMoves, applyMove } from "./index";
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
    expect(state.players[0]?.position).toEqual({ x: 4, y: 0 }); // P0: bottom
    expect(state.players[1]?.position).toEqual({ x: 4, y: 8 }); // P1: top
    expect(state.players[2]?.position).toEqual({ x: 0, y: 4 }); // P2: left
    expect(state.players[3]?.position).toEqual({ x: 8, y: 4 }); // P3: right
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
  it("does not allow diagonal jumps if a straight jump is available", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 4, y: 4 }; // Alice
    state.players[1]!.position = { x: 5, y: 4 }; // Bob (to the right)

    const moves = legalMoves(state).filter((m) => m.kind === "move");

    // Alice should be able to jump straight over Bob to {6,4}
    expect(moves).toContainEqual({ kind: "move", to: { x: 6, y: 4 } });

    // Alice should NOT be able to jump diagonally to {5,5} or {5,3}
    expect(moves).not.toContainEqual({ kind: "move", to: { x: 5, y: 5 } });
    expect(moves).not.toContainEqual({ kind: "move", to: { x: 5, y: 3 } });
  });
  it("does not allow moving through a wall", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 4, y: 4 };
    // Place horizontal wall at x:4, y:4 (blocks y:4 to y:5)
    state.walls.push({ coord: { x: 4, y: 4 }, orientation: "horizontal" });

    const moves = legalMoves(state).filter((m) => m.kind === "move");

    // Alice should NOT be able to move Up to y:5
    expect(moves).not.toContainEqual({ kind: "move", to: { x: 4, y: 5 } });
    // But she can still move Down
    expect(moves).toContainEqual({ kind: "move", to: { x: 4, y: 3 } });
  });

  it("does not allow jumping over an opponent if blocked by a wall behind them", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 4, y: 4 }; // Alice
    state.players[1]!.position = { x: 4, y: 5 }; // Bob
    // Place horizontal wall at x:4, y:5 (blocks y:5 to y:6)
    state.walls.push({ coord: { x: 4, y: 5 }, orientation: "horizontal" });

    const moves = legalMoves(state).filter((m) => m.kind === "move");

    // Alice should NOT be able to jump to y:6
    expect(moves).not.toContainEqual({ kind: "move", to: { x: 4, y: 6 } });
    // But she can still diagonal jump left or right
    expect(moves).toContainEqual({ kind: "move", to: { x: 3, y: 5 } });
    expect(moves).toContainEqual({ kind: "move", to: { x: 5, y: 5 } });
  });
  it("allows chain jumping over multiple players in a straight line", () => {
    const state = createGame(classicConfig, ["P1", "P2", "P3", "P4"]);
    // Set up a line: P1 -> P2 -> P3 -> empty
    state.players[0]!.position = { x: 4, y: 4 }; // P1
    state.players[1]!.position = { x: 5, y: 4 }; // P2
    state.players[2]!.position = { x: 6, y: 4 }; // P3
    state.players[3]!.position = { x: 0, y: 0 }; // P4 (out of the way)

    const moves = legalMoves(state).filter((m) => m.kind === "move");

    // P1 should be able to jump over P2 to land at 6,4 (but P3 is there)
    // P1 should be able to jump over P2 AND P3 to land at 7,4
    expect(moves).toContainEqual({ kind: "move", to: { x: 7, y: 4 } });
  });

  it("allows chain jumping and fallback to diagonals if blocked", () => {
    const state = createGame(classicConfig, ["P1", "P2", "P3", "P4"]);
    state.players[0]!.position = { x: 4, y: 4 }; // P1
    state.players[1]!.position = { x: 5, y: 4 }; // P2
    state.players[2]!.position = { x: 6, y: 4 }; // P3
    state.players[3]!.position = { x: 0, y: 0 };

    // Place a wall behind P3 so the straight chain jump is blocked
    state.walls.push({ coord: { x: 6, y: 4 }, orientation: "vertical" });

    const moves = legalMoves(state).filter((m) => m.kind === "move");

    // P1 cannot jump to 7,4
    expect(moves).not.toContainEqual({ kind: "move", to: { x: 7, y: 4 } });
    // But P1 CAN jump to the diagonal of P3 (6,5) and (6,3)
    expect(moves).toContainEqual({ kind: "move", to: { x: 6, y: 5 } });
    expect(moves).toContainEqual({ kind: "move", to: { x: 6, y: 3 } });
  });
  it("does not allow diagonal jumping if the corner is blocked by a wall", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 4, y: 4 }; // Alice
    state.players[1]!.position = { x: 4, y: 5 }; // Bob

    // Block the jump behind Bob
    state.walls.push({ coord: { x: 4, y: 5 }, orientation: "horizontal" });
    // Block the corner to the right: vertical wall at x:4, y:4 (blocks x:4 to x:5 for y:4 to y:5)
    state.walls.push({ coord: { x: 4, y: 4 }, orientation: "vertical" });

    const moves = legalMoves(state).filter((m) => m.kind === "move");

    // Alice cannot jump diagonally to {x: 5, y: 5} because the right corner is blocked
    expect(moves).not.toContainEqual({ kind: "move", to: { x: 5, y: 5 } });
    // But she CAN jump diagonally left to {x: 3, y: 5} (corner is clear)
    expect(moves).toContainEqual({ kind: "move", to: { x: 3, y: 5 } });
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

  it("does not allow walls to cross in the middle", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    state.players[0]!.position = { x: 0, y: 0 };

    // Place a horizontal wall at 4,4
    state.walls.push({ coord: { x: 4, y: 4 }, orientation: "horizontal" });

    const moves = legalMoves(state);

    // V(4,4) forms a + shape. ILLEGAL.
    const crossWall = {
      kind: "wall" as const,
      wall: { coord: { x: 4, y: 4 }, orientation: "vertical" as const },
    };
    expect(moves).not.toContainEqual(crossWall);

    // V(6,4) touches the end of H(4,4). LEGAL.
    const cornerWall = {
      kind: "wall" as const,
      wall: { coord: { x: 6, y: 4 }, orientation: "vertical" as const },
    };
    expect(moves).toContainEqual(cornerWall);
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

  it("does not allow a wall that completely blocks the only path", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);

    // 1. Put Alice at {x: 1, y: 1}
    state.players[0]!.position = { x: 1, y: 1 };

    // 2. Build 3 sides of a box around her:
    // Bottom wall (blocks y:0 to y:1 for x:0 to x:1)
    state.walls.push({ coord: { x: 0, y: 0 }, orientation: "horizontal" });
    // Left wall (blocks x:0 to x:1 for y:1 to y:2)
    state.walls.push({ coord: { x: 0, y: 1 }, orientation: "vertical" });
    // Right wall (blocks x:1 to x:2 for y:0 to y:1)
    state.walls.push({ coord: { x: 1, y: 0 }, orientation: "vertical" });

    // Alice is now in a U-shape, and can only move UP.
    const moves = legalMoves(state);

    // 3. The final wall to close the box (blocks y:1 to y:2 for x:1 to x:2)
    const trapWall = {
      kind: "wall" as const,
      wall: { coord: { x: 1, y: 1 }, orientation: "horizontal" as const },
    };

    // The trap wall should NOT be in the list of moves!
    expect(moves).not.toContainEqual(trapWall);

    // But a wall further away should be valid
    const validWall = {
      kind: "wall" as const,
      wall: { coord: { x: 2, y: 1 }, orientation: "horizontal" as const },
    };
    expect(moves).toContainEqual(validWall);
  });
});

describe("applyMove", () => {
  it("throws an error for an illegal move", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    // Alice is at {x: 4, y: 0}. Moving to y:2 is illegal (jump over nothing)
    expect(() => {
      applyMove(state, { kind: "move", to: { x: 4, y: 2 } });
    }).toThrow("Illegal move");
  });

  it("updates position and advances the turn on a pawn move", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    // Alice moves Up
    const nextState = applyMove(state, { kind: "move", to: { x: 4, y: 1 } });

    expect(nextState.players[0]!.position).toEqual({ x: 4, y: 1 });
    expect(nextState.turnIndex).toBe(1); // It is now Bob's turn
    expect(state.players[0]!.position).toEqual({ x: 4, y: 0 }); // Original state is untouched!
  });

  it("places a wall and decrements wallsRemaining", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);
    const wallMove = {
      kind: "wall" as const,
      wall: { coord: { x: 0, y: 0 }, orientation: "horizontal" as const },
    };

    const nextState = applyMove(state, wallMove);

    expect(nextState.walls.length).toBe(1);
    expect(nextState.players[0]!.wallsRemaining).toBe(9);
    expect(nextState.turnIndex).toBe(1); // It is now Bob's turn
  });

  it("declares a winner when a player reaches the goal edge", () => {
    const state = createGame(classicConfig, ["Alice", "Bob"]);

    // Manually move Alice near the top edge
    state.players[0]!.position = { x: 4, y: 7 };
    // Move Bob out of the way so he doesn't block the winning square
    state.players[1]!.position = { x: 0, y: 0 };

    // Alice moves to y: 8 (the winning edge)
    const nextState = applyMove(state, { kind: "move", to: { x: 4, y: 8 } });

    expect(nextState.status).toBe("finished");
    expect(nextState.winner).toBe("p0"); // Alice's ID
    expect(nextState.turnIndex).toBe(0); // Turn did not advance
  });
});

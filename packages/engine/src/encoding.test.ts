import { describe, it, expect } from "vitest";
import { encodeMove, decodeMove, encodeMoves, decodeMoves } from "./encoding";
import type { Move } from "./types";

describe("move encoding", () => {
  it("roundtrips a pawn move", () => {
    const move: Move = { kind: "move", to: { x: 4, y: 5 } };
    expect(decodeMove(encodeMove(move))).toEqual(move);
  });

  it("roundtrips a horizontal wall", () => {
    const move: Move = {
      kind: "wall",
      wall: { coord: { x: 3, y: 7 }, orientation: "horizontal" },
    };
    expect(decodeMove(encodeMove(move))).toEqual(move);
  });

  it("roundtrips a vertical wall", () => {
    const move: Move = {
      kind: "wall",
      wall: { coord: { x: 10, y: 2 }, orientation: "vertical" },
    };
    expect(decodeMove(encodeMove(move))).toEqual(move);
  });

  it("handles coordinates 10+ (base 36)", () => {
    const move: Move = { kind: "move", to: { x: 10, y: 11 } };
    const encoded = encodeMove(move);
    expect(encoded).toBe("mab"); // 10 = 'a', 11 = 'b'
    expect(decodeMove(encoded)).toEqual(move);
  });

  it("roundtrips a full list of moves", () => {
    const moves: Move[] = [
      { kind: "move", to: { x: 4, y: 1 } },
      {
        kind: "wall",
        wall: { coord: { x: 3, y: 3 }, orientation: "horizontal" },
      },
      { kind: "move", to: { x: 4, y: 2 } },
    ];
    expect(decodeMoves(encodeMoves(moves))).toEqual(moves);
  });
});

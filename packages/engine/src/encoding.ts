import type { Move } from "./types";

const CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

function coordToChar(n: number): string {
  if (n < 0 || n > 35) throw new Error(`Coordinate ${n} out of range`);
  return CHARS[n]!;
}

function charToCoord(c: string): number {
  const i = CHARS.indexOf(c);
  if (i < 0) throw new Error(`Invalid coordinate char: ${c}`);
  return i;
}

export function encodeMove(move: Move): string {
  if (move.kind === "move") {
    return `m${coordToChar(move.to.x)}${coordToChar(move.to.y)}`;
  }
  if (move.kind === "wall") {
    const prefix = move.wall.orientation === "horizontal" ? "h" : "v";
    return `${prefix}${coordToChar(move.wall.coord.x)}${coordToChar(move.wall.coord.y)}`;
  }
  if (move.kind === "skip") return "s";
  throw new Error("Unknown move kind");
}

export function decodeMove(s: string): Move {
  if (s === "s") return { kind: "skip" };

  if (s.length !== 3) throw new Error(`Invalid move string: ${s}`);
  const kind = s[0]!;
  const x = charToCoord(s[1]!);
  const y = charToCoord(s[2]!);

  if (kind === "m") return { kind: "move", to: { x, y } };
  if (kind === "h")
    return {
      kind: "wall",
      wall: { coord: { x, y }, orientation: "horizontal" },
    };
  if (kind === "v")
    return {
      kind: "wall",
      wall: { coord: { x, y }, orientation: "vertical" },
    };
  throw new Error(`Unknown move kind: ${kind}`);
}

export function encodeMoves(moves: Move[]): string {
  return moves.map(encodeMove).join("");
}

export function decodeMoves(s: string): Move[] {
  if (s.length % 3 !== 0)
    throw new Error(`Invalid move string length: ${s.length}`);
  const result: Move[] = [];
  for (let i = 0; i < s.length; i += 3) {
    result.push(decodeMove(s.slice(i, i + 3)));
  }
  return result;
}

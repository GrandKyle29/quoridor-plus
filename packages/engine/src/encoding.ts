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

function playerIdToChar(playerId: string): string {
  const index = Number.parseInt(playerId.replace(/^p/, ""), 10);
  if (!Number.isInteger(index) || index < 0)
    throw new Error(`Invalid player id: ${playerId}`);
  return coordToChar(index);
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
  if (move.kind === "eliminate") {
    // "r" = resigned (still in the room), "e" = left / kicked.
    const prefix = move.reason === "resigned" ? "r" : "e";
    return `${prefix}${playerIdToChar(move.playerId)}`;
  }
  throw new Error("Unknown move kind");
}

export function decodeMove(s: string): Move {
  if (s === "s") return { kind: "skip" };
  if (s.length === 2 && (s[0] === "e" || s[0] === "r"))
    return {
      kind: "eliminate",
      playerId: `p${charToCoord(s[1]!)}`,
      ...(s[0] === "r" ? { reason: "resigned" as const } : {}),
    };

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
  const result: Move[] = [];
  let i = 0;
  while (i < s.length) {
    const first = s[i]!;
    if (first === "s") {
      result.push({ kind: "skip" });
      i += 1;
    } else if (first === "e" || first === "r") {
      if (i + 2 > s.length) {
        throw new Error(`Invalid move string (truncated): ${s.slice(i)}`);
      }
      result.push(decodeMove(s.slice(i, i + 2)));
      i += 2;
    } else {
      if (i + 3 > s.length) {
        throw new Error(`Invalid move string (truncated): ${s.slice(i)}`);
      }
      result.push(decodeMove(s.slice(i, i + 3)));
      i += 3;
    }
  }
  return result;
}

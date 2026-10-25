import { useState } from "react";
import { createGame, applyMove } from "@quoridor/engine";
import type { GameConfig, GameState, Move } from "@quoridor/engine";

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

export function useGame() {
  const [state, setState] = useState<GameState>(() =>
    createGame(classicConfig, ["Alice", "Bob"]),
  );

  const playMove = (move: Move) => {
    try {
      const nextState = applyMove(state, move);
      setState(nextState);
    } catch (e) {
      console.error("Illegal move attempted", e);
    }
  };
  // ADD THIS FUNCTION
  const resetGame = () => {
    setState(createGame(classicConfig, ["Alice", "Bob"]));
  };

  // RETURN IT
  return { state, playMove, resetGame };
}

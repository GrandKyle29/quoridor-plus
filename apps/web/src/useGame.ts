import { useState, useEffect } from "react";
import { createGame, applyMove, getBestMove } from "@quoridor/engine";
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

// Notice vsBot is the second parameter here!
export function useGame(
  playerNames: string[],
  vsBot: boolean,
  configOverrides: Partial<GameConfig> = {},
) {
  const [state, setState] = useState<GameState>(() => {
    const finalConfig = { ...classicConfig, ...configOverrides };
    return createGame(finalConfig, playerNames);
  });
  const playMove = (move: Move) => {
    try {
      const nextState = applyMove(state, move);
      setState(nextState);
    } catch (e) {
      console.error("Illegal move attempted", e);
    }
  };

  const resetGame = () => {
    setState(createGame(classicConfig, playerNames));
  };

  // Trigger the AI
  useEffect(() => {
    if (vsBot && state.status === "active") {
      const currentPlayer = state.players[state.turnIndex];

      // Check if the current player is a bot
      if (currentPlayer && currentPlayer.name.startsWith("Bot")) {
        const timer = setTimeout(() => {
          try {
            const move = getBestMove(state);
            if (move) playMove(move);
          } catch (err) {
            console.error("AI crashed!", err);
          }
        }, 500);

        return () => clearTimeout(timer);
      }
    }
  }, [state, vsBot]);

  return { state, playMove, resetGame };
}

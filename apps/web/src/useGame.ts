import { useState, useEffect, useMemo } from "react";
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

export function useGame(
  playerNames: string[],
  vsBot: boolean = false,
  configOverrides: Partial<GameConfig> = {},
  botTimeLimit: number = 1500, // Default 1.5 seconds
) {
  // Memoize the final config so it doesn't recreate on every render
  const finalConfig = useMemo(() => {
    return {
      ...classicConfig,
      ...configOverrides,
      maxPlayers: playerNames.length,
    } as GameConfig;
  }, [JSON.stringify(configOverrides), playerNames.length]);

  const [state, setState] = useState<GameState>(() =>
    createGame(finalConfig, playerNames),
  );

  const playMove = (move: Move) => {
    try {
      const nextState = applyMove(state, move);
      setState(nextState);
    } catch (e) {
      console.error("Illegal move attempted", e);
    }
  };

  const resetGame = () => {
    // Use finalConfig instead of classicConfig!
    setState(createGame(finalConfig, playerNames));
  };

  useEffect(() => {
    if (vsBot && state.status === "active") {
      const currentPlayer = state.players[state.turnIndex];

      if (currentPlayer && currentPlayer.name.startsWith("Bot")) {
        const worker = new Worker(new URL("./ai.worker.ts", import.meta.url), {
          type: "module",
        });

        // NEW: Send state AND timeLimit
        worker.postMessage({ state, timeLimit: botTimeLimit });

        worker.onmessage = (e) => {
          const bestMove = e.data;
          if (bestMove) {
            playMove(bestMove);
          }
          worker.terminate();
        };

        return () => {
          worker.terminate();
        };
      }
    }
  }, [state, vsBot, botTimeLimit]);

  return { state, playMove, resetGame, config: finalConfig };
}

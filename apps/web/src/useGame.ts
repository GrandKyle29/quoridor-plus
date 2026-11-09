import { useState, useEffect, useMemo } from "react";
import { createGame, applyMove, getBestMove } from "@quoridor/engine";
import type { GameConfig, GameState, Move } from "@quoridor/engine";

const classicConfig: GameConfig = {
  schemaVersion: 3,
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
  randomizeSpawns: true,
  lenientJumps: false,
};

const PLACEHOLDER_STATE: GameState = {
  config: classicConfig,
  players: [],
  walls: [],
  turnIndex: 0,
  moveLog: [],
  status: "lobby",
  winner: null,
};

export function useGame(
  playerNames: string[],
  vsBot: boolean = false,
  configOverrides: Partial<GameConfig> = {},
  botTimeLimit: number = 1500,
  playerColors?: string[],
  enabled: boolean = true,
) {
  const finalConfig = useMemo(() => {
    return {
      ...classicConfig,
      ...configOverrides,
      maxPlayers: Math.max(playerNames.length, configOverrides.maxPlayers ?? 8),
    } as GameConfig;
  }, [JSON.stringify(configOverrides), playerNames.length]);

  const [state, setState] = useState<GameState>(() => {
    if (!enabled) return PLACEHOLDER_STATE;
    return createGame(finalConfig, playerNames, playerColors);
  });

  const playMove = (move: Move) => {
    if (!enabled) return;
    try {
      const nextState = applyMove(state, move);
      setState(nextState);
    } catch (e) {
      console.error("Illegal move attempted", e);
    }
  };

  const resetGame = () => {
    if (!enabled) return;
    setState(createGame(finalConfig, playerNames, playerColors));
  };

  useEffect(() => {
    if (!enabled) return;
    if (!vsBot || state.status !== "active") return;

    const currentPlayer = state.players[state.turnIndex];
    if (currentPlayer && currentPlayer.name.startsWith("Bot")) {
      const worker = new Worker(new URL("./ai.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.postMessage({ state, timeLimit: botTimeLimit });

      worker.onmessage = (e) => {
        const bestMove = e.data;
        if (bestMove) playMove(bestMove);
        worker.terminate();
      };

      return () => worker.terminate();
    }
  }, [state, vsBot, botTimeLimit, enabled]);

  return { state, playMove, resetGame, config: finalConfig };
}

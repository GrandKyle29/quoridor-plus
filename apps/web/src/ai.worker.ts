import { getBestMove } from "@quoridor/engine";

self.onmessage = (e: MessageEvent) => {
  const { state, timeLimit, mode } = e.data;
  const bestMove = getBestMove(state, timeLimit, mode);
  self.postMessage(bestMove);
};

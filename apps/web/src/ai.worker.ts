import { getBestMove } from "@quoridor/engine";

self.onmessage = (e: MessageEvent) => {
  const { state, timeLimit } = e.data;
  const bestMove = getBestMove(state, timeLimit);
  self.postMessage(bestMove);
};

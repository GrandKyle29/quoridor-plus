import { getBestMove } from "@quoridor/engine";

self.onmessage = (e: MessageEvent) => {
  const state = e.data;
  const bestMove = getBestMove(state);
  self.postMessage(bestMove);
};

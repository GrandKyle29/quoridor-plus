import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { applyMove, getStartPositionsRaw } from "@quoridor/engine";
import type { GameState } from "@quoridor/engine";
import { GameBoard } from "./GameBoard";
import { decodeShareCode } from "./shareCode";

export function ReplayScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [shareCode, setShareCode] = useState(searchParams.get("code") || "");
  const [fullGame, setFullGame] = useState<GameState | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [replayState, setReplayState] = useState<GameState | null>(null);

  // Load game from share code
  useEffect(() => {
    if (shareCode) {
      const game = decodeShareCode(shareCode);
      if (game) {
        setFullGame(game);
        setCurrentStep(game.moveLog.length);
      }
    }
  }, [shareCode]);

  // ---- SLOW: rebuild from scratch on every step ----
  // useEffect(() => {
  //   if (!fullGame) return;
  //   let state = buildInitialState(fullGame);
  //   for (let i = 0; i < currentStep; i++) {
  //     state = applyMove(state, fullGame.moveLog[i]!);
  //   }
  //   setReplayState(state);
  // }, [fullGame, currentStep]);

  // ---- FAST: incremental delta application ----
  // Keep track of what step our current `replayState` corresponds to.
  const [replayStep, setReplayStep] = useState(0);

  useEffect(() => {
    if (!fullGame) return;

    // First render: build initial state + apply currentStep moves
    if (!replayState) {
      let state = buildInitialState(fullGame);
      for (let i = 0; i < currentStep; i++) {
        state = applyMove(state, fullGame.moveLog[i]!);
      }
      setReplayState(state);
      setReplayStep(currentStep);
      return;
    }

    // Same step: no work
    if (currentStep === replayStep) return;

    // Forward: apply moves from replayStep to currentStep
    if (currentStep > replayStep) {
      let state = replayState;
      for (let i = replayStep; i < currentStep; i++) {
        state = applyMove(state, fullGame.moveLog[i]!);
      }
      setReplayState(state);
      setReplayStep(currentStep);
      return;
    }

    // Backward: rebuild from scratch (rare, and only up to currentStep)
    if (currentStep < replayStep) {
      let state = buildInitialState(fullGame);
      for (let i = 0; i < currentStep; i++) {
        state = applyMove(state, fullGame.moveLog[i]!);
      }
      setReplayState(state);
      setReplayStep(currentStep);
    }
  }, [fullGame, currentStep, replayState, replayStep]);

  if (!shareCode || !fullGame) {
    return (
      <div style={{ textAlign: "center", marginTop: "100px", color: "white" }}>
        <h2>Replay Viewer</h2>
        <p>Paste a share code below to view the replay.</p>
        <input
          type="text"
          placeholder="Paste share code here"
          value={shareCode}
          onChange={(e) => setShareCode(e.target.value)}
          style={{
            padding: "10px",
            width: "300px",
            borderRadius: "4px",
            border: "none",
          }}
        />
        <p style={{ marginTop: "20px", fontSize: "14px", color: "#ccc" }}>
          (Share codes are generated at the end of a game.)
        </p>
        <button
          onClick={() => navigate("/")}
          style={{ marginTop: "20px", padding: "8px 16px" }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", color: "white" }}>
      <h2>Replay</h2>
      <div style={{ marginBottom: "20px" }}>
        <p>
          Move {currentStep} of {fullGame.moveLog.length}
        </p>
        <input
          type="range"
          min="0"
          max={fullGame.moveLog.length}
          value={currentStep}
          onChange={(e) => setCurrentStep(Number(e.target.value))}
          style={{ width: "80%" }}
        />
      </div>

      {replayState && (
        <GameBoard
          playerNames={replayState.players.map((p) => p.name)}
          vsBot={false}
          onlineState={replayState}
          onlinePlayMove={() => {}}
          isOnline={true}
          localPlayerId={undefined}
        />
      )}

      <div style={{ marginTop: "20px" }}>
        <button
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            alert("Replay URL copied!");
          }}
          style={{ padding: "8px 16px", marginRight: "10px" }}
        >
          Copy Replay URL
        </button>
        <button onClick={() => navigate("/")} style={{ padding: "8px 16px" }}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

// Extract this so we can reuse the "build initial state" logic
function buildInitialState(game: GameState): GameState {
  const startPositions = getStartPositionsRaw(
    game.players.length,
    game.config.boardSize,
  );
  const startingWalls =
    typeof game.config.startingWalls === "number"
      ? game.config.startingWalls
      : Math.max(3, 10 - game.players.length);

  const players = game.players.map((p, i) => ({
    ...p,
    position: startPositions[p.startIndex ?? i]!,
    wallsRemaining: startingWalls,
  }));

  return {
    config: game.config,
    players,
    walls: [],
    turnIndex: 0,
    moveLog: [],
    status: "active",
    winner: null,
  };
}

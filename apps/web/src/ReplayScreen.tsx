import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GameBoard } from "./GameBoard";
import { decodeShareCode } from "./shareCode";
import type { GameState } from "@quoridor/engine";
import { createGame, applyMove } from "@quoridor/engine";

export function ReplayScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [shareCode, setShareCode] = useState(searchParams.get("code") || "");
  const [fullGame, setFullGame] = useState<GameState | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [replayState, setReplayState] = useState<GameState | null>(null);

  // Load game when code changes
  useEffect(() => {
    if (shareCode) {
      const game = decodeShareCode(shareCode);
      if (game) {
        setFullGame(game);
        setCurrentStep(game.moveLog.length); // Go to end by default
      }
    }
  }, [shareCode]);

  // Update the replay state when the step changes
  useEffect(() => {
    if (!fullGame) return;

    // Reconstruct the state at the current step
    let state = createGame(
      fullGame.config,
      fullGame.players.map((p) => p.name),
      fullGame.players.map((p) => p.color || "#ffffff"),
    );
    for (let i = 0; i < currentStep; i++) {
      state = applyMove(state, fullGame.moveLog[i]!);
    }
    setReplayState(state);
  }, [fullGame, currentStep]);

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
          onlinePlayMove={() => {}} // No moves allowed in replay
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

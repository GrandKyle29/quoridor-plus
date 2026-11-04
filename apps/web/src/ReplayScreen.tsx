import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { applyMove, buildInitialState } from "@quoridor/engine";
import type { GameState } from "@quoridor/engine";
import { GameBoard } from "./GameBoard";
import { decodeShareCode } from "./shareCode";

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

export function ReplayScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [shareCode, setShareCode] = useState(searchParams.get("code") || "");
  const [fullGame, setFullGame] = useState<GameState | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [replayState, setReplayState] = useState<GameState | null>(null);
  const [replayStep, setReplayStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimer = useRef<number | null>(null);

  // Load game from share code
  useEffect(() => {
    if (shareCode) {
      const game = decodeShareCode(shareCode);
      if (game) {
        setFullGame(game);
        setCurrentStep(game.moveLog.length);
        setReplayState(null);
        setReplayStep(0);
        setIsPlaying(false);
      }
    }
  }, [shareCode]);

  // Incremental scrub: apply forward delta from replayStep to currentStep
  useEffect(() => {
    if (!fullGame) return;

    const initial = buildInitialState(
      fullGame.config,
      fullGame.players.map((p, i) => ({
        name: p.name,
        color: p.color,
        startIndex: p.startIndex ?? i,
      })),
    );

    if (!replayState) {
      let state = initial;
      for (let i = 0; i < currentStep; i++) {
        state = applyMove(state, fullGame.moveLog[i]!);
      }
      setReplayState(state);
      setReplayStep(currentStep);
      return;
    }

    if (currentStep === replayStep) return;

    if (currentStep > replayStep) {
      let state = replayState;
      for (let i = replayStep; i < currentStep; i++) {
        state = applyMove(state, fullGame.moveLog[i]!);
      }
      setReplayState(state);
      setReplayStep(currentStep);
      return;
    }

    if (currentStep < replayStep) {
      let state = initial;
      for (let i = 0; i < currentStep; i++) {
        state = applyMove(state, fullGame.moveLog[i]!);
      }
      setReplayState(state);
      setReplayStep(currentStep);
    }
  }, [fullGame, currentStep, replayState, replayStep]);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying || !fullGame) return;

    const tick = () => {
      setCurrentStep((step) => {
        if (step >= fullGame.moveLog.length) {
          setIsPlaying(false);
          return step;
        }
        return step + 1;
      });
    };

    // Speed: adjust this value to change how fast playback runs (ms per move)
    const delay = 500;
    playTimer.current = window.setInterval(tick, delay);

    return () => {
      if (playTimer.current !== null) {
        window.clearInterval(playTimer.current);
        playTimer.current = null;
      }
    };
  }, [isPlaying, fullGame]);

  // Stop playback if we reach the end manually
  useEffect(() => {
    if (fullGame && currentStep >= fullGame.moveLog.length && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentStep, fullGame, isPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!fullGame) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentStep((s) => Math.min(s + 1, fullGame.moveLog.length));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentStep((s) => Math.max(s - 1, 0));
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [fullGame]);

  // ---- UI ----

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

  const maxStep = fullGame.moveLog.length;
  const atStart = currentStep === 0;
  const atEnd = currentStep === maxStep;

  return (
    <div style={{ textAlign: "center", color: "white" }}>
      <h2>Replay</h2>

      {/* SCRUBBER */}
      <div style={{ marginBottom: "10px" }}>
        <p style={{ margin: "0 0 10px 0" }}>
          Move {currentStep} of {maxStep}
        </p>
        <input
          type="range"
          min="0"
          max={maxStep}
          value={currentStep}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentStep(Number(e.target.value));
          }}
          style={{ width: "80%", maxWidth: "600px" }}
        />
      </div>

      {/* CONTROLS */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          justifyContent: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => {
            setIsPlaying(false);
            setCurrentStep(0);
          }}
          disabled={atStart}
          style={{
            padding: "8px 16px",
            backgroundColor: atStart ? "#374151" : "#4b5563",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: atStart ? "not-allowed" : "pointer",
            fontSize: "16px",
          }}
          title="Jump to start"
        >
          ⏮
        </button>
        <button
          onClick={() => {
            setIsPlaying(false);
            setCurrentStep((s) => Math.max(s - 1, 0));
          }}
          disabled={atStart}
          style={{
            padding: "8px 16px",
            backgroundColor: atStart ? "#374151" : "#4b5563",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: atStart ? "not-allowed" : "pointer",
            fontSize: "16px",
          }}
          title="Previous move (←)"
        >
          ◀
        </button>
        <button
          onClick={() => setIsPlaying((p) => !p)}
          disabled={atEnd && !isPlaying}
          style={{
            padding: "8px 24px",
            backgroundColor: atEnd && !isPlaying ? "#374151" : "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: atEnd && !isPlaying ? "not-allowed" : "pointer",
            fontSize: "16px",
            minWidth: "80px",
            fontWeight: "bold",
          }}
          title="Play / Pause (Space)"
        >
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          onClick={() => {
            setIsPlaying(false);
            setCurrentStep((s) => Math.min(s + 1, maxStep));
          }}
          disabled={atEnd}
          style={{
            padding: "8px 16px",
            backgroundColor: atEnd ? "#374151" : "#4b5563",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: atEnd ? "not-allowed" : "pointer",
            fontSize: "16px",
          }}
          title="Next move (→)"
        >
          ▶
        </button>
        <button
          onClick={() => {
            setIsPlaying(false);
            setCurrentStep(maxStep);
          }}
          disabled={atEnd}
          style={{
            padding: "8px 16px",
            backgroundColor: atEnd ? "#374151" : "#4b5563",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: atEnd ? "not-allowed" : "pointer",
            fontSize: "16px",
          }}
          title="Jump to end"
        >
          ⏭
        </button>
      </div>

      <p style={{ fontSize: "12px", color: "#888", marginBottom: "20px" }}>
        ← → to step · Space to play/pause
      </p>

      {/* BOARD */}
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

      {/* FOOTER */}
      <div style={{ marginTop: "20px", marginBottom: "30px" }}>
        <button
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            alert("Replay URL copied!");
          }}
          style={{
            padding: "8px 16px",
            marginRight: "10px",
            cursor: "pointer",
          }}
        >
          Copy Replay URL
        </button>
        <button
          onClick={() => navigate("/")}
          style={{ padding: "8px 16px", cursor: "pointer" }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

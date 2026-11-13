import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { applyMove, buildInitialState } from "@quoridor/engine";
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
  const nonSkipMoveIndices = useMemo(() => {
    if (!fullGame) return [];
    const result: number[] = [];
    fullGame.moveLog.forEach((move, i) => {
      if (move.kind !== "skip") result.push(i);
    });
    return result;
  }, [fullGame]);

  const totalDisplayMoves = nonSkipMoveIndices.length;
  const displayStep = currentStep;
  // Build a fresh initial state using the engine's source of truth
  const buildFreshInitialState = (): GameState | null => {
    if (!fullGame) return null;
    return buildInitialState(
      fullGame.config,
      fullGame.players.map((p, i) => ({
        name: p.name,
        color: p.color,
        startIndex: p.startIndex ?? i,
      })),
    );
  };

  // Incremental scrub: apply forward delta from replayStep to currentStep
  useEffect(() => {
    if (!fullGame) return;

    // How many entries of moveLog do we need to apply to reach "displayStep"?
    const targetInternal =
      displayStep === totalDisplayMoves
        ? fullGame.moveLog.length
        : nonSkipMoveIndices[displayStep]!;

    if (!replayState) {
      let state = buildFreshInitialState()!;
      for (let i = 0; i < targetInternal; i++) {
        state = applyMove(state, fullGame.moveLog[i]!);
      }
      setReplayState(state);
      setReplayStep(targetInternal);
      return;
    }

    if (targetInternal === replayStep) return;

    if (targetInternal > replayStep) {
      let state = replayState;
      for (let i = replayStep; i < targetInternal; i++) {
        state = applyMove(state, fullGame.moveLog[i]!);
      }
      setReplayState(state);
      setReplayStep(targetInternal);
      return;
    }

    // Backward: rebuild from scratch
    let state = buildFreshInitialState()!;
    for (let i = 0; i < targetInternal; i++) {
      state = applyMove(state, fullGame.moveLog[i]!);
    }
    setReplayState(state);
    setReplayStep(targetInternal);
  }, [fullGame, displayStep, nonSkipMoveIndices, replayState, replayStep]);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying || !fullGame) return;

    const tick = () => {
      setCurrentStep((step) => {
        if (step >= totalDisplayMoves) {
          setIsPlaying(false);
          return step;
        }
        return step + 1;
      });
    };

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
    if (fullGame && currentStep >= totalDisplayMoves && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentStep, fullGame, isPlaying, totalDisplayMoves]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!fullGame) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentStep((s) => Math.min(s + 1, totalDisplayMoves));
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

  const maxStep = totalDisplayMoves;
  const atStart = currentStep === 0;
  const atEnd = currentStep === maxStep;

  return (
    <div style={{ textAlign: "center", color: "white" }}>
      <h2>Replay</h2>

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

      {replayState && (
        <GameBoard
          playerNames={replayState.players.map((p) => p.name)}
          vsBot={false}
          onlineState={replayState}
          onlinePlayMove={() => {}}
          isOnline={true}
          localPlayerId={undefined}
          hideTurnHeader={true}
        />
      )}

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

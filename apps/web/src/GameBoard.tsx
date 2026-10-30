//GameBoard.tsx
import { useState, useEffect, useRef } from "react";
import { useGame } from "./useGame";
import { legalMoves } from "@quoridor/engine";
import type { GameState, Move, GameConfig } from "@quoridor/engine";
import "./GameBoard.css";

interface GameBoardProps {
  playerNames: string[];
  vsBot: boolean;
  onlineState?: GameState | null;
  onlinePlayMove?: (move: Move) => void;
  onlineResetGame?: () => void;
  localPlayerId?: "p0" | "p1" | "p2" | "p3";
  useWood?: boolean;
  onLeave?: (config?: GameConfig) => void; // Update this line
  isOnline?: boolean;
  configOverrides?: Partial<GameConfig>;
  //botMode?: "heuristic" | "minimax";
  botTimeLimit?: number;
}

export function GameBoard({
  playerNames,
  vsBot,
  onlineState,
  onlinePlayMove,
  onlineResetGame,
  localPlayerId,
  useWood = false,
  onLeave,
  isOnline = false,
  configOverrides = {},
  //botMode = "heuristic",
  botTimeLimit = 1500,
}: GameBoardProps) {
  const localGame = useGame(
    playerNames,
    vsBot,
    configOverrides,
    botTimeLimit,
    //botMode,
  );

  const state = onlineState || localGame.state;
  const playMove = onlinePlayMove || localGame.playMove;
  const resetGame = onlineResetGame || localGame.resetGame;

  const [showSettings, setShowSettings] = useState(false);

  const isMyTurn = isOnline
    ? localPlayerId
      ? state?.players[state.turnIndex]?.id === localPlayerId
      : false // Online: Strict ID match
    : vsBot
      ? state?.players[state.turnIndex]?.id === "p0" // Local Bot Game: Human is always p0
      : true; // Local Hotseat Game: Free for all

  // --- SOUND SYSTEM ---
  const playSound = (type: "move" | "wall" | "win") => {
    const audio = new Audio(`/${type}.mp3`);
    audio.volume = 0.5;
    audio.play().catch((e) => console.log("Audio play failed:", e));
  };

  const prevMoveCount = useRef(state?.moveLog.length || 0);
  const prevStatus = useRef(state?.status);

  useEffect(() => {
    if (!state) return;

    if (state.moveLog.length < prevMoveCount.current) {
      prevMoveCount.current = state.moveLog.length;
      return;
    }

    if (state.moveLog.length > prevMoveCount.current) {
      const lastMove = state.moveLog[state.moveLog.length - 1];
      if (lastMove.kind === "move") playSound("move");
      if (lastMove.kind === "wall") playSound("wall");
      prevMoveCount.current = state.moveLog.length;
    }

    if (state.status === "finished" && prevStatus.current !== "finished") {
      playSound("win");
    }
    prevStatus.current = state.status;
  }, [state]);

  if (!state) return null;
  const { boardSize } = state.config;

  const DEFAULT_COLORS = ["#3b82f6", "#ef4444", "#eab308", "#22c55e"];

  const currentMoves = legalMoves(state);
  const validPawnMoves = isMyTurn
    ? currentMoves.filter((m) => m.kind === "move").map((m) => m.to)
    : [];
  const validWallMoves = isMyTurn
    ? currentMoves.filter((m) => m.kind === "wall").map((m) => m.wall)
    : [];

  const isValidMove = (x: number, y: number) =>
    validPawnMoves.some((m) => m.x === x && m.y === y);

  return (
    <div>
      {state.status === "finished" ? (
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <h2 style={{ color: "#4ade80" }}>
            Game Over! {state.players.find((p) => p.id === state.winner)?.name}{" "}
            wins!
          </h2>

          <div
            style={{
              display: "flex",
              gap: "10px",
              justifyContent: "center",
              marginTop: "15px",
            }}
          >
            <button
              onClick={resetGame}
              style={{
                padding: "8px 16px",
                fontSize: "16px",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Play Again
            </button>

            {/* NEW: Back to Settings button */}
            {onLeave && (
              <button
                onClick={() => onLeave(state.config)}
                style={{
                  padding: "8px 16px",
                  fontSize: "16px",
                  backgroundColor: "#4b5563",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Back to Setup
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            marginBottom: "20px",
            display: "flex",
            gap: "20px",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                margin: "0 0 10px 0",
                color: isMyTurn ? "#4ade80" : "#ccc",
              }}
            >
              {isMyTurn
                ? "Your Turn"
                : `${state.players[state.turnIndex]?.name} is thinking...`}
            </h2>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={resetGame}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Reset Game
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#4b5563",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Settings
              </button>
              {onLeave && (
                <button
                  onClick={() => onLeave(state.config)}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#4b5563",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Leave
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {state.players.map((p, i) => (
              <div
                key={p.id}
                style={{
                  backgroundColor: "#374151",
                  padding: "10px",
                  borderRadius: "6px",
                  border:
                    state.turnIndex === i
                      ? "2px solid #4ade80"
                      : "2px solid transparent",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "4px",
                  }}
                >
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: p.color || DEFAULT_COLORS[i],
                    }}
                  />
                  <strong>{p.name}</strong>
                </div>
                <div style={{ fontSize: "14px", color: "#ccc" }}>
                  Walls: {p.wallsRemaining}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {showSettings && (
        <div
          style={{
            position: "absolute",
            top: "60px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#1f2937",
            padding: "20px",
            borderRadius: "8px",
            border: "1px solid #4b5563",
            zIndex: 100,
            textAlign: "left",
            width: "300px",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Game Settings</h3>
          <p>
            <strong>Board Size:</strong> {state.config.boardSize}x
            {state.config.boardSize}
          </p>
          <p>
            <strong>Goal:</strong>{" "}
            {state.config.goalCondition === "center"
              ? "King of the Hill"
              : "Reach Opposite Edge"}
          </p>
          <p>
            <strong>Walls:</strong> {state.config.startingWalls} per player
          </p>

          <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
            <button
              onClick={() => {
                setShowSettings(false);
                resetGame();
              }}
              style={{
                flex: 1,
                padding: "8px",
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Restart Game
            </button>
            {onLeave && (
              <button
                onClick={() => onLeave && onLeave(state.config)}
                style={{
                  flex: 1,
                  padding: "8px",
                  backgroundColor: "#4b5563",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Quit
              </button>
            )}
          </div>
        </div>
      )}
      <div
        className={`board-container ${useWood ? "wood" : ""}`}
        style={{
          // @ts-ignore
          "--cols": boardSize - 1,
          "--rows": boardSize - 1,
        }}
      >
        {/* 1. The Tiles */}
        {Array.from({ length: boardSize }).map((_, y) =>
          Array.from({ length: boardSize }).map((_, x) => {
            const isTarget = isValidMove(x, y);
            return (
              <div
                key={`tile-${x}-${y}`}
                onClick={() =>
                  isTarget && playMove({ kind: "move", to: { x, y } })
                }
                className={`tile ${isTarget ? "valid-move" : ""}`}
                style={{
                  gridColumn: x * 2 + 1,
                  gridRow: (boardSize - 1 - y) * 2 + 1,
                }}
              />
            );
          }),
        )}

        {/* 2. Placed Walls */}
        {state.walls.map((wall, i) => {
          const playerIndex = wall.placedBy
            ? parseInt(wall.placedBy.replace("p", ""))
            : -1;
          const placingPlayer =
            playerIndex >= 0 ? state.players[playerIndex] : null;
          const wallColor =
            placingPlayer?.color ||
            (playerIndex >= 0 ? DEFAULT_COLORS[playerIndex] : "#b45309");

          if (wall.orientation === "horizontal") {
            return (
              <div
                key={`placed-h-${i}`}
                className="placed-wall"
                style={{
                  backgroundColor: wallColor,
                  gridColumn: `${wall.coord.x * 2 + 1} / span 3`,
                  gridRow: (boardSize - 1 - wall.coord.y) * 2,
                }}
              />
            );
          } else {
            return (
              <div
                key={`placed-v-${i}`}
                className="placed-wall"
                style={{
                  backgroundColor: wallColor,
                  gridColumn: wall.coord.x * 2 + 2,
                  gridRow: `${(boardSize - 1 - wall.coord.y) * 2 - 1} / span 3`,
                }}
              />
            );
          }
        })}

        {/* 3. Ghost Walls */}
        {validWallMoves.map((wall, i) => {
          if (wall.orientation === "horizontal") {
            return (
              <div
                key={`ghost-h-${i}`}
                className="ghost-wall"
                onClick={() => playMove({ kind: "wall", wall })}
                style={{
                  gridColumn: `${wall.coord.x * 2 + 1} / span 3`,
                  gridRow: (boardSize - 1 - wall.coord.y) * 2,
                }}
              />
            );
          } else {
            return (
              <div
                key={`ghost-v-${i}`}
                className="ghost-wall"
                onClick={() => playMove({ kind: "wall", wall })}
                style={{
                  gridColumn: wall.coord.x * 2 + 2,
                  gridRow: `${(boardSize - 1 - wall.coord.y) * 2 - 1} / span 3`,
                }}
              />
            );
          }
        })}

        {/* 4. Animated Players */}
        {state.players.map((player) => {
          const pIndex = parseInt(player.id.replace("p", ""));
          const color = player.color || DEFAULT_COLORS[pIndex];

          const xPos = `calc(var(--padding) + ${player.position.x} * (var(--tile-size) + var(--gap-size)))`;
          const yPos = `calc(var(--padding) + ${boardSize - 1 - player.position.y} * (var(--tile-size) + var(--gap-size)))`;

          return (
            <div
              key={player.id}
              className="player-piece-animated"
              style={{
                left: xPos,
                top: yPos,
                backgroundColor: color,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

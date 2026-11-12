import { useState, useEffect, useRef } from "react";
import { useGame } from "./useGame";
import { legalMoves } from "@quoridor/engine";
import type { GameState, Move, GameConfig } from "@quoridor/engine";
import "./GameBoard.css";
import { encodeShareCode } from "./shareCode";
import { GameResults } from "./GameResults";
import { DEFAULT_COLORS } from "./utils";

interface GameBoardProps {
  playerNames: string[];
  vsBot: boolean;
  onlineState?: GameState | null;
  onlinePlayMove?: (move: Move) => void;
  onlineResetGame?: () => void;
  localPlayerId?: "p0" | "p1" | "p2" | "p3";
  useWood?: boolean;
  onLeave?: (config?: GameConfig) => void;
  isOnline?: boolean;
  configOverrides?: Partial<GameConfig>;
  botTimeLimit?: number;
  onlinePlayers?: any[];
  myLocalName?: string;
  isHost?: boolean;
  playerColors?: string[];
  onShareReplay?: () => void;
  isSharingReplay?: boolean;
}

/*function getGoalForPlayer(startIndex: number | undefined) {
  const idx = (startIndex ?? 0) % 4;
  switch (idx) {
    case 0:
      return "top";
    case 1:
      return "bottom";
    case 2:
      return "right";
    case 3:
      return "left";
    default:
      return null;
  }
}*/

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
  botTimeLimit = 1500,
  onlinePlayers,
  myLocalName,
  isHost = false,
  playerColors,
  onShareReplay,
  isSharingReplay = false,
}: GameBoardProps) {
  const localGame = useGame(
    playerNames,
    vsBot,
    configOverrides,
    botTimeLimit,
    playerColors,
    !onlineState, // <-- disabled for online games (state comes from onlineState)
  );

  const state = onlineState || localGame.state;
  const playMove = onlinePlayMove || localGame.playMove;
  const resetGame = onlineResetGame || localGame.resetGame;

  const [showSettings, setShowSettings] = useState(false);

  // --- MOVE CONFIRMATION ---
  /*const [confirmMoves, setConfirmMoves] = useState(() => {
    return localStorage.getItem("quoridor_confirmMoves") === "true";  OFF by default
  });*/
  const [confirmMoves, setConfirmMoves] = useState(() => {
    const stored = localStorage.getItem("quoridor_confirmMoves");
    // Default to true if never set; honor explicit "false" or "true" otherwise     On by default!
    return stored === null ? true : stored === "true";
  });
  const [pendingMove, setPendingMove] = useState<Move | null>(null);

  useEffect(() => {
    localStorage.setItem("quoridor_confirmMoves", String(confirmMoves));
  }, [confirmMoves]);

  // Reset pending move when turn changes or game resets
  useEffect(() => {
    setPendingMove(null);
  }, [state?.turnIndex, state?.status]);
  const [showGoalLines, setShowGoalLines] = useState(() => {
    const stored = localStorage.getItem("quoridor_showGoalLines");
    return stored === null ? true : stored === "true"; // default ON
  });

  useEffect(() => {
    localStorage.setItem("quoridor_showGoalLines", String(showGoalLines));
  }, [showGoalLines]);
  //const DEFAULT_COLORS = COLOR_PALETTE;

  // --- DETERMINE LOCAL PLAYER ID ---
  let currentLocalPlayerId = localPlayerId;
  if (vsBot && myLocalName && state) {
    currentLocalPlayerId = state.players.find((p) => p.name === myLocalName)
      ?.id as any;
  }

  const isMyTurn = isOnline
    ? currentLocalPlayerId
      ? state?.players[state.turnIndex]?.id === currentLocalPlayerId
      : false
    : vsBot
      ? state?.players[state.turnIndex]?.id === currentLocalPlayerId
      : true;

  // --- SOUND SYSTEM ---
  const playSound = (type: "move" | "wall" | "win") => {
    const audio = new Audio(`/${type}.mp3`);
    audio.volume = 0.5;
    audio.play().catch((e) => console.log("Audio play failed:", e));
  };

  const prevMoveCount = useRef(0);
  const prevStatus = useRef(state?.status);

  useEffect(() => {
    if (!state) return;

    const currentCount =
      (state as any).moveCount !== undefined
        ? (state as any).moveCount
        : state.moveLog.length;

    if (currentCount < prevMoveCount.current) {
      prevMoveCount.current = currentCount;
      return;
    }

    if (currentCount > prevMoveCount.current) {
      const lastMove =
        (state as any).lastMove ?? state.moveLog[state.moveLog.length - 1];
      if (lastMove?.kind === "move") playSound("move");
      if (lastMove?.kind === "wall") playSound("wall");
      prevMoveCount.current = currentCount;
    }

    if (state.status === "finished" && prevStatus.current !== "finished") {
      playSound("win");
    }
    prevStatus.current = state.status;
  }, [state]);

  // --- DIAGNOSTIC GUARDS ---
  if (!state) return null;

  if (
    !state.players ||
    !Array.isArray(state.players) ||
    state.players.length === 0
  ) {
    console.error("🚨 GameBoard: malformed state.players", state);
    return (
      <div style={{ color: "white", padding: "20px", textAlign: "center" }}>
        <h2>🚨 Game state has no players</h2>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  if (!state.walls || !Array.isArray(state.walls)) {
    console.error("🚨 GameBoard: malformed state.walls", state);
    return (
      <div style={{ color: "white", padding: "20px", textAlign: "center" }}>
        <h2>🚨 Game state has malformed walls</h2>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  if (!state.config || typeof state.config.boardSize !== "number") {
    console.error("🚨 GameBoard: malformed state.config", state);
    return (
      <div style={{ color: "white", padding: "20px", textAlign: "center" }}>
        <h2>🚨 Game state has malformed config</h2>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  // --- SAFE TO RENDER ---
  const { boardSize } = state.config;

  let currentMoves: Move[] = [];
  try {
    currentMoves = legalMoves(state);
  } catch (err) {
    console.error("🚨 legalMoves threw:", err);
    return (
      <div style={{ color: "white", padding: "20px", textAlign: "center" }}>
        <h2>🚨 legalMoves crashed</h2>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  const validPawnMoves = isMyTurn
    ? currentMoves.filter((m) => m.kind === "move").map((m) => m.to)
    : [];
  const validWallMoves = isMyTurn
    ? currentMoves.filter((m) => m.kind === "wall").map((m) => m.wall)
    : [];

  const isValidMove = (x: number, y: number) =>
    validPawnMoves.some((m) => m.x === x && m.y === y);

  // --- MOVE CLICK HANDLER ---
  const handleMoveClick = (move: Move) => {
    if (confirmMoves) {
      // Double-click on the same target = confirm
      if (pendingMove && JSON.stringify(pendingMove) === JSON.stringify(move)) {
        playMove(move);
        setPendingMove(null);
      } else {
        setPendingMove(move);
      }
    } else {
      playMove(move);
    }
  };

  const isDisconnected = (playerName: string) => {
    if (!onlinePlayers) return false;
    const onlinePlayer = onlinePlayers.find((p: any) => p.name === playerName);
    if (!onlinePlayer || !onlinePlayer.last_ping) return false;
    return Date.now() - onlinePlayer.last_ping > 25000;
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* HEADER */}
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
              flexWrap: "wrap",
            }}
          >
            {!isOnline && (
              <>
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
              </>
            )}
            {isOnline && (
              <>
                {isHost ? (
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
                    Return to Lobby
                  </button>
                ) : (
                  <button
                    onClick={() => onLeave && onLeave(state.config)}
                    style={{
                      padding: "8px 16px",
                      fontSize: "16px",
                      backgroundColor: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Leave Game
                  </button>
                )}
              </>
            )}

            {(!isOnline || (isOnline && localPlayerId)) && (
              <button
                onClick={() => {
                  if (isOnline && onShareReplay) {
                    onShareReplay();
                  } else {
                    const code = encodeShareCode(state);
                    const url = `${window.location.origin}/replay?code=${encodeURIComponent(code)}`;
                    navigator.clipboard.writeText(url);
                    alert("Replay link copied to clipboard!");
                  }
                }}
                disabled={isSharingReplay}
                style={{
                  padding: "8px 16px",
                  fontSize: "16px",
                  backgroundColor: isSharingReplay ? "#888" : "#eab308",
                  color: "#1f2937",
                  fontWeight: "bold",
                  border: "none",
                  borderRadius: "4px",
                  cursor: isSharingReplay ? "not-allowed" : "pointer",
                }}
              >
                {isSharingReplay ? "Loading..." : "Share Replay"}
              </button>
            )}
          </div>

          {state.status === "finished" && <GameResults state={state} />}
        </div>
      ) : (
        <div
          style={{
            marginBottom: "20px",
            display: "flex",
            gap: "15px",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "center",
            width: "100%",
          }}
        >
          <div>
            {(() => {
              const currentPlayer = state.players[state.turnIndex];
              const currentDisconnected = currentPlayer
                ? isDisconnected(currentPlayer.name)
                : false;
              let headerText = "Your Turn";
              let headerColor = "#4ade80";
              if (!isMyTurn && currentPlayer) {
                if (currentDisconnected) {
                  headerText = `${currentPlayer.name} disconnected...`;
                  headerColor = "#ef4444";
                } else {
                  headerText = `${currentPlayer.name} is thinking...`;
                  headerColor = "#ccc";
                }
              }
              return (
                <h2
                  style={{
                    margin: "0 0 10px 0",
                    color: headerColor,
                    maxWidth: "300px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: "clamp(18px, 5vw, 24px)",
                  }}
                >
                  {headerText}
                </h2>
              );
            })()}
            <div style={{ display: "flex", gap: "10px" }}>
              {(!isOnline || isHost) && (
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
              )}
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "10px",
              width: "100%",
              maxWidth: "560px",
            }}
          >
            {state.players.map((p, i) => {
              const disconnected = isDisconnected(p.name);
              return (
                <div
                  key={p.id}
                  style={{
                    backgroundColor: "#374151",
                    padding: "10px",
                    borderRadius: "6px",
                    border:
                      state.turnIndex === i
                        ? `2px solid ${disconnected ? "#ef4444" : "#4ade80"}`
                        : "2px solid transparent",
                    opacity: disconnected ? 0.5 : 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    minWidth: 0, // prevent text overflow from stretching
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
                        backgroundColor: p.color || DEFAULT_COLORS[i] || "#888",
                        flexShrink: 0,
                      }}
                    />
                    <strong
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.name}
                    </strong>
                  </div>
                  <div style={{ fontSize: "14px", color: "#ccc" }}>
                    Walls: {p.wallsRemaining}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* SETTINGS PANEL */}
      {showSettings && (
        <>
          {/* Invisible backdrop — click anywhere outside to close */}
          <div
            onClick={() => setShowSettings(false)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
              zIndex: 99,
            }}
          />
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
              maxWidth: "90vw",
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setShowSettings(false)}
              style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                width: "28px",
                height: "28px",
                padding: 0,
                backgroundColor: "transparent",
                color: "#ccc",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "20px",
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Close settings"
            >
              ×
            </button>

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

            <hr style={{ borderColor: "#4b5563", margin: "15px 0" }} />

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                marginBottom: "15px",
              }}
            >
              <input
                type="checkbox"
                checked={confirmMoves}
                onChange={(e) => setConfirmMoves(e.target.checked)}
              />
              Confirm moves before playing
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                marginBottom: "15px",
              }}
            >
              <input
                type="checkbox"
                checked={showGoalLines}
                onChange={(e) => setShowGoalLines(e.target.checked)}
              />
              Show goal indicators
            </label>
            <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
              {(!isOnline || isHost) && (
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
              )}
            </div>
          </div>
        </>
      )}

      {/* BOARD */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
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
              const isPending =
                pendingMove?.kind === "move" &&
                pendingMove.to.x === x &&
                pendingMove.to.y === y;
              return (
                <div
                  key={`tile-${x}-${y}`}
                  onClick={() => {
                    if (isTarget) {
                      handleMoveClick({ kind: "move", to: { x, y } });
                    } else if (pendingMove) {
                      setPendingMove(null);
                    }
                  }}
                  className={`tile ${isTarget ? "valid-move" : ""} ${isPending ? "pending-move" : ""}`}
                  style={{
                    gridColumn: x * 2 + 1,
                    gridRow: (boardSize - 1 - y) * 2 + 1,
                  }}
                />
              );
            }),
          )}
          {/* Goal line indicators */}
          {state.status !== "finished" &&
            showGoalLines &&
            state.config.goalCondition === "opposite-edge" &&
            (() => {
              type Edge = "top" | "bottom" | "left" | "right";
              const edgeToColors: Record<Edge, string[]> = {
                top: [],
                bottom: [],
                left: [],
                right: [],
              };

              state.players.forEach((player) => {
                const edge = (player.startIndex ?? 0) % 4;
                const goal: Edge =
                  edge === 0
                    ? "top"
                    : edge === 1
                      ? "bottom"
                      : edge === 2
                        ? "right"
                        : "left";
                const color =
                  player.color ||
                  DEFAULT_COLORS[parseInt(player.id.replace("p", ""))] ||
                  "#888";
                edgeToColors[goal].push(color);
              });

              function buildGradient(
                colors: string[],
                isVertical: boolean,
              ): string {
                if (colors.length === 0) return "transparent";
                if (colors.length === 1) return colors[0];
                const stripe = 12;
                const stops: string[] = [];
                const total = colors.length * stripe;
                for (let rep = 0; rep < 20; rep++) {
                  colors.forEach((c, i) => {
                    const start = rep * total + i * stripe;
                    const end = start + stripe;
                    stops.push(`${c} ${start}px ${end}px`);
                  });
                }
                const angle = isVertical ? "180deg" : "90deg";
                return `repeating-linear-gradient(${angle}, ${stops.join(", ")})`;
              }

              return (
                <>
                  {edgeToColors.top.length > 0 && (
                    <div
                      className="goal-line horizontal"
                      style={{
                        top: 0,
                        background: buildGradient(edgeToColors.top, false),
                        boxShadow: `0 0 8px ${edgeToColors.top[0]}`,
                      }}
                    />
                  )}
                  {edgeToColors.bottom.length > 0 && (
                    <div
                      className="goal-line horizontal"
                      style={{
                        bottom: 0,
                        background: buildGradient(edgeToColors.bottom, false),
                        boxShadow: `0 0 8px ${edgeToColors.bottom[0]}`,
                      }}
                    />
                  )}
                  {edgeToColors.left.length > 0 && (
                    <div
                      className="goal-line vertical"
                      style={{
                        left: 0,
                        background: buildGradient(edgeToColors.left, true),
                        boxShadow: `0 0 8px ${edgeToColors.left[0]}`,
                      }}
                    />
                  )}
                  {edgeToColors.right.length > 0 && (
                    <div
                      className="goal-line vertical"
                      style={{
                        right: 0,
                        background: buildGradient(edgeToColors.right, true),
                        boxShadow: `0 0 8px ${edgeToColors.right[0]}`,
                      }}
                    />
                  )}
                </>
              );
            })()}

          {/* Center goal ring for King of the Hill */}
          {state.status !== "finished" &&
            showGoalLines &&
            state.config.goalCondition === "center" && (
              <div
                className="goal-center"
                style={{
                  gridColumn: `${Math.floor(boardSize / 2) * 2 + 1} / span 1`,
                  gridRow: `${Math.floor(boardSize / 2) * 2 + 1} / span 1`,
                  justifySelf: "stretch",
                  alignSelf: "stretch",
                }}
              />
            )}
          {/*top gold line for Reach the Top*/}
          {state.status !== "finished" &&
            showGoalLines &&
            state.config.goalCondition === "top" && (
              <div
                className="goal-line horizontal"
                style={{
                  top: 0,
                  backgroundColor: "#fbbf24",
                  boxShadow: "0 0 8px #fbbf24",
                }}
              />
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
            const isPending =
              pendingMove?.kind === "wall" &&
              pendingMove.wall.coord.x === wall.coord.x &&
              pendingMove.wall.coord.y === wall.coord.y &&
              pendingMove.wall.orientation === wall.orientation;
            if (wall.orientation === "horizontal") {
              return (
                <div
                  key={`ghost-h-${i}`}
                  className={`ghost-wall ${isPending ? "pending-wall" : ""}`}
                  onClick={() => handleMoveClick({ kind: "wall", wall })}
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
                  className={`ghost-wall ${isPending ? "pending-wall" : ""}`}
                  onClick={() => handleMoveClick({ kind: "wall", wall })}
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
                style={{ left: xPos, top: yPos, backgroundColor: color }}
              />
            );
          })}
        </div>
      </div>

      {/* CONFIRM BAR */}
      {pendingMove && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#1f2937",
            padding: "12px 20px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            display: "flex",
            gap: "10px",
            alignItems: "center",
            zIndex: 1000,
            border: "2px solid #3b82f6",
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: "90vw",
          }}
        >
          <span style={{ color: "#ccc", fontSize: "14px" }}>
            {pendingMove.kind === "move"
              ? `Move to (${pendingMove.to.x}, ${pendingMove.to.y})?`
              : `Place ${pendingMove.wall.orientation} wall at (${pendingMove.wall.coord.x}, ${pendingMove.wall.coord.y})?`}
          </span>
          <button
            onClick={() => {
              playMove(pendingMove);
              setPendingMove(null);
            }}
            style={{
              padding: "6px 16px",
              backgroundColor: "#4ade80",
              color: "#1f2937",
              border: "none",
              borderRadius: "4px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Confirm
          </button>
          <button
            onClick={() => setPendingMove(null)}
            style={{
              padding: "6px 16px",
              backgroundColor: "#4b5563",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

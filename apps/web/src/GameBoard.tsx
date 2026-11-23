import { useState, useEffect, useRef } from "react";
import { useGame } from "./useGame";
import { getTurnRing, legalMoves } from "@quoridor/engine";
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
  //onForceSkipTurn?: () => void;
  hideTurnHeader?: boolean;
  onKickPlayer?: (playerName: string) => void;
  onResign?: () => void;
  createdAt?: string; // <-- NEW (optional)
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
  onKickPlayer,
  onResign,
  hideTurnHeader = false,
  createdAt, // <-- NEW
  //onKickPlayer={kickFromGame}
  //onForceSkipTurn,
  //onKickPlayer={kickFromGame}
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

  const isDisconnected = (playerName: string) => {
    if (!onlinePlayers) return false;
    const onlinePlayer = onlinePlayers.find((p: any) => p.name === playerName);
    // If they aren't in the room at all, they've left or been kicked
    if (!onlinePlayer) return true;
    // If they just joined, don't mark as disconnected yet
    if (!onlinePlayer.last_ping) return false;
    return Date.now() - onlinePlayer.last_ping > 25000;
  };
  // Player cards are listed in turn order, left to right, row by row. This is
  // seat order for most games, but team games with an interleaved turn ring
  // would otherwise show the cards in a different order than play proceeds.
  const cardOrder = state ? getTurnRing(state) : [];
  const currentTurnPlayer = state?.players[state?.turnIndex ?? 0];
  const currentDisconnected = currentTurnPlayer
    ? isDisconnected(currentTurnPlayer.name)
    : false;
  const currentStillInRoom =
    !currentTurnPlayer || !onlinePlayers
      ? true
      : onlinePlayers.some((p: any) => p.name === currentTurnPlayer.name);
  const canKick =
    isOnline && isHost && currentDisconnected && currentStillInRoom;
  const localPlayer =
    isOnline && localPlayerId
      ? state?.players.find((p) => p.id === localPlayerId)
      : undefined;
  const canResign =
    isOnline &&
    !hideTurnHeader &&
    state?.status === "active" &&
    !!onResign &&
    !!localPlayer &&
    !localPlayer.eliminated;
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
  const hexToRgba = (hex: string, alpha: number) => {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
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
  const [fadingPlayers, setFadingPlayers] = useState<
    Record<string, "fading" | "gone">
  >({});
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
  // Only team games with the "all must finish" condition pull finished pawns off
  // the board (the result is shown by who is left standing). Everywhere else a
  // finished pawn stays on its goal square, so it's obvious who got home.
  const fadeFinishedPawns =
    !!state?.config?.teams && state?.config?.teamWinCondition === "all";

  // Animate finished players out: they stay rendered briefly, then disappear.
  useEffect(() => {
    if (!state) return;

    if (!fadeFinishedPawns) {
      // Keep finished pawns visible; drop any fade entries left over.
      setFadingPlayers((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }

    const finishedIds = new Set(
      state.players.filter((p) => p.finished).map((p) => p.id),
    );

    // Remove fading entries for players who are no longer finished.
    // (Happens when scrubbing backward in a replay.)
    setFadingPlayers((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!finishedIds.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Add newly-finished players as "fading".
    const newlyFinished = state.players
      .filter((p) => p.finished && !(p.id in fadingPlayers))
      .map((p) => p.id);

    if (newlyFinished.length === 0) return;

    setFadingPlayers((prev) => {
      const next = { ...prev };
      for (const id of newlyFinished) {
        if (!(id in next)) next[id] = "fading";
      }
      return next;
    });

    const timer = window.setTimeout(() => {
      setFadingPlayers((prev) => {
        const next = { ...prev };
        for (const id of newlyFinished) {
          if (next[id] === "fading") next[id] = "gone";
        }
        return next;
      });
    }, 600);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.players.map((p) => `${p.id}:${p.finished}`).join(","), fadeFinishedPawns]);
  // Team colors are derived from the first player (in turn order) of each team.
  // This makes team identity stable and avoids conflicts with player colors.
  const teamColors = (() => {
    const result: { A?: string; B?: string } = {};
    if (!state.config.teams) return result;
    for (const player of state.players) {
      const team = state.config.teams?.[player.id];
      const color =
        player.color ||
        DEFAULT_COLORS[parseInt(player.id.replace("p", ""))] ||
        "#888";
      if (team === "A" && !result.A) {
        result.A = color;
      } else if (team === "B" && !result.B) {
        result.B = color;
      }
      if (result.A && result.B) break;
    }
    return result as { A?: string; B?: string };
  })();
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

  // Scanning for legal moves validates every wall candidate with a pathfinding
  // check: ~11ms on a 9x9 board while walls remain in the pool, and effectively
  // free once they run out. Only the player whose turn it is can use the result
  // (replays and waiting turns filter it all away), so skip the scan then — it
  // ran on every render and made replay playback stutter until walls ran out.
  let currentMoves: Move[] = [];
  if (isMyTurn) {
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
      {/* HEADER */}
      {/* HEADER */}
      {state.status === "finished" ? (
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <h2 style={{ color: "#4ade80" }}>
            {(() => {
              const winner = state.players.find((p) => p.id === state.winner);
              const teams = state.config.teams;
              // Each name is shown in the player's own pawn colour, and the
              // team label in that team's colour (first team member's colour).
              const colorOf = (player: (typeof state.players)[number]) =>
                player.color ||
                DEFAULT_COLORS[parseInt(player.id.replace("p", ""))] ||
                "#888";

              if (!teams || !winner) {
                return winner ? (
                  <>
                    Game Over!{" "}
                    <span style={{ color: colorOf(winner) }}>
                      {winner.name}
                    </span>{" "}
                    wins!
                  </>
                ) : (
                  "Game Over!"
                );
              }

              // Team mode
              const winnerTeam = teams[winner.id];
              const teamColor = winnerTeam
                ? (teamColors[winnerTeam] ?? "#4ade80")
                : "#4ade80";
              const teammates = state.players.filter(
                (p) => teams[p.id] === winnerTeam && !p.eliminated,
              );

              return (
                <>
                  Game Over! <span style={{ color: teamColor }}>Team {winnerTeam}</span>{" "}
                  wins! (
                  {teammates.map((p, index) => (
                    <span key={p.id}>
                      {index > 0 ? ", " : ""}
                      <span style={{ color: colorOf(p) }}>{p.name}</span>
                    </span>
                  ))}
                  )
                </>
              );
            })()}
          </h2>

          {/* Hide action buttons in replay mode */}
          {!hideTurnHeader && (
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
          )}

          <GameResults state={state} />
        </div>
      ) : (
        <div
          style={{
            marginBottom: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            alignItems: "center",
            width: "100%",
          }}
        >
          {/* Top row: Turn indicator (only in live game) + Settings button (always) */}
          <div
            style={{
              display: "flex",
              gap: "15px",
              alignItems: "flex-start",
              justifyContent: "center",
              width: "100%",
              flexWrap: "wrap",
            }}
          >
            {/* Left side: Turn text + Reset/Leave (hidden in replay) */}
            {!hideTurnHeader && (
              <div>
                {(() => {
                  const currentPlayer = state.players[state.turnIndex];
                  let headerText = "Your Turn";
                  let headerColor = "#4ade80";

                  if (localPlayer?.eliminated) {
                    headerText = "Spectating";
                    headerColor = "#ccc";
                  } else if (!isMyTurn && currentPlayer) {
                    if (currentDisconnected) {
                      headerText = `${currentPlayer.name} disconnected...`;
                      headerColor = "#ef4444";
                    } else {
                      headerText = `${currentPlayer.name} is thinking...`;
                      headerColor = "#ccc";
                    }
                  }

                  return (
                    <div>
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
                      {canKick && onKickPlayer && (
                        <button
                          onClick={() => onKickPlayer(currentPlayer!.name)}
                          style={{
                            marginBottom: "10px",
                            padding: "6px 12px",
                            backgroundColor: "#ef4444",
                            color: "white",
                            fontWeight: "bold",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "14px",
                          }}
                        >
                          Kick {currentPlayer!.name}
                        </button>
                      )}
                    </div>
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
                  {canResign && (
                    <button
                      onClick={onResign}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: "#eab308",
                        color: "#1f2937",
                        fontWeight: "bold",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Resign
                    </button>
                  )}
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
            )}

            {/* Settings button is always visible (live game and replay) */}
            <div style={{ paddingTop: hideTurnHeader ? "0px" : "0px" }}>
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
            </div>
          </div>

          {/* Shared Wall Banner */}
          {state.config.wallPool === "shared" && (
            <div
              style={{
                width: "100%",
                maxWidth: "560px",
                backgroundColor: "#374151",
                padding: "10px 16px",
                borderRadius: "6px",
                borderLeft: "4px solid #eab308",
                marginBottom: "10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxSizing: "border-box",
              }}
            >
              <span
                style={{
                  color: "#eab308",
                  fontWeight: "bold",
                  fontSize: "14px",
                  letterSpacing: "0.5px",
                }}
              >
                SHARED WALL POOL
              </span>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: "bold",
                  color:
                    (state.sharedWallsRemaining ?? 0) <= 3
                      ? "#ef4444"
                      : "white",
                }}
              >
                {state.sharedWallsRemaining ?? 0}
              </span>
            </div>
          )}

          {state.config.wallPool === "team" && state.sharedWallsPerTeam && (
            <div
              style={{
                width: "100%",
                maxWidth: "560px",
                backgroundColor: "#374151",
                padding: "10px 16px",
                borderRadius: "6px",
                marginBottom: "10px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                boxSizing: "border-box",
                borderLeft: "4px solid #eab308",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "#eab308",
                  fontWeight: "bold",
                  letterSpacing: "0.5px",
                }}
              >
                WALLS
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                  gap: "16px",
                }}
              >
                {/* Team A: Dot + Name + Count grouped together */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: teamColors.A,
                    }}
                  />
                  <span
                    style={{
                      color: teamColors.A,
                      fontWeight: "bold",
                      fontSize: "14px",
                    }}
                  >
                    TEAM A
                  </span>
                  <span
                    style={{
                      fontSize: "20px",
                      fontWeight: "bold",
                      color:
                        state.sharedWallsPerTeam.A <= 3 ? "#ef4444" : "white",
                    }}
                  >
                    {state.sharedWallsPerTeam.A}
                  </span>
                </div>

                {/* Team B: Dot + Name + Count grouped together */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flex: 1,
                    justifyContent: "flex-end", // Aligns the group to the right
                  }}
                >
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: teamColors.B,
                    }}
                  />
                  <span
                    style={{
                      color: teamColors.B,
                      fontWeight: "bold",
                      fontSize: "14px",
                    }}
                  >
                    TEAM B
                  </span>
                  <span
                    style={{
                      fontSize: "20px",
                      fontWeight: "bold",
                      color:
                        state.sharedWallsPerTeam.B <= 3 ? "#ef4444" : "white",
                    }}
                  >
                    {state.sharedWallsPerTeam.B}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Player Cards (ALWAYS visible) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "10px",
              width: "100%",
              maxWidth: "560px",
            }}
          >
            {cardOrder.map((i) => {
              const p = state.players[i]!;
              const disconnected = isDisconnected(p.name);
              const leftRoom = onlinePlayers
                ? !onlinePlayers.some((op: any) => op.name === p.name)
                : false;
              const isOut = p.eliminated || leftRoom;
              // A resigned player is still in the room: strike the card but
              // don't dim it. Leaving / being kicked gets both treatments.
              const isGone =
                leftRoom ||
                (p.eliminated && p.eliminationReason !== "resigned");
              const team = state.config.teams?.[p.id]; // ← fixed
              const winnerTeam =
                state.winner !== null
                  ? state.config.teams?.[state.winner]
                  : undefined;
              const isOnWinningTeam =
                state.status === "finished" &&
                !!team &&
                !!winnerTeam &&
                team === winnerTeam;
              /*const teamRing =
                team === "A"
                  ? teamColors.A
                  : team === "B"
                    ? teamColors.B
                    : undefined;*/
              const teamBg =
                team === "A" && teamColors.A
                  ? hexToRgba(teamColors.A, 0.5)
                  : team === "B" && teamColors.B
                    ? hexToRgba(teamColors.B, 0.5)
                    : "#374151";
              const isFinishedInTeamAllMode =
                !!state.config.teams &&
                state.config.teamWinCondition === "all" &&
                p.finished === true;

              return (
                <div
                  key={p.id}
                  style={{
                    backgroundColor: teamBg,
                    padding: "10px",
                    borderRadius: "6px",
                    outline:
                      state.turnIndex === i
                        ? `2px solid ${disconnected ? "#ef4444" : "#4ade80"}`
                        : "none",
                    outlineOffset: "-2px",
                    opacity: disconnected || isGone ? 0.5 : 1,
                    textDecoration: isOut ? "line-through" : "none",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    minWidth: 0,
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
                      {(isFinishedInTeamAllMode || isOnWinningTeam) && (
                        <span style={{ color: "#4ade80", marginLeft: "4px" }}>
                          ✓
                        </span>
                      )}
                    </strong>
                  </div>

                  {state.config.wallPool === "per-player" && (
                    <div
                      style={{
                        fontSize: "14px",
                        color: isFinishedInTeamAllMode ? "#4ade80" : "#ccc",
                      }}
                    >
                      {isFinishedInTeamAllMode
                        ? "Finished!"
                        : isOnWinningTeam
                          ? "Winner!"
                          : isOut
                            ? p.eliminationReason === "resigned"
                              ? "Resigned"
                              : "Left"
                            : `Walls: ${p.wallsRemaining}`}
                    </div>
                  )}
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
              width: "320px",
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
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

            <h3 style={{ marginTop: 0 }}>
              {hideTurnHeader ? "Game Details" : "Game Settings"}
            </h3>

            {/* --- GAME CONFIGURATION (read-only) --- */}
            <div style={{ fontSize: "14px", lineHeight: "1.8" }}>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Board Size:</strong> {state.config.boardSize}x
                {state.config.boardSize}
              </p>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Goal:</strong>{" "}
                {state.config.goalCondition === "center"
                  ? "King of the Hill"
                  : state.config.goalCondition === "top"
                    ? "Reach the Top"
                    : "Reach Opposite Edge"}
              </p>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Players:</strong> {state.players.length}
              </p>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Teams:</strong>{" "}
                {state.config.teams
                  ? `Yes (${state.config.teamWinCondition === "any" ? "First to finish" : "All must finish"})`
                  : "No"}
              </p>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Walls:</strong> {state.config.startingWalls}{" "}
                {state.config.teams ? "per team" : "per player"}
              </p>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Wall Pool:</strong>{" "}
                {state.config.wallPool === "per-player" && "Per Player"}
                {state.config.wallPool === "shared" &&
                  (state.config.teams
                    ? "Shared (Both Teams)"
                    : "Shared (All Players)")}
                {state.config.wallPool === "team" && "Shared (Per Team)"}
              </p>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Lenient Jumps:</strong>{" "}
                {state.config.lenientJumps ? "Yes" : "No"}
              </p>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Randomize Spawns:</strong>{" "}
                {state.config.randomizeSpawns !== false ? "Yes" : "No"}
              </p>
              {(state.createdAt ?? createdAt) && (
                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>Date:</strong>{" "}
                  {new Date((state.createdAt ?? createdAt)!).toLocaleString()}
                </p>
              )}
            </div>

            {/* --- USER PREFERENCES --- */}
            <hr style={{ borderColor: "#4b5563", margin: "15px 0" }} />

            {!hideTurnHeader && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  marginBottom: "10px",
                }}
              >
                <input
                  type="checkbox"
                  checked={confirmMoves}
                  onChange={(e) => setConfirmMoves(e.target.checked)}
                />
                Confirm moves before playing
              </label>
            )}

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                marginBottom: hideTurnHeader ? "0" : "10px",
              }}
            >
              <input
                type="checkbox"
                checked={showGoalLines}
                onChange={(e) => setShowGoalLines(e.target.checked)}
              />
              Show goal indicators
            </label>

            {/* --- RESTART (live game only) --- */}
            {!hideTurnHeader && (!isOnline || isHost) && (
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
              </div>
            )}
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
            state.config.teams && (
              <>
                {/* Team B's goal: bottom edge (they come from top) */}
                <div
                  className="goal-line horizontal"
                  style={{
                    top: 0,
                    backgroundColor: teamColors.A ?? "#3b82f6",
                    boxShadow: `0 0 8px ${teamColors.A ?? "#3b82f6"}`,
                  }}
                />
                <div
                  className="goal-line horizontal"
                  style={{
                    bottom: 0,
                    backgroundColor: teamColors.B ?? "#ef4444",
                    boxShadow: `0 0 8px ${teamColors.B ?? "#ef4444"}`,
                  }}
                />
              </>
            )}

          {state.status !== "finished" &&
            showGoalLines &&
            state.config.goalCondition === "opposite-edge" &&
            !state.config.teams &&
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
            const team = placingPlayer
              ? state.config.teams?.[placingPlayer.id]
              : undefined;

            let wallColor: string;
            if (team === "A" && teamColors.A) {
              wallColor = teamColors.A;
            } else if (team === "B" && teamColors.B) {
              wallColor = teamColors.B;
            } else if (placingPlayer?.color) {
              wallColor = placingPlayer.color;
            } else if (playerIndex >= 0) {
              wallColor = DEFAULT_COLORS[playerIndex] ?? "#b45309";
            } else {
              wallColor = "#b45309";
            }
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
          {/* 4. Animated Players */}
          {state.players.map((player) => {
            // A player who left or was kicked has no pawn on the board.
            if (player.eliminated) return null;
            const fadeState = fadingPlayers[player.id];
            if (fadeState === "gone") return null;

            // If finished but not yet in the fading map (first render after finish),
            // we still want to show the pawn for one frame at its final position
            // before the fade effect kicks in. The effect sets it to "fading" on the
            // next tick, so this fallback just prevents a 1-frame blink.
            //if (player.finished && !fadeState) return null;

            const pIndex = parseInt(player.id.replace("p", ""));
            const color = player.color || DEFAULT_COLORS[pIndex];
            const team = state.config.teams?.[player.id];
            const teamRing =
              team === "A"
                ? (teamColors.A ?? "#3b82f6")
                : team === "B"
                  ? (teamColors.B ?? "#ef4444")
                  : undefined;

            const ringThickness = 6;

            const xPos = `calc(var(--padding) + ${player.position.x} * (var(--tile-size) + var(--gap-size)))`;
            const yPos = `calc(var(--padding) + ${boardSize - 1 - player.position.y} * (var(--tile-size) + var(--gap-size)))`;

            const isFading = fadeState === "fading";

            return (
              <div
                key={player.id}
                className="player-piece-animated"
                style={{
                  left: xPos,
                  top: yPos,
                  backgroundColor: color,
                  boxShadow: teamRing
                    ? `inset 0 0 0 ${ringThickness}px ${teamRing}, 0 2px 4px rgba(0,0,0,0.4)`
                    : "0 2px 4px rgba(0,0,0,0.4)",
                  opacity: isFading ? 0 : 1,
                  transform: isFading ? "scale(0.4)" : "scale(0.8)",
                  transition:
                    "left 0.3s ease-in-out, top 0.3s ease-in-out, opacity 0.5s ease-out, transform 0.5s ease-out",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* CONFIRM BAR */}

      {pendingMove &&
        (pendingMove.kind === "move" || pendingMove.kind === "wall") && (
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

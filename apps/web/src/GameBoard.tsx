import { useGame } from "./useGame";
import { legalMoves } from "@quoridor/engine";
import type { GameState, Move } from "@quoridor/engine";
import "./GameBoard.css";

interface GameBoardProps {
  playerNames: string[];
  vsBot: boolean;
  onlineState?: GameState | null;
  onlinePlayMove?: (move: Move) => void;
  onlineResetGame?: () => void;
  localPlayerId?: "p0" | "p1" | "p2" | "p3";
  useWood?: boolean;
  onLeave?: () => void;
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
}: GameBoardProps) {
  const localGame = useGame(playerNames, vsBot);

  const state = onlineState || localGame.state;
  const playMove = onlinePlayMove || localGame.playMove;
  const resetGame = onlineResetGame || localGame.resetGame;

  const isMyTurn = localPlayerId
    ? state?.players[state.turnIndex]?.id === localPlayerId
    : true;

  if (!state) return null;
  const { boardSize } = state.config;

  const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#eab308", "#22c55e"]; // Red, Blue, Yellow, Green

  const currentMoves = legalMoves(state);

  const validPawnMoves = isMyTurn
    ? currentMoves.filter((m) => m.kind === "move").map((m) => m.to)
    : [];
  const validWallMoves = isMyTurn
    ? currentMoves.filter((m) => m.kind === "wall").map((m) => m.wall)
    : [];

  const isValidMove = (x: number, y: number) =>
    validPawnMoves.some((m) => m.x === x && m.y === y);

  // Sound Helper
  const playSound = (type: "move" | "wall" | "win") => {
    const audio = new Audio(`/${type}.mp3`);
    audio.volume = 0.5; // Keep it subtle
    audio.play().catch((e) => console.log("Audio play failed:", e));
  };

  return (
    <div>
      {state.status === "finished" ? (
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <h2 style={{ color: "#4ade80" }}>
            Game Over! {state.players.find((p) => p.id === state.winner)?.name}{" "}
            wins!
          </h2>
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
                : `Waiting for ${state.players[state.turnIndex]?.name}...`}
            </h2>
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
            {/* ADD THIS LEAVE BUTTON */}
            {onLeave && (
              <button
                onClick={onLeave}
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

          <div style={{ display: "flex", gap: "10px" }}>
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
                      backgroundColor: PLAYER_COLORS[i],
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

      <div
        className={`board-container ${useWood ? "wood" : ""}`}
        style={{
          // @ts-ignore (TypeScript doesn't like custom CSS vars)
          "--cols": boardSize - 1,
          "--rows": boardSize - 1,
        }}
      >
        {/* 1. The Tiles & Players */}
        {Array.from({ length: boardSize }).map((_, y) =>
          Array.from({ length: boardSize }).map((_, x) => {
            const isTarget = isValidMove(x, y);

            return (
              <div
                key={`tile-${x}-${y}`}
                onClick={() => {
                  if (isTarget) {
                    playSound("move");
                    playMove({ kind: "move", to: { x, y } });
                  }
                }}
                className={`tile ${isTarget ? "valid-move" : ""}`}
                style={{
                  gridColumn: x * 2 + 1,
                  gridRow: (boardSize - 1 - y) * 2 + 1,
                }}
              ></div>
            );
          }),
        )}

        {/* 2. Placed Walls (Colored by Player) */}
        {state.walls.map((wall, i) => {
          const playerIndex = wall.placedBy
            ? parseInt(wall.placedBy.replace("p", ""))
            : -1;
          const wallColor =
            playerIndex >= 0 ? PLAYER_COLORS[playerIndex] : "#b45309";

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

        {/* 3. Ghost Walls (Hover effect) */}
        {validWallMoves.map((wall, i) => {
          if (wall.orientation === "horizontal") {
            return (
              <div
                key={`ghost-h-${i}`}
                className="ghost-wall"
                onClick={() => {
                  playSound("wall");
                  playMove({ kind: "wall", wall });
                }}
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
                onClick={() => {
                  playSound("wall");
                  playMove({ kind: "wall", wall });
                }}
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
          return (
            <div
              key={player.id}
              className="player-piece-animated"
              style={{
                gridColumn: player.position.x * 2 + 1,
                gridRow: (boardSize - 1 - player.position.y) * 2 + 1,
                backgroundColor: PLAYER_COLORS[pIndex],
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

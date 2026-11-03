import { getDistanceToGoal } from "@quoridor/engine";
import type { GameState } from "@quoridor/engine";

const DEFAULT_COLORS = ["#3b82f6", "#ef4444", "#eab308", "#22c55e"];

export function GameResults({ state }: { state: GameState }) {
  // Calculate distance for each player
  const results = state.players
    .map((player, turnOrder) => ({
      player,
      turnOrder,
      distance: getDistanceToGoal(state, player.id),
      color:
        player.color || DEFAULT_COLORS[parseInt(player.id.replace("p", ""))],
    }))
    .sort((a, b) => {
      // Primary: distance (ascending)
      if (a.distance !== b.distance) return a.distance - b.distance;
      // Secondary: turn order (who would have played next)
      return a.turnOrder - b.turnOrder;
    });

  const maxDistance = Math.max(...results.map((r) => r.distance), 1);

  return (
    <div
      style={{
        backgroundColor: "#1f2937",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        maxWidth: "500px",
        marginInline: "auto",
      }}
    >
      <h3 style={{ margin: "0 0 15px 0", textAlign: "center" }}>
        Final Standings
      </h3>
      {results.map((r, i) => {
        const isWinner = state.winner === r.player.id;
        // Bar length: closer to goal = longer bar
        const progress =
          maxDistance === 0 ? 1 : (maxDistance - r.distance) / maxDistance;
        const barWidth = Math.max(progress * 100, 5); // min 5% so bar is always visible

        return (
          <div
            key={r.player.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            {/* Rank number */}
            <div
              style={{
                width: "20px",
                textAlign: "right",
                color: isWinner ? "#4ade80" : "#ccc",
                fontWeight: isWinner ? "bold" : "normal",
              }}
            >
              {i + 1}.
            </div>

            {/* Color dot */}
            <div
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                backgroundColor: r.color,
                flexShrink: 0,
              }}
            />

            {/* Name */}
            <div
              style={{
                width: "100px",
                fontWeight: isWinner ? "bold" : "normal",
                color: isWinner ? "#4ade80" : "white",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={r.player.name}
            >
              {r.player.name}
            </div>

            {/* Bar */}
            <div
              style={{
                flex: 1,
                height: "20px",
                backgroundColor: "#374151",
                borderRadius: "4px",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${barWidth}%`,
                  height: "100%",
                  backgroundColor: r.color,
                  transition: "width 0.3s ease-out",
                  opacity: isWinner ? 1 : 0.75,
                }}
              />
            </div>

            {/* Distance */}
            <div
              style={{
                width: "30px",
                textAlign: "right",
                color: isWinner ? "#4ade80" : "#ccc",
                fontWeight: isWinner ? "bold" : "normal",
                fontSize: "14px",
              }}
            >
              {r.distance}
            </div>
          </div>
        );
      })}

      <div
        style={{
          fontSize: "11px",
          color: "#888",
          textAlign: "center",
          marginTop: "10px",
        }}
      >
        Distance = shortest path to goal (walls included)
      </div>
    </div>
  );
}

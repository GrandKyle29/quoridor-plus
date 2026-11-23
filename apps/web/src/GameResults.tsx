import { getDistanceToGoal } from "@quoridor/engine";
import type { GameState } from "@quoridor/engine";

const DEFAULT_COLORS = ["#3b82f6", "#ef4444", "#eab308", "#22c55e"];

export function GameResults({ state }: { state: GameState }) {
  const teams = state.config.teams;
  const winnerTeam = teams && state.winner ? teams[state.winner] : undefined;
  // "All must finish": every member of the winning team crossed the line, so a
  // single-player highlight would point at whoever happened to finish last.
  // Highlight the whole team instead and rank by who finished first.
  const isTeamAllMode =
    !!winnerTeam && (state.config.teamWinCondition ?? "all") === "all";
  const finishOrder = state.finishOrder ?? [];
  const finishRank = (playerId: string) => {
    const index = finishOrder.indexOf(playerId);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };

  // Calculate distance for each player
  const results = state.players
    .filter((player) => !player.eliminated)
    .map((player, turnOrder) => ({
      player,
      turnOrder,
      distance: getDistanceToGoal(state, player.id),
      color:
        player.color || DEFAULT_COLORS[parseInt(player.id.replace("p", ""))],
    }))
    .sort((a, b) => {
      // "All must finish" team games: whoever crossed the line first ranks first
      if (isTeamAllMode) {
        const rankA = finishRank(a.player.id);
        const rankB = finishRank(b.player.id);
        // Players not in the log (e.g. unfinished opponents) sort last, then
        // fall back to the usual distance / turn-order comparison below.
        if (rankA !== rankB) return rankA < rankB ? -1 : 1;
      }
      // Primary: distance (ascending)
      if (a.distance !== b.distance) return a.distance - b.distance;
      // Secondary: turn order (who would have played next)
      return a.turnOrder - b.turnOrder;
    });

  const maxDistance = Math.max(...results.map((r) => r.distance), 1);

  // Team mode: bars use the team colour so the team standings read at a
  // glance (especially with "first to finish", where only one player actually
  // won). Derived the same way as the board: each team takes its first
  // member's colour. The dot keeps the player's own colour for identification.
  const teamColors: { A?: string; B?: string } = {};
  if (teams) {
    for (const player of state.players) {
      const team = teams[player.id];
      if (!team) continue;
      const color =
        player.color ||
        DEFAULT_COLORS[parseInt(player.id.replace("p", ""))] ||
        "#888";
      if (!teamColors[team]) teamColors[team] = color;
      if (teamColors.A && teamColors.B) break;
    }
  }

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
        const team = teams?.[r.player.id];
        // A whole team is highlighted once every one of its members finished.
        const isWinner = isTeamAllMode
          ? team === winnerTeam
          : state.winner === r.player.id;
        const barColor = (team && teamColors[team]) || r.color;
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
                  backgroundColor: barColor,
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

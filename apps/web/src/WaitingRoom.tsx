import { supabase } from "./supabase";
import { createGame } from "@quoridor/engine";
import type { GameConfig } from "@quoridor/engine";
import { COLOR_PALETTE } from "./utils";

export function WaitingRoom({
  room,
  isHost,
  myId,
  leaveRoom,
}: {
  room: any;
  isHost: boolean;
  myId: string;
  leaveRoom: () => void;
}) {
  const updateConfig = async (key: string, value: any) => {
    if (!isHost) return;
    // Fetch fresh state to avoid races
    const { data } = await supabase
      .from("rooms")
      .select("config")
      .eq("id", room.id)
      .single();
    const newConfig = { ...(data?.config ?? {}), [key]: value };
    await supabase
      .from("rooms")
      .update({ config: newConfig })
      .eq("id", room.id);
  };

  // Atomic teams toggle — single write, no partial updates
  const setTeamsMode = async (enable: boolean) => {
    if (!isHost) return;
    const { data } = await supabase
      .from("rooms")
      .select("config")
      .eq("id", room.id)
      .single();
    const currentConfig = data?.config ?? {};
    let newConfig = { ...currentConfig, useTeams: enable };
    if (enable) {
      if (newConfig.wallPool === "per-player") {
        newConfig.wallPool = "team";
      }
    } else {
      newConfig.teams = {};
      if (newConfig.wallPool === "team") {
        newConfig.wallPool = "per-player";
      }
    }
    await supabase
      .from("rooms")
      .update({ config: newConfig })
      .eq("id", room.id);
  };
  const resetToDefaults = async () => {
    if (!isHost) return;
    const defaults = {
      boardSize: 9,
      goalCondition: "opposite-edge",
      startingWalls: 10,
      wallPool: "per-player",
      useTeams: false,
      teamWinCondition: "all",
      lenientJumps: false,
      randomizeSpawns: true,
      teams: {},
    };
    await supabase.from("rooms").update({ config: defaults }).eq("id", room.id);
  };

  const setWallPool = async (pool: "per-player" | "shared" | "team") => {
    if (!isHost) return;
    await updateConfig("wallPool", pool);
  };

  const setPlayerTeam = async (playerId: string, team: "A" | "B") => {
    if (!isHost) return;
    const { data } = await supabase
      .from("rooms")
      .select("config")
      .eq("id", room.id)
      .single();
    const currentConfig = data?.config ?? {};
    const newTeams = { ...(currentConfig.teams ?? {}), [playerId]: team };
    const newConfig = { ...currentConfig, teams: newTeams };
    await supabase
      .from("rooms")
      .update({ config: newConfig })
      .eq("id", room.id);
  };

  const clearTeams = async () => {
    if (!isHost) return;
    const { data } = await supabase
      .from("rooms")
      .select("config")
      .eq("id", room.id)
      .single();
    const currentConfig = data?.config ?? {};
    const newConfig = { ...currentConfig, teams: {} };
    await supabase
      .from("rooms")
      .update({ config: newConfig })
      .eq("id", room.id);
  };

  const playerCount = room.players.length;
  const boardSize = room.config?.boardSize ?? 9;
  const reachTheTopDisabled = playerCount > boardSize;
  const teamsAvailable = playerCount >= 4;
  const teamsEnabled = teamsAvailable && room.config?.useTeams === true;
  const teams: { [id: string]: "A" | "B" } = room.config?.teams ?? {};
  const hasExplicitTeams = Object.keys(teams).length > 0;

  const canMovePlayerToTeam = (playerId: string, newTeam: "A" | "B") => {
    const currentTeam = teams[playerId];
    if (currentTeam === newTeam) return true;

    const simulated: { [id: string]: "A" | "B" } = { ...teams };
    if (currentTeam) delete simulated[playerId];
    simulated[playerId] = newTeam;

    const assignedA = Object.values(simulated).filter((t) => t === "A").length;
    const assignedB = Object.values(simulated).filter((t) => t === "B").length;
    const unassigned = playerCount - assignedA - assignedB;

    let finalA = assignedA;
    let finalB = assignedB;
    for (let i = 0; i < unassigned; i++) {
      if (finalA <= finalB) finalA++;
      else finalB++;
    }

    return Math.abs(finalA - finalB) <= 1;
  };

  const startability = (() => {
    if (room.players.length < 2) {
      return { ok: false, reason: "Waiting for at least 2 players..." };
    }
    const mode = room.config?.goalCondition ?? "opposite-edge";
    if (mode === "top" && room.players.length > boardSize) {
      return {
        ok: false,
        reason: `Reach the Top needs ${room.players.length} tiles, but this board has ${boardSize}.`,
      };
    }
    if (room.config?.useTeams && room.players.length < 4) {
      return {
        ok: false,
        reason: "Team mode requires at least 4 players.",
      };
    }
    return { ok: true, reason: "" };
  })();

  const claimColor = async (colorHex: string) => {
    if (room.players.some((p: any) => p.color === colorHex && p.id !== myId))
      return;
    const newPlayers = room.players.map((p: any) =>
      p.id === myId ? { ...p, color: colorHex } : p,
    );
    await supabase
      .from("rooms")
      .update({ players: newPlayers })
      .eq("id", room.id);
  };

  const startGame = async () => {
    if (
      room.config?.goalCondition === "top" &&
      room.players.length > (room.config?.boardSize ?? 9)
    ) {
      alert(
        "Reach the Top cannot be played with this many players on this board size.",
      );
      await updateConfig("goalCondition", "opposite-edge");
      return;
    }
    if (room.config?.useTeams && room.players.length < 4) {
      alert("Team mode requires at least 4 players.");
      return;
    }

    const playerNames = room.players.map((p: any) => p.name);
    const playerColors = room.players.map((p: any) => p.color);

    const config: GameConfig = {
      schemaVersion: 4,
      boardSize: room.config?.boardSize || 9,
      minPlayers: 2,
      maxPlayers: room.max_players || 8,
      startingWalls: room.config?.startingWalls ?? 10,
      wallPool: room.config?.wallPool || "per-player",
      goalCondition: room.config?.goalCondition || "opposite-edge",
      allowDiagonalJumps: true,
      mustNotBlockPath: true,
      elimination: false,
      turnOrder: "clockwise",
      randomizeSpawns: room.config?.randomizeSpawns !== false,
      lenientJumps: room.config?.lenientJumps === true,
      useTeams: room.config?.useTeams === true,
      teamWinCondition: room.config?.teamWinCondition || "all",
      teams: room.config?.teams ?? {},
    };

    let initialState;
    try {
      initialState = createGame(config, playerNames, playerColors);
    } catch (err) {
      console.error("createGame threw:", err);
      alert(
        `Cannot start game: ${err instanceof Error ? err.message : "Unknown error"}.`,
      );
      return;
    }

    await supabase
      .from("rooms")
      .update({ status: "playing", game_state: initialState })
      .eq("id", room.id);
  };

  const kickPlayer = async (playerIdToKick: string) => {
    if (!isHost) return;
    const newPlayers = room.players.filter((p: any) => p.id !== playerIdToKick);
    await supabase
      .from("rooms")
      .update({ players: newPlayers })
      .eq("id", room.id);
  };

  const isPlayerDisconnected = (p: any) => {
    if (!p.last_ping) return false;
    return Date.now() - p.last_ping > 25000;
  };

  // Which wall pool options are valid right now
  const wallPoolOptions = teamsEnabled
    ? (["shared", "team"] as const)
    : (["per-player", "shared"] as const);
  const currentWallPool = room.config?.wallPool || "per-player";

  return (
    <div style={{ textAlign: "center", marginTop: "50px", color: "white" }}>
      <h2>Waiting Room</h2>
      <h1 style={{ fontSize: "48px", letterSpacing: "4px", color: "#4ade80" }}>
        {room.id}
      </h1>
      <p>Share this code with your friends!</p>

      {/* Player list */}
      <div
        style={{
          margin: "30px 0",
          padding: "20px",
          backgroundColor: "#374151",
          borderRadius: "8px",
          maxWidth: "360px",
          marginInline: "auto",
        }}
      >
        <h3>Players ({room.players.length})</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {room.players.map((p: any) => {
            const disconnected = isPlayerDisconnected(p);
            const team = teams[p.id];
            const canJoinA = canMovePlayerToTeam(p.id, "A");
            const canJoinB = canMovePlayerToTeam(p.id, "B");
            return (
              <li
                key={p.id}
                style={{
                  fontSize: "18px",
                  margin: "8px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  borderRadius: "4px",
                  opacity: disconnected ? 0.5 : 1,
                  backgroundColor:
                    team === "A"
                      ? "rgba(59, 130, 246, 0.2)"
                      : team === "B"
                        ? "rgba(239, 68, 68, 0.2)"
                        : "transparent",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: p.color || "#fff",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.name} {p.id === room.host_id && "(Host)"}{" "}
                    {p.id === myId && "(You)"}
                  </span>
                  {disconnected && (
                    <span
                      style={{
                        color: "#ef4444",
                        fontSize: "12px",
                        fontStyle: "italic",
                      }}
                    >
                      (Disconnected)
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                  {teamsEnabled && (
                    <>
                      <button
                        disabled={!isHost || !canJoinA}
                        onClick={() => setPlayerTeam(p.id, "A")}
                        style={{
                          padding: "2px 10px",
                          backgroundColor: team === "A" ? "#3b82f6" : "#4b5563",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: !isHost
                            ? "default"
                            : canJoinA
                              ? "pointer"
                              : "not-allowed",
                          opacity: canJoinA ? 1 : 0.3,
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                      >
                        A
                      </button>
                      <button
                        disabled={!isHost || !canJoinB}
                        onClick={() => setPlayerTeam(p.id, "B")}
                        style={{
                          padding: "2px 10px",
                          backgroundColor: team === "B" ? "#ef4444" : "#4b5563",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: !isHost
                            ? "default"
                            : canJoinB
                              ? "pointer"
                              : "not-allowed",
                          opacity: canJoinB ? 1 : 0.3,
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                      >
                        B
                      </button>
                    </>
                  )}
                  {isHost && p.id !== myId && (
                    <button
                      onClick={() => kickPlayer(p.id)}
                      style={{
                        marginLeft: "6px",
                        padding: "2px 8px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      Kick
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Color picker */}
      <div
        style={{
          margin: "20px 0",
          padding: "15px",
          backgroundColor: "#2c2c2c",
          borderRadius: "8px",
          maxWidth: "320px",
          marginInline: "auto",
        }}
      >
        <h4 style={{ margin: "0 0 10px 0" }}>Choose Your Color</h4>
        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {COLOR_PALETTE.map((c) => {
            const isTaken = room.players.some(
              (p: any) => p.color === c.hex && p.id !== myId,
            );
            const isMine =
              room.players.find((p: any) => p.id === myId)?.color === c.hex;
            return (
              <div
                key={c.hex}
                onClick={() => !isTaken && claimColor(c.hex)}
                title={isTaken ? "Taken" : c.name}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: c.hex,
                  cursor: isTaken ? "not-allowed" : "pointer",
                  border: isMine ? "3px solid white" : "3px solid transparent",
                  opacity: isTaken ? 0.2 : 1,
                  boxShadow: isMine ? "0 0 10px rgba(255,255,255,0.6)" : "none",
                  transition: "all 0.2s",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Settings */}
      <div
        style={{
          margin: "0 auto 30px auto",
          maxWidth: "320px",
          textAlign: "left",
          padding: "20px",
          border: "1px solid #555",
          borderRadius: "8px",
          opacity: isHost ? 1 : 0.7,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px",
          }}
        >
          <h3 style={{ margin: 0 }}>
            Game Settings {!isHost && "(Host Only)"}
          </h3>
          {isHost && (
            <button
              onClick={resetToDefaults}
              style={{
                padding: "6px 12px",
                backgroundColor: "#4b5563",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Reset to Defaults
            </button>
          )}
        </div>

        {/* Board Size */}
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "14px" }}>
            Board Size:
          </label>
          <select
            disabled={!isHost}
            value={boardSize}
            onChange={(e) => updateConfig("boardSize", Number(e.target.value))}
            style={{ width: "100%", padding: "8px", color: "black" }}
          >
            <option value={7}>7x7</option>
            <option value={9}>9x9 (Classic)</option>
            <option value={11}>11x11</option>
          </select>
        </div>

        {/* Win Condition */}
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "14px" }}>
            Win Condition:
          </label>
          <select
            disabled={!isHost}
            value={room.config?.goalCondition || "opposite-edge"}
            onChange={(e) => updateConfig("goalCondition", e.target.value)}
            style={{ width: "100%", padding: "8px", color: "black" }}
          >
            <option value="opposite-edge">Reach Opposite Side</option>
            <option value="center">King of the Hill</option>
            <option value="top" disabled={reachTheTopDisabled}>
              Reach the Top{reachTheTopDisabled ? " (unavailable)" : ""}
            </option>
          </select>
        </div>

        {/* Walls per Player / Team */}
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "14px" }}>
            {teamsEnabled ? "Walls per Team:" : "Walls per Player:"}
          </label>
          <input
            disabled={!isHost}
            type="number"
            value={room.config?.startingWalls ?? 10}
            onChange={(e) =>
              updateConfig("startingWalls", Number(e.target.value))
            }
            style={{
              width: "100%",
              padding: "8px",
              boxSizing: "border-box",
              color: "black",
            }}
          />
        </div>

        {/* Wall Pool — always enabled, options depend on teams */}
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "14px" }}>
            Wall Pool:
          </label>
          <select
            disabled={!isHost}
            value={currentWallPool}
            onChange={(e) => setWallPool(e.target.value as any)}
            style={{ width: "100%", padding: "8px", color: "black" }}
          >
            {wallPoolOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "per-player" && "Per Player"}
                {opt === "shared" &&
                  (teamsEnabled
                    ? "Shared (Both Teams)"
                    : "Shared (All Players)")}
                {opt === "team" && "Shared (Per Team)"}
              </option>
            ))}
          </select>
        </div>

        {/* Separator */}
        <div style={{ borderTop: "1px solid #555", margin: "15px 0" }} />

        {/* Teams */}
        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            disabled={!isHost || !teamsAvailable}
            checked={teamsEnabled}
            onChange={(e) => setTeamsMode(e.target.checked)}
          />
          Teams mode
        </label>
        {!teamsAvailable && (
          <p style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>
            Teams require at least 4 players.
          </p>
        )}
        {teamsEnabled && (
          <p style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>
            Assign players with the A/B buttons above. Unassigned players will
            be randomly distributed when the game starts.
          </p>
        )}

        {/* Team Win Condition */}
        {teamsEnabled && (
          <div style={{ marginTop: "10px" }}>
            <label style={{ display: "block", fontSize: "14px" }}>
              Team Win Condition:
            </label>
            <select
              disabled={!isHost}
              value={room.config?.teamWinCondition || "all"}
              onChange={(e) => updateConfig("teamWinCondition", e.target.value)}
              style={{ width: "100%", padding: "8px", color: "black" }}
            >
              <option value="all">All members must reach the goal</option>
              <option value="any">First member to reach wins</option>
            </select>
          </div>
        )}

        {/* Clear teams */}
        {teamsEnabled && hasExplicitTeams && isHost && (
          <button
            onClick={clearTeams}
            style={{
              width: "100%",
              padding: "6px",
              backgroundColor: "#4b5563",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginTop: "10px",
            }}
          >
            Clear team assignments
          </button>
        )}

        {/* Separator */}
        <div style={{ borderTop: "1px solid #555", margin: "15px 0" }} />

        {/* Other toggles */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "10px",
          }}
        >
          <input
            type="checkbox"
            disabled={!isHost}
            checked={room.config?.lenientJumps === true}
            onChange={(e) => updateConfig("lenientJumps", e.target.checked)}
          />
          Lenient jumps
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            disabled={!isHost}
            checked={room.config?.randomizeSpawns !== false}
            onChange={(e) => updateConfig("randomizeSpawns", e.target.checked)}
          />
          Randomize Start Positions
        </label>
      </div>

      {/* Start / Waiting */}
      {isHost ? (
        <>
          <button
            onClick={startGame}
            disabled={!startability.ok}
            style={{
              padding: "12px 24px",
              fontSize: "18px",
              backgroundColor: startability.ok ? "#4ade80" : "#4b5563",
              color: "#1f2937",
              fontWeight: "bold",
              border: "none",
              borderRadius: "4px",
              cursor: startability.ok ? "pointer" : "not-allowed",
              marginBottom: "10px",
            }}
          >
            {startability.ok ? "Start Game" : "Cannot Start"}
          </button>
          {!startability.ok && (
            <p
              style={{
                color: "#ef4444",
                fontSize: "13px",
                maxWidth: "320px",
                marginInline: "auto",
                marginBottom: "20px",
              }}
            >
              {startability.reason}
            </p>
          )}
        </>
      ) : (
        <p style={{ color: "#ccc", marginBottom: "20px" }}>
          Waiting for the host to start the game...
        </p>
      )}

      <div style={{ marginBottom: "40px" }}>
        <button
          onClick={leaveRoom}
          style={{
            padding: "8px 16px",
            backgroundColor: "#ef4444",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}

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
  // Helper to update settings live in the database
  const updateConfig = async (key: string, value: any) => {
    if (!isHost) return; // Only host can update!
    const newConfig = { ...room.config, [key]: value };
    await supabase
      .from("rooms")
      .update({ config: newConfig })
      .eq("id", room.id);
  };
  /*
  const updateMaxPlayers = async (value: number) => {
    if (!isHost) return;
    await supabase
      .from("rooms")
      .update({ max_players: value })
      .eq("id", room.id);
  };
*/
  const claimColor = async (colorHex: string) => {
    // Check if taken (by someone else)
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
    const playerNames = room.players.map((p: any) => p.name);
    const playerColors = room.players.map((p: any) => p.color); // <-- Get colors

    const config: GameConfig = {
      schemaVersion: 1,
      boardSize: room.config?.boardSize || 9,
      minPlayers: 2, // Engine requires at least 2
      maxPlayers: 4, // Max possible, engine will adapt
      startingWalls: room.config?.startingWalls ?? 10,
      wallPool: "per-player",
      goalCondition: room.config?.goalCondition || "opposite-edge",
      allowDiagonalJumps: true,
      mustNotBlockPath: true,
      elimination: false,
      turnOrder: "clockwise",
    };

    const initialState = createGame(config, playerNames, playerColors); // <-- Pass colors!

    await supabase
      .from("rooms")
      .update({
        status: "playing",
        game_state: initialState,
      })
      .eq("id", room.id);
  };
  const kickPlayer = async (playerIdToKick: string) => {
    if (!isHost) return; // Only host can kick

    // Remove the player from the array
    const newPlayers = room.players.filter((p: any) => p.id !== playerIdToKick);

    await supabase
      .from("rooms")
      .update({ players: newPlayers })
      .eq("id", room.id);
  };

  const isPlayerDisconnected = (p: any) => {
    if (!p.last_ping) return false; // They just joined, not disconnected yet
    return Date.now() - p.last_ping > 15000; // 15 seconds grace period
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px", color: "white" }}>
      <h2>Waiting Room</h2>
      <h1 style={{ fontSize: "48px", letterSpacing: "4px", color: "#4ade80" }}>
        {room.id}
      </h1>
      <p>Share this code with your friends!</p>

      <div
        style={{
          margin: "30px 0",
          padding: "20px",
          backgroundColor: "#374151",
          borderRadius: "8px",
          maxWidth: "300px",
          marginInline: "auto",
        }}
      >
        <h3>Players ({room.players.length})</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {room.players.map((p: any) => {
            const disconnected = isPlayerDisconnected(p);
            return (
              <li
                key={p.id}
                style={{
                  fontSize: "18px",
                  margin: "10px 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  position: "relative",
                  padding: "5px",
                  opacity: disconnected ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    backgroundColor: p.color || "#fff",
                  }}
                />
                {p.name} {p.id === room.host_id && "(Host)"}{" "}
                {p.id === myId && "(You)"}
                {/* Show Disconnected Tag */}
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
                {/* Kick Button */}
                {isHost && p.id !== myId && (
                  <button
                    onClick={() => kickPlayer(p.id)}
                    style={{
                      marginLeft: "10px",
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
              </li>
            );
          })}
        </ul>
      </div>
      <div
        style={{
          margin: "20px 0",
          padding: "15px",
          backgroundColor: "#2c2c2c",
          borderRadius: "8px",
          maxWidth: "300px",
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
      {/* SETTINGS PANEL */}
      <div
        style={{
          margin: "0 auto 30px auto",
          maxWidth: "300px",
          textAlign: "left",
          padding: "20px",
          border: "1px solid #555",
          borderRadius: "8px",
          opacity: isHost ? 1 : 0.7,
        }}
      >
        <h3 style={{ marginTop: 0 }}>
          Game Settings {!isHost && "(Host Only)"}
        </h3>
        {/*
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "14px" }}>
            Lobby Size:
          </label>
          <select
            disabled={!isHost}
            value={room.max_players}
            onChange={(e) => updateMaxPlayers(Number(e.target.value))}
            style={{
              width: "100%",
              padding: "8px",
              color: "black",
              cursor: isHost ? "pointer" : "not-allowed",
            }}
          >
            <option value={2}>2 Players</option>
            <option value={4}>4 Players</option>
          </select>
        </div>
*/}
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "14px" }}>
            Board Size:
          </label>
          <select
            disabled={!isHost}
            value={room.config?.boardSize || 9}
            onChange={(e) => updateConfig("boardSize", Number(e.target.value))}
            style={{
              width: "100%",
              padding: "8px",
              color: "black",
              cursor: isHost ? "pointer" : "not-allowed",
            }}
          >
            <option value={7}>7x7</option>
            <option value={9}>9x9 (Classic)</option>
            <option value={11}>11x11</option>
          </select>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "14px" }}>
            Win Condition:
          </label>
          <select
            disabled={!isHost}
            value={room.config?.goalCondition || "opposite-edge"}
            onChange={(e) => updateConfig("goalCondition", e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              color: "black",
              cursor: isHost ? "pointer" : "not-allowed",
            }}
          >
            <option value="opposite-edge">Reach Opposite Side</option>
            <option value="center">King of the Hill</option>
          </select>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", fontSize: "14px" }}>
            Walls per Player:
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
              cursor: isHost ? "pointer" : "not-allowed",
            }}
          />
        </div>
      </div>

      {isHost ? (
        <button
          onClick={startGame}
          disabled={room.players.length < 2}
          style={{
            padding: "12px 24px",
            fontSize: "18px",
            backgroundColor: room.players.length < 2 ? "#4b5563" : "#4ade80",
            color: "#1f2937",
            fontWeight: "bold",
            border: "none",
            borderRadius: "4px",
            cursor: room.players.length < 2 ? "not-allowed" : "pointer",
            marginBottom: "20px",
          }}
        >
          {room.players.length < 2 ? "Waiting for players..." : "Start Game"}
        </button>
      ) : (
        <p style={{ color: "#ccc", marginBottom: "20px" }}>
          Waiting for the host to start the game...
        </p>
      )}

      <div>
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

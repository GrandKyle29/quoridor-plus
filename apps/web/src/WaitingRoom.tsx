import { supabase } from "./supabase";
import { createGame } from "@quoridor/engine";
import type { GameConfig } from "@quoridor/engine";

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
  const startGame = async () => {
    const playerNames = room.players.map((p: any) => p.name);

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

    const initialState = createGame(config, playerNames);

    await supabase
      .from("rooms")
      .update({
        status: "playing",
        game_state: initialState,
      })
      .eq("id", room.id);
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
          {room.players.map((p: any) => (
            <li key={p.id} style={{ fontSize: "18px", margin: "10px 0" }}>
              {p.name} {p.id === room.host_id && "(Host)"}{" "}
              {p.id === myId && "(You)"}
            </li>
          ))}
        </ul>
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

import { supabase } from "./supabase";
import { createGame } from "@quoridor/engine";
import type { GameConfig } from "@quoridor/engine";

// Add leaveRoom to the props!
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
  const startGame = async () => {
    const playerNames = room.players.map((p: any) => p.name);

    const config: GameConfig = {
      schemaVersion: 1,
      boardSize: 9,
      minPlayers: 2,
      maxPlayers: room.max_players, // <-- Use the room's max players
      startingWalls: 10,
      wallPool: "per-player",
      goalCondition: "opposite-edge",
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
        <h3>
          Players ({room.players.length}/{room.max_players})
        </h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {room.players.map((p: any) => (
            <li key={p.id} style={{ fontSize: "18px", margin: "10px 0" }}>
              {p.name} {p.id === room.host_id && "(Host)"}{" "}
              {p.id === myId && "(You)"}
            </li>
          ))}
        </ul>
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

      {/* NEW: Leave Button */}
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

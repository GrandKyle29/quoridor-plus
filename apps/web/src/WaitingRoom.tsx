import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { createGame } from "@quoridor/engine";
import type { GameConfig } from "@quoridor/engine";

export function WaitingRoom({
  roomCode,
  isHost,
  myId,
}: {
  roomCode: string;
  isHost: boolean;
  myId: string;
}) {
  const [room, setRoom] = useState<any>(null);

  useEffect(() => {
    // Fetch initial
    supabase
      .from("rooms")
      .select("*")
      .eq("id", roomCode)
      .single()
      .then(({ data }) => setRoom(data));

    // Listen for changes (people joining)
    const channel = supabase
      .channel(`room-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomCode}`,
        },
        (payload) => setRoom(payload.new),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  const startGame = async () => {
    if (!room) return;

    const playerNames = room.players.map((p: any) => p.name);

    const config: GameConfig = {
      schemaVersion: 1,
      boardSize: 9,
      minPlayers: 2,
      maxPlayers: 2,
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
      .eq("id", roomCode);
  };

  if (!room) return <div>Loading...</div>;

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>Waiting Room</h2>
      <h1 style={{ fontSize: "48px", letterSpacing: "4px", color: "#4ade80" }}>
        {roomCode}
      </h1>
      <p>Share this code with your friends!</p>

      <div
        style={{
          margin: "30px 0",
          padding: "20px",
          backgroundColor: "#374151",
          borderRadius: "8px",
        }}
      >
        <h3>Players ({room.players.length}/2)</h3>
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
          }}
        >
          {room.players.length < 2 ? "Waiting for players..." : "Start Game"}
        </button>
      ) : (
        <p>Waiting for the host to start the game...</p>
      )}
    </div>
  );
}

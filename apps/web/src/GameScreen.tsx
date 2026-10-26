import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { GameBoard } from "./GameBoard";
import { WaitingRoom } from "./WaitingRoom";
import { getMyPlayerId } from "./utils";
import { applyMove } from "@quoridor/engine";
import type { Move } from "@quoridor/engine";

export function GameScreen() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const myId = getMyPlayerId();

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 1. Handle Local Game (No Room Code)
  if (!roomCode) {
    const playerNames = location.state?.playerNames;
    const vsBot = location.state?.vsBot || false;
    if (!playerNames) {
      navigate("/");
      return null;
    }
    return (
      <GameBoard
        playerNames={playerNames}
        vsBot={vsBot}
        localPlayerId={vsBot ? "p0" : undefined}
      />
    );
  }

  // 2. Handle Online Game
  useEffect(() => {
    if (!roomCode) return;

    // Fetch initial room state
    supabase
      .from("rooms")
      .select("*")
      .eq("id", roomCode)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setLoading(false);
          return;
        }
        setRoom(data);
        setLoading(false);
      });

    // Listen to ALL updates to this room
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

  const playMove = async (move: Move) => {
    if (!room?.game_state) return;
    try {
      const nextState = applyMove(room.game_state, move);
      setRoom({ ...room, game_state: nextState }); // Optimistic UI
      await supabase
        .from("rooms")
        .update({ game_state: nextState })
        .eq("id", roomCode);
    } catch (e) {
      console.error("Illegal move", e);
    }
  };

  const resetOnlineGame = async () => {
    if (!room?.game_state) return;
    // Just reset status to lobby and clear game_state
    await supabase
      .from("rooms")
      .update({ status: "lobby", game_state: null })
      .eq("id", roomCode);
  };

  if (loading)
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "100px" }}>
        Loading...
      </div>
    );
  if (!room)
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "100px" }}>
        Room not found! <button onClick={() => navigate("/")}>Back</button>
      </div>
    );

  const meIndex = room.players?.findIndex((p: any) => p.id === myId) ?? -1;
  const isHost = room.host_id === myId;

  // If in Lobby, show Waiting Room
  if (room.status === "lobby") {
    if (meIndex === -1) {
      return (
        <div
          style={{ color: "white", textAlign: "center", marginTop: "100px" }}
        >
          Game has already started or room is full.
        </div>
      );
    }
    return <WaitingRoom room={room} isHost={isHost} myId={myId} />;
  }

  // If Playing, show the Board
  if (room.status === "playing" && room.game_state) {
    const localPlayerId =
      meIndex === 0 ? "p0" : meIndex === 1 ? "p1" : undefined;

    return (
      <div>
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "16px",
            color: "white",
          }}
        >
          Room: <strong>{roomCode}</strong>
        </div>
        <button
          onClick={() => navigate("/")}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            padding: "8px",
            backgroundColor: "transparent",
            color: "white",
            border: "1px solid white",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Leave
        </button>
        <GameBoard
          playerNames={room.game_state.players.map((p: any) => p.name)}
          vsBot={false}
          onlineState={room.game_state}
          onlinePlayMove={playMove}
          onlineResetGame={resetOnlineGame}
          localPlayerId={localPlayerId}
        />
      </div>
    );
  }

  return null;
}

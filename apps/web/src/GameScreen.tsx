import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { useOnlineGame } from "./useOnlineGame";
import { GameBoard } from "./GameBoard";
import { WaitingRoom } from "./WaitingRoom";
import { getMyPlayerId } from "./utils";

export function GameScreen() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const myId = getMyPlayerId();

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomCode) return;

    // Fetch room data
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

    // Listen to any room changes
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

  // We only call the game hook if we are actually playing
  const { state, playMove, resetOnlineGame } = useOnlineGame(
    room?.status === "playing" ? roomCode || "" : "",
  );

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

  // Find who I am in this room
  const meIndex = room.players.findIndex((p: any) => p.id === myId);
  const isHost = room.host_id === myId;

  // If we are in the lobby, show the waiting room
  if (room.status === "lobby") {
    // If we are not in the player list, we are a spectator (for now, kick them out)
    if (meIndex === -1) {
      return (
        <div
          style={{ color: "white", textAlign: "center", marginTop: "100px" }}
        >
          Game has started or room is full.
        </div>
      );
    }
    return <WaitingRoom roomCode={roomCode!} isHost={isHost} myId={myId} />;
  }

  // If we are playing, show the board
  if (room.status === "playing" && state) {
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
          playerNames={state.players.map((p: any) => p.name)}
          vsBot={false}
          onlineState={state}
          onlinePlayMove={playMove}
          onlineResetGame={resetOnlineGame}
          localPlayerId={localPlayerId}
        />
      </div>
    );
  }

  return (
    <div style={{ color: "white", textAlign: "center", marginTop: "100px" }}>
      Syncing game...
    </div>
  );
}

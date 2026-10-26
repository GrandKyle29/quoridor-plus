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

  // 2. Online Game Setup
  useEffect(() => {
    if (!roomCode) return;

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

  // 3. The Leave Room Logic
  const leaveRoom = async (isExplicitLeave = true) => {
    if (!room || !roomCode) return;

    const newPlayers = room.players.filter((p: any) => p.id !== myId);

    if (newPlayers.length === 0) {
      // Room is empty, delete it
      await supabase.from("rooms").delete().eq("id", roomCode);
    } else {
      // If host leaves, promote next player. If game is playing, reset to lobby.
      const newHostId = room.host_id === myId ? newPlayers[0].id : room.host_id;
      const newStatus = room.status === "playing" ? "lobby" : room.status;
      const newState = room.status === "playing" ? null : room.game_state;

      await supabase
        .from("rooms")
        .update({
          players: newPlayers,
          host_id: newHostId,
          status: newStatus,
          game_state: newState,
        })
        .eq("id", roomCode);
    }

    if (isExplicitLeave) navigate("/");
  };

  // 4. Handle Browser Close / Refresh
  useEffect(() => {
    const handleUnload = () => {
      // Note: Async requests might not finish before the tab closes.
      // This is a "best effort" attempt without using a full Presence server.
      if (room && roomCode) {
        leaveRoom(false);
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [room, roomCode]); // Depend on room so we have the latest state

  // 5. Play Move (Online)
  const playMove = async (move: Move) => {
    if (!room?.game_state) return;
    try {
      const nextState = applyMove(room.game_state, move);
      setRoom({ ...room, game_state: nextState });
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
        Room closed! <button onClick={() => navigate("/")}>Back</button>
      </div>
    );

  const meIndex = room.players?.findIndex((p: any) => p.id === myId) ?? -1;

  // If we are not in the player list (e.g., we left but the state didn't update), kick out
  if (meIndex === -1) {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "100px" }}>
        You left this room.{" "}
        <button onClick={() => navigate("/")}>Back to Lobby</button>
      </div>
    );
  }

  const isHost = room.host_id === myId;

  // --- Render Waiting Room ---
  if (room.status === "lobby") {
    return (
      <WaitingRoom
        room={room}
        isHost={isHost}
        myId={myId}
        leaveRoom={leaveRoom}
      />
    );
  }

  // --- Render Game Board ---
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
          onClick={() => leaveRoom(true)}
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

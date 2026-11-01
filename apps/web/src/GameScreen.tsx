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
        myLocalName={playerNames[0]}
        botTimeLimit={location.state?.botTimeLimit || 1500}
        localPlayerId={vsBot ? "p0" : undefined}
        useWood={location.state?.useWood}
        playerColors={location.state?.playerColors}
        configOverrides={location.state?.configOverrides || {}}
        onLeave={(config) =>
          navigate("/local", { state: { prevConfig: config } })
        }
        isOnline={false}
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
      await supabase.from("rooms").delete().eq("id", roomCode);
    } else {
      const newHostId = room.host_id === myId ? newPlayers[0].id : room.host_id;

      await supabase
        .from("rooms")
        .update({
          players: newPlayers,
          host_id: newHostId,
        })
        .eq("id", roomCode);
    }

    if (isExplicitLeave) navigate("/");
  };

  // 4. Heartbeat
  useEffect(() => {
    if (!roomCode) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("rooms")
        .select("players")
        .eq("id", roomCode)
        .single();
      if (!data) return;

      const updatedPlayers = data.players.map((p: any) =>
        p.id === myId ? { ...p, last_ping: Date.now() } : p,
      );

      await supabase
        .from("rooms")
        .update({ players: updatedPlayers })
        .eq("id", roomCode);
    }, 5000);

    return () => clearInterval(interval);
  }, [roomCode, myId]);

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

  const me = room.players.find((p: any) => p.id === myId);
  const isHost = room.host_id === myId;

  // If we are not in the player list, we are a spectator (or we left)
  if (!me && room.status === "playing") {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "100px" }}>
        <p>You are spectating. (You cannot make moves).</p>
        <button
          onClick={() => navigate("/")}
          style={{ padding: "8px 16px", marginTop: "10px", cursor: "pointer" }}
        >
          Leave
        </button>
      </div>
    );
  }

  // --- Render Waiting Room ---
  if (room.status === "lobby") {
    if (!me) {
      return (
        <div
          style={{ color: "white", textAlign: "center", marginTop: "100px" }}
        >
          Game has started or room is full.{" "}
          <button onClick={() => navigate("/")}>Back</button>
        </div>
      );
    }
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
  if (room.status === "playing") {
    if (
      !room.game_state ||
      !room.game_state.players ||
      !Array.isArray(room.game_state.players) ||
      room.game_state.players.length === 0
    ) {
      console.error("🚨 Malformed game_state:", room.game_state);
      return (
        <div
          style={{ color: "white", textAlign: "center", marginTop: "100px" }}
        >
          <p>Loading game state...</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }

    const myEnginePlayer = room.game_state.players.find(
      (p: any) => p.name === me?.name,
    );
    const localPlayerId = myEnginePlayer ? myEnginePlayer.id : undefined;

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
        <GameBoard
          playerNames={room.game_state.players.map((p: any) => p.name)}
          vsBot={false}
          onlineState={room.game_state}
          onlinePlayMove={playMove}
          onlineResetGame={resetOnlineGame}
          localPlayerId={localPlayerId}
          onLeave={() => leaveRoom(true)}
          isOnline={true}
          onlinePlayers={room.players}
          isHost={isHost}
        />
      </div>
    );
  }

  return null;
}

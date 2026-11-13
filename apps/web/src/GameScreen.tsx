import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { GameBoard } from "./GameBoard";
import { WaitingRoom } from "./WaitingRoom";
import { getMyPlayerId } from "./utils";
import { applyMove } from "@quoridor/engine";
import type { Move } from "@quoridor/engine";
import { encodeShareCode } from "./shareCode";
import { DebugOverlay } from "./DebugOverlay";

export function GameScreen() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const myId = getMyPlayerId();

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastSentBytes, setLastSentBytes] = useState(0);
  const [lastReceivedBytes, setLastReceivedBytes] = useState(0);
  const lastHeartbeatTime = useRef<number>(Date.now());
  const [heartbeatAge, setHeartbeatAge] = useState<number | null>(null);

  // Determine host status at the top so all functions can reference it
  const isHost = room?.host_id === myId;

  // ==========================================
  // 1. LOCAL GAME (No room code)
  // ==========================================
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

  // ==========================================
  // 2. ONLINE GAME: Subscriptions & Heartbeat
  // ==========================================
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
        (payload) => {
          setLastReceivedBytes(JSON.stringify(payload.new).length);
          setRoom(payload.new);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("rooms")
        .select("players")
        .eq("id", roomCode)
        .single();
      if (!data || !data.players || !Array.isArray(data.players)) return;

      const updatedPlayers = data.players.map((p: any) =>
        p.id === myId ? { ...p, last_ping: Date.now() } : p,
      );

      await supabase
        .from("rooms")
        .update({ players: updatedPlayers })
        .eq("id", roomCode);

      lastHeartbeatTime.current = Date.now();
    }, 5000);

    return () => clearInterval(interval);
  }, [roomCode, myId]);

  useEffect(() => {
    if (!roomCode) return;
    const interval = setInterval(() => {
      setHeartbeatAge(Date.now() - lastHeartbeatTime.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [roomCode]);

  // ==========================================
  // 3. AUTO-SKIP LOGIC
  // ==========================================
  useEffect(() => {
    if (!room?.game_state) return;
    if (room.status !== "playing") return;
    if (room.host_id !== myId) return;

    const currentPlayer = room.game_state.players[room.game_state.turnIndex];
    if (!currentPlayer) return;

    const stillInRoom = room.players.some(
      (p: any) => p.name === currentPlayer.name,
    );

    if (!stillInRoom) {
      const timer = setTimeout(async () => {
        try {
          const skipMove: Move = { kind: "skip" };
          const nextState = applyMove(room.game_state, skipMove);

          const { data: updatedRows, error: updateErr } = await supabase
            .from("rooms")
            .update({ game_state: nextState })
            .eq("id", roomCode)
            .eq("game_state->>turnIndex", String(room.game_state.turnIndex))
            .select("id");

          if (updateErr || !updatedRows || updatedRows.length === 0) {
            console.log(
              "Skip aborted: turn already advanced by another client.",
            );
            return;
          }

          await supabase.from("moves").insert({
            room_id: roomCode,
            move_data: skipMove,
          });

          setRoom({ ...room, game_state: nextState });
        } catch (e) {
          console.error("Auto-skip failed:", e);
        }
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [room, myId, roomCode]);

  // ==========================================
  // 4. GAME ACTIONS (Leave, Kick, Play)
  // ==========================================
  const leaveRoom = async (isExplicitLeave = true) => {
    if (!room || !roomCode) return;

    const newPlayers = room.players.filter((p: any) => p.id !== myId);

    if (newPlayers.length === 0) {
      await supabase.from("rooms").delete().eq("id", roomCode);
    } else {
      const newHostId = room.host_id === myId ? newPlayers[0].id : room.host_id;
      await supabase
        .from("rooms")
        .update({ players: newPlayers, host_id: newHostId })
        .eq("id", roomCode);
    }

    if (isExplicitLeave) navigate("/");
  };

  const kickFromGame = async (playerName: string) => {
    if (!isHost || !room) return;

    const newPlayers = room.players.filter((p: any) => p.name !== playerName);
    await supabase
      .from("rooms")
      .update({ players: newPlayers })
      .eq("id", roomCode);

    // Defensive: if we somehow kicked the host, promote next
    if (room.host_id === myId && newPlayers.length > 0) {
      await supabase
        .from("rooms")
        .update({ host_id: newPlayers[0].id })
        .eq("id", roomCode);
    }
  };

  const playMove = async (move: Move) => {
    if (!room?.game_state) return;
    try {
      const nextState = applyMove(room.game_state, move);
      const broadcastState = { ...nextState, moveLog: [] };

      setLastSentBytes(JSON.stringify(broadcastState).length);
      setRoom({ ...room, game_state: broadcastState });

      // Save move to DB for replays
      await supabase.from("moves").insert({
        room_id: roomCode,
        move_data: move,
      });

      await supabase
        .from("rooms")
        .update({ game_state: broadcastState })
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
    await supabase.from("moves").delete().eq("room_id", roomCode);
  };

  const handleShareReplay = async () => {
    if (!room?.game_state) return;

    const { data: moves, error } = await supabase
      .from("moves")
      .select("move_data")
      .eq("room_id", roomCode)
      .order("id", { ascending: true });

    if (error || !moves) {
      alert("Failed to load moves for replay");
      return;
    }

    const fullMoveLog = moves.map((m: any) => m.move_data);
    const stateWithLog = { ...room.game_state, moveLog: fullMoveLog };

    const code = encodeShareCode(stateWithLog);
    const url = `${window.location.origin}/replay?code=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    alert(`Replay link copied! (${fullMoveLog.length} moves)`);
  };

  // ==========================================
  // 5. RENDER ROUTING
  // ==========================================
  if (loading) {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "100px" }}>
        Loading...
      </div>
    );
  }
  if (!room) {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "100px" }}>
        Room closed! <button onClick={() => navigate("/")}>Back</button>
      </div>
    );
  }

  const me = room.players.find((p: any) => p.id === myId);

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

  if (room.status === "playing") {
    const gs = room.game_state;
    const gsHasPlayers =
      gs &&
      typeof gs === "object" &&
      Array.isArray(gs.players) &&
      gs.players.length > 0;

    if (!gsHasPlayers) {
      console.error("🚨 MALFORMED GAME_STATE");
      return (
        <div
          style={{ color: "white", textAlign: "center", marginTop: "100px" }}
        >
          <p>Game state not ready. Check console for details.</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }

    const myEnginePlayer = room.game_state.players.find(
      (p: any) => p.name === me?.name,
    );
    const localPlayerId = myEnginePlayer ? myEnginePlayer.id : undefined;

    return (
      <>
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
            onKickPlayer={kickFromGame}
            onShareReplay={handleShareReplay}
            isSharingReplay={false}
          />
        </div>
        <DebugOverlay
          roomCode={roomCode}
          moveLogLength={room?.game_state?.moveLog?.length ?? 0}
          lastSentBytes={lastSentBytes}
          lastReceivedBytes={lastReceivedBytes}
          heartbeatAge={heartbeatAge}
        />
      </>
    );
  }

  return null;
}

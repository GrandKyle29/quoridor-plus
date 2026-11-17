import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { GameBoard } from "./GameBoard";
import { WaitingRoom } from "./WaitingRoom";
import { getMyPlayerId } from "./utils";
import { applyMove } from "@quoridor/engine";
import type { EliminationReason, GameState, Move } from "@quoridor/engine";
import { decodeShareCode, encodeShareCode } from "./shareCode";
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
    if (room.game_state.status !== "active") return;
    if (room.host_id !== myId) return;

    const currentPlayer = room.game_state.players[room.game_state.turnIndex];
    if (!currentPlayer) return;

    const stillInRoom = room.players.some(
      (p: any) => p.name === currentPlayer.name,
    );

    if (!stillInRoom) {
      const timer = setTimeout(async () => {
        try {
          // A player who is no longer in the room is out of the game: remove
          // their pawn instead of leaving it on the board and skipping forever.
          const elimination: Move = {
            kind: "eliminate",
            playerId: currentPlayer.id,
            reason: "left",
          };
          const nextState = applyMove(room.game_state, elimination);
          const rev = room.game_state.moveCount ?? 0;
          const broadcastState: GameState = {
            ...nextState,
            moveLog: [],
            moveCount: rev + 1,
          };
          const { data: updatedRows, error: updateErr } =
            await writeGameState(broadcastState, room.game_state);

          if (updateErr || !updatedRows || updatedRows.length === 0) {
            console.warn(
              "Elimination aborted (state changed elsewhere):",
              updateErr,
              updatedRows?.length,
            );
            return;
          }

          console.log("Eliminated absent player. Inserting move.");
          await supabase.from("moves").insert({
            room_id: roomCode,
            move_data: { ...elimination, seq: rev + 1 },
          });
          console.log("Elimination move inserted successfully.");

          setRoom((current: any) =>
            current ? { ...current, game_state: broadcastState } : current,
          );
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
  // Write a new game state under an optimistic lock: the update only lands if
  // nobody else changed the state since we read it. Callers re-read and retry
  // when it returns no rows, which keeps the stored move log and the state in
  // step even when a move and a resign/elimination land at the same moment.
  const writeGameState = async (nextState: GameState, expected: GameState) => {
    const base: any = supabase
      .from("rooms")
      .update({ game_state: nextState })
      .eq("id", roomCode);

    const guarded: any =
      expected.moveCount !== undefined
        ? base.filter(
            "game_state->>moveCount",
            "eq",
            String(expected.moveCount),
          )
        : // States saved before moveCount existed: fall back to the turn guard.
          base.filter(
            "game_state->>turnIndex",
            "eq",
            String(expected.turnIndex),
          );

    return guarded.select("id");
  };

  // Remove a player's pawn from the board and record it in the move log so
  // replays show the same thing. Retries if a turn landed while we were writing.
  const eliminatePlayer = async (
    playerId: string,
    reason: EliminationReason = "left",
  ) => {
    if (!roomCode) return;

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("rooms")
        .select("game_state, status")
        .eq("id", roomCode)
        .single();

      if (error || !data?.game_state || data.status !== "playing") return;

      const gameState = data.game_state as GameState;
      if (gameState.status !== "active") return;
      if (!gameState.players.some((p) => p.id === playerId && !p.eliminated))
        return;

      const elimination: Move = { kind: "eliminate", playerId, reason };
      const nextState = applyMove(gameState, elimination);
      const rev = gameState.moveCount ?? 0;
      const broadcastState: GameState = {
        ...nextState,
        moveLog: [],
        moveCount: rev + 1,
      };

      const { data: updatedRows, error: updateErr } = await writeGameState(
        broadcastState,
        gameState,
      );

      if (updateErr || !updatedRows || updatedRows.length === 0) continue;

      await supabase.from("moves").insert({
        room_id: roomCode,
        move_data: { ...elimination, seq: rev + 1 },
      });

      setRoom((current: any) =>
        current ? { ...current, game_state: broadcastState } : current,
      );
      return;
    }
  };

  const leaveRoom = async (isExplicitLeave = true) => {
    if (!room || !roomCode) return;

    const leaving = room.players.find((p: any) => p.id === myId);
    const leavingEnginePlayer = room.game_state?.players?.find(
      (p: any) => p.name === leaving?.name,
    );
    if (
      room.status === "playing" &&
      leavingEnginePlayer &&
      !leavingEnginePlayer.eliminated
    ) {
      await eliminatePlayer(leavingEnginePlayer.id, "left");
    }

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

    const kickedEnginePlayer = room.game_state?.players?.find(
      (p: any) => p.name === playerName,
    );
    if (
      room.status === "playing" &&
      kickedEnginePlayer &&
      !kickedEnginePlayer.eliminated
    ) {
      await eliminatePlayer(kickedEnginePlayer.id, "kicked");
    }

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

  // Resigning gives up the game but keeps you in the room as a spectator.
  const resignFromGame = async () => {
    if (!room || room.status !== "playing" || !room.game_state) return;

    const me = room.players.find((p: any) => p.id === myId);
    const myEnginePlayer = room.game_state.players.find(
      (p: any) => p.name === me?.name,
    );
    if (!myEnginePlayer || myEnginePlayer.eliminated) return;

    const confirmed = window.confirm(
      "Resign this game? You will stay in the room as a spectator.",
    );
    if (!confirmed) return;

    await eliminatePlayer(myEnginePlayer.id, "resigned");
  };

  const playMove = async (move: Move) => {
    if (!roomCode) return;
    const myName = room?.players?.find((p: any) => p.id === myId)?.name;

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("rooms")
        .select("game_state, status")
        .eq("id", roomCode)
        .single();

      if (error || !data?.game_state || data.status !== "playing") return;

      const gameState = data.game_state as GameState;
      if (gameState.status !== "active") return;

      // If our move lost the race, re-applying it on a fresh state must not
      // play somebody else's turn for them.
      const current = gameState.players[gameState.turnIndex];
      if (myName && current?.name !== myName) return;

      let nextState: GameState;
      try {
        nextState = applyMove(gameState, move);
      } catch (e) {
        console.error("Illegal move", e);
        return;
      }

      const rev = gameState.moveCount ?? 0;
      const broadcastState: GameState = {
        ...nextState,
        moveLog: [],
        moveCount: rev + 1,
      };

      const { data: updatedRows, error: updateErr } = await writeGameState(
        broadcastState,
        gameState,
      );

      if (updateErr || !updatedRows || updatedRows.length === 0) continue;

      setLastSentBytes(JSON.stringify(broadcastState).length);
      setRoom((currentRoom: any) =>
        currentRoom
          ? { ...currentRoom, game_state: broadcastState }
          : currentRoom,
      );

      // Only record the move once its state write won, so the replay log can
      // never contain a move that did not actually happen.
      await supabase.from("moves").insert({
        room_id: roomCode,
        move_data: { ...move, seq: rev + 1 },
      });
      return;
    }

    console.warn("Move rejected: game state kept changing.");
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
      .select("id, move_data")
      .eq("room_id", roomCode)
      .order("id", { ascending: true });

    if (error || !moves) {
      alert("Failed to load moves for replay");
      return;
    }

    // Each row records the revision it was written at. Prefer that order over
    // database ids, which can invert when two clients insert at once.
    const rows: any[] = [...moves];
    const sequenced = rows.every(
      (row) => typeof row.move_data?.seq === "number",
    );
    if (sequenced) rows.sort((a, b) => a.move_data.seq - b.move_data.seq);

    const fullMoveLog: Move[] = rows.map((row) => {
      const { seq: _seq, ...move } = row.move_data ?? {};
      return move as Move;
    });
    const stateWithLog = { ...room.game_state, moveLog: fullMoveLog };

    const code = encodeShareCode(stateWithLog);

    // Don't hand out a link that can't actually be replayed.
    if (!decodeShareCode(code)) {
      console.error("Replay self-check failed. Move log:", fullMoveLog);
      alert(
        "This game's move log is inconsistent, so the replay can't be built.",
      );
      return;
    }

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
            onResign={resignFromGame}
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

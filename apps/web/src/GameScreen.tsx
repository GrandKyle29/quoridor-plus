import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { useOnlineGame } from "./useOnlineGame";
import { GameBoard } from "./GameBoard";

export function GameScreen() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [role, setRole] = useState<"host" | "guest" | "loading" | "error">(
    "loading",
  );
  const [guestName, setGuestName] = useState("");
  const [hostName, setHostName] = useState("");

  // If we just came from the lobby, we are the host.
  const isHost =
    location.state?.isHost ||
    sessionStorage.getItem(`host_${roomCode}`) === "true";

  useEffect(() => {
    if (!roomCode) return;

    // If we know we are the host, save it so refreshing doesn't break the game
    if (isHost) {
      sessionStorage.setItem(`host_${roomCode}`, "true");
      setRole("host");
      return;
    }

    // If we aren't the host, we must be a guest. Fetch the room to see if we can join.
    supabase
      .from("rooms")
      .select("host_name, guest_name")
      .eq("id", roomCode)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setRole("error");
          return;
        }
        setHostName(data.host_name);

        // If the guest slot is empty, show the join screen
        if (!data.guest_name) {
          setRole("guest");
        } else {
          // If the guest slot is full, we are the guest returning.
          setRole("host");
        }
      });
  }, [roomCode, isHost]);

  const joinAsGuest = async () => {
    if (!guestName.trim() || !roomCode) return;

    const { data } = await supabase
      .from("rooms")
      .select("game_state")
      .eq("id", roomCode)
      .single();

    if (data) {
      // Update the game state with the guest's name
      const newState = { ...data.game_state };
      newState.players[1].name = guestName;

      const { error } = await supabase
        .from("rooms")
        .update({ guest_name: guestName, game_state: newState })
        .eq("id", roomCode);

      if (error) {
        alert("Failed to join room");
      } else {
        setRole("host"); // Now we are in the game
      }
    }
  };

  // We only call useOnlineGame once we know we are in the game
  const { state, playMove, resetOnlineGame } = useOnlineGame(roomCode || "");

  if (role === "loading")
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "100px" }}>
        Loading...
      </div>
    );
  if (role === "error")
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "100px" }}>
        Room not found!{" "}
        <button onClick={() => navigate("/")}>Back to Lobby</button>
      </div>
    );

  if (role === "guest") {
    return (
      <div
        style={{
          maxWidth: "400px",
          margin: "0 auto",
          textAlign: "center",
          marginTop: "100px",
          color: "white",
        }}
      >
        <h2>Joining Room: {roomCode}</h2>
        <p>Host: {hostName}</p>
        <input
          type="text"
          placeholder="Enter your name"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          style={{
            padding: "8px",
            width: "100%",
            marginBottom: "10px",
            borderRadius: "4px",
            border: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={joinAsGuest}
          style={{
            padding: "12px",
            width: "100%",
            backgroundColor: "#4ade80",
            color: "#1f2937",
            fontWeight: "bold",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Join Game
        </button>
      </div>
    );
  }

  if (!state)
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "100px" }}>
        Loading game state...
      </div>
    );

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
        Room Code: <strong>{roomCode}</strong> (Share this!)
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
        playerNames={state.players.map((p) => p.name)}
        vsBot={false}
        onlineState={state}
        onlinePlayMove={playMove}
        onlineResetGame={resetOnlineGame}
        localPlayerId={isHost ? "p0" : "p1"}
      />
    </div>
  );
}

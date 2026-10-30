import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { getMyPlayerId } from "./utils";

export default function App() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const myId = getMyPlayerId();

  const handleCreateOnlineRoom = async () => {
    const hostName = name.trim() || "Host";
    setIsCreating(true);
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();

    const { error } = await supabase.from("rooms").insert({
      id: roomCode,
      host_name: hostName,
      host_id: myId,
      status: "lobby",
      players: [{ id: myId, name: hostName }],
      config: {
        boardSize: 9,
        goalCondition: "opposite-edge",
        startingWalls: 10,
      },
    });

    setIsCreating(false);

    if (error) {
      alert("Error creating room. Check console.");
    } else {
      navigate(`/game/${roomCode}`);
    }
  };

  const handleJoinRoom = async () => {
    if (joinCode.length !== 4) return alert("Please enter a 4-letter code");
    const guestName = name.trim() || "Guest";

    const { data: room, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", joinCode)
      .single();
    if (error || !room) return alert("Room not found!");
    if (room.status !== "lobby") return alert("Game has already started!");

    const currentPlayers = room.players || [];

    // NEW: Check if we are already in the room!
    const amIAlreadyIn = currentPlayers.some((p: any) => p.id === myId);
    if (amIAlreadyIn) {
      navigate(`/game/${joinCode}`);
      return;
    }

    // (Optional) still enforce a hard cap of 4, just in case.
    if (currentPlayers.length >= 4) return alert("Room is full!");

    const newPlayers = [...currentPlayers, { id: myId, name: guestName }];
    await supabase
      .from("rooms")
      .update({ players: newPlayers })
      .eq("id", joinCode);

    navigate(`/game/${joinCode}`);
  };

  return (
    <div style={{ maxWidth: "400px", margin: "0 auto" }}>
      <h1>Quoridor Plus</h1>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", marginBottom: "8px" }}>
          Your Name:
        </label>
        <input
          type="text"
          placeholder="Enter name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: "8px",
            width: "100%",
            boxSizing: "border-box",
            borderRadius: "4px",
            border: "none",
          }}
        />
      </div>

      <button
        onClick={handleCreateOnlineRoom}
        disabled={isCreating}
        style={{
          padding: "12px",
          width: "100%",
          backgroundColor: "#3b82f6",
          color: "white",
          fontSize: "18px",
          fontWeight: "bold",
          border: "none",
          borderRadius: "4px",
          cursor: isCreating ? "not-allowed" : "pointer",
          marginBottom: "20px",
        }}
      >
        {isCreating ? "Creating Room..." : "Create Online Room"}
      </button>

      <div
        style={{
          marginTop: "20px",
          borderTop: "1px solid #555",
          paddingTop: "20px",
        }}
      >
        <h3>Join an Existing Game</h3>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            placeholder="Enter 4-letter code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={4}
            style={{
              padding: "10px",
              flex: 1,
              borderRadius: "4px",
              border: "none",
              textTransform: "uppercase",
            }}
          />
          <button
            onClick={handleJoinRoom}
            style={{
              padding: "10px 20px",
              backgroundColor: "#eab308",
              color: "#1f2937",
              fontWeight: "bold",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Join
          </button>
        </div>
      </div>

      <div style={{ marginTop: "30px" }}>
        <button
          onClick={() => navigate("/local")}
          style={{
            padding: "12px",
            width: "100%",
            backgroundColor: "#4ade80",
            color: "#1f2937",
            fontSize: "18px",
            fontWeight: "bold",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Play Local Game
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { getMyPlayerId } from "./utils";

export default function App() {
  const navigate = useNavigate();
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [isCreating, setIsCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [useWood, setUseWood] = useState(false);

  const myId = getMyPlayerId();

  const handleNameChange = (index: number, value: string) => {
    const newNames = [...names];
    newNames[index] = value;
    setNames(newNames);
  };

  const handleCreateOnlineRoom = async () => {
    const hostName = names[0]?.trim() || "Host";
    if (hostName === "Host") {
      alert("Please enter your name first!");
      return;
    }

    setIsCreating(true);
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();

    const { error } = await supabase.from("rooms").insert({
      id: roomCode,
      host_name: hostName,
      host_id: myId,
      status: "lobby",
      max_players: maxPlayers, // <-- ADD THIS
      players: [{ id: myId, name: hostName }],
    });

    setIsCreating(false);

    if (error) {
      console.error(error);
      alert("Error creating room. Check console.");
    } else {
      navigate(`/game/${roomCode}`);
    }
  };

  const handleJoinRoom = async () => {
    if (joinCode.length !== 4) return alert("Please enter a 4-letter code");

    const guestName = names[0]?.trim() || "Guest";
    if (guestName === "Guest") {
      alert("Please enter your name first!");
      return;
    }
    const { data: room, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", joinCode)
      .single();
    if (error || !room) return alert("Room not found!");
    if (room.status !== "lobby") return alert("Game has already started!");

    const currentPlayers = room.players || [];
    if (currentPlayers.length >= room.max_players)
      return alert("Room is full!");

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
      <h2>Game Lobby</h2>
      <button
        onClick={() => {
          const botName = names[0]?.trim() || "Player";
          navigate("/game", {
            state: { playerNames: [botName, "Bot"], vsBot: true, useWood },
          }); // <-- Add useWood here
        }}
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
          marginBottom: "20px",
        }}
      >
        Play Local Game (vs Bot)
      </button>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", marginBottom: "8px" }}>
          Your Name:
        </label>
        <input
          type="text"
          placeholder="Enter name"
          value={names[0]}
          onChange={(e) => handleNameChange(0, e.target.value)}
          style={{
            padding: "8px",
            width: "100%",
            boxSizing: "border-box",
            borderRadius: "4px",
            border: "none",
          }}
        />
      </div>
      <div style={{ marginBottom: "20px" }}>
        <label>
          <input
            type="checkbox"
            checked={useWood}
            onChange={(e) => setUseWood(e.target.checked)}
            style={{ marginRight: "8px" }}
          />
          Use Wood Texture
        </label>
      </div>
      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", marginBottom: "8px" }}>
          Lobby Size:
        </label>
        <button
          onClick={() => setMaxPlayers(2)}
          style={{
            padding: "8px 16px",
            marginRight: "8px",
            backgroundColor: maxPlayers === 2 ? "#3b82f6" : "#4b5563",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          2 Players
        </button>
        <button
          onClick={() => setMaxPlayers(4)}
          style={{
            padding: "8px 16px",
            backgroundColor: maxPlayers === 4 ? "#3b82f6" : "#4b5563",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          4 Players
        </button>
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
          marginBottom: "30px",
        }}
      >
        {isCreating ? "Creating Room..." : "Create Online Room"}
      </button>

      <div
        style={{
          marginTop: "30px",
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
    </div>
  );
}

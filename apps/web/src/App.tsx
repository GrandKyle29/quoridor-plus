import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { createGame } from "@quoridor/engine";
import type { GameConfig } from "@quoridor/engine";

export default function App() {
  const navigate = useNavigate();
  const [playerCount, setPlayerCount] = useState(2);
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [vsBot, setVsBot] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleNameChange = (index: number, value: string) => {
    const newNames = [...names];
    newNames[index] = value;
    setNames(newNames);
  };

  const handleStartGame = () => {
    const finalNames = names
      .slice(0, playerCount)
      .map((name, i) => (name.trim() === "" ? `Player ${i + 1}` : name.trim()));

    navigate("/game", { state: { playerNames: finalNames, vsBot } });
  };

  const handleCreateOnlineRoom = async () => {
    const hostName = names[0]?.trim() || "Host";
    if (hostName === "Host") {
      alert("Please enter your name first!");
      return;
    }

    setIsCreating(true);

    // Generate a 4-letter room code (e.g., "XKCD")
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();

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

    // Create the game with the Host's name and a placeholder for the Guest
    const initialState = createGame(config, [
      hostName,
      "Waiting for opponent...",
    ]);

    const { error } = await supabase.from("rooms").insert({
      id: roomCode,
      host_name: hostName,
      game_state: initialState,
    });

    setIsCreating(false);

    if (error) {
      console.error(error);
      alert("Error creating room. Check console.");
    } else {
      // ADD THIS: { state: { isHost: true } }
      navigate(`/game/${roomCode}`, { state: { isHost: true } });
    }
  };

  return (
    <div style={{ maxWidth: "400px", margin: "0 auto" }}>
      <h1>Quoridor Plus</h1>
      <h2>Game Lobby</h2>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", marginBottom: "8px" }}>
          Number of Players:
        </label>
        <button
          onClick={() => {
            setPlayerCount(2);
          }}
          style={{
            padding: "8px 16px",
            marginRight: "8px",
            backgroundColor: playerCount === 2 ? "#3b82f6" : "#4b5563",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          2 Players
        </button>
        <button
          onClick={() => {
            setPlayerCount(4);
            setVsBot(false); // Turn off bot for 4 players
          }}
          style={{
            padding: "8px 16px",
            backgroundColor: playerCount === 4 ? "#3b82f6" : "#4b5563",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          4 Players
        </button>
      </div>

      <div style={{ marginBottom: "20px" }}>
        {Array.from({ length: playerCount }).map((_, i) => (
          <div key={i} style={{ marginBottom: "10px" }}>
            <input
              type="text"
              placeholder={`Player ${i + 1} Name`}
              value={names[i]}
              onChange={(e) => handleNameChange(i, e.target.value)}
              style={{
                padding: "8px",
                width: "100%",
                boxSizing: "border-box",
                borderRadius: "4px",
                border: "none",
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ opacity: playerCount === 4 ? 0.5 : 1 }}>
          <input
            type="checkbox"
            checked={vsBot && playerCount === 2}
            onChange={(e) => setVsBot(e.target.checked)}
            disabled={playerCount === 4}
            style={{ marginRight: "8px" }}
          />
          Play against a Bot (2 Players only)
        </label>
      </div>

      <button
        onClick={handleStartGame}
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
          marginBottom: "10px",
        }}
      >
        Start Local Game
      </button>

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
        }}
      >
        {isCreating ? "Creating Room..." : "Create Online Room"}
      </button>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function LocalSetup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [boardSize, setBoardSize] = useState(9);
  const [goalCondition, setGoalCondition] = useState("opposite-edge");
  const [startingWalls, setStartingWalls] = useState(10);
  const [useWood, setUseWood] = useState(false);

  const startGame = () => {
    navigate("/game", {
      state: {
        playerNames: [name.trim() || "Player", "Bot"],
        vsBot: true,
        useWood,
        configOverrides: {
          boardSize,
          goalCondition,
          startingWalls,
          maxPlayers: 2,
        },
      },
    });
  };

  return (
    <div style={{ maxWidth: "400px", margin: "0 auto" }}>
      <h2>Local Game Setup</h2>

      <div style={{ marginBottom: "10px" }}>
        <label>Your Name:</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", padding: "8px" }}
        />
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label>Board Size:</label>
        <select
          value={boardSize}
          onChange={(e) => setBoardSize(Number(e.target.value))}
          style={{ width: "100%", padding: "8px", color: "black" }}
        >
          <option value={7}>7x7</option>
          <option value={9}>9x9 (Classic)</option>
          <option value={11}>11x11</option>
        </select>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label>Win Condition:</label>
        <select
          value={goalCondition}
          onChange={(e) => setGoalCondition(e.target.value)}
          style={{ width: "100%", padding: "8px", color: "black" }}
        >
          <option value="opposite-edge">Reach Opposite Side</option>
          <option value="center">King of the Hill</option>
        </select>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label>Walls per Player:</label>
        <input
          type="number"
          value={startingWalls}
          onChange={(e) => setStartingWalls(Number(e.target.value))}
          style={{ width: "100%", padding: "8px" }}
        />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label>
          <input
            type="checkbox"
            checked={useWood}
            onChange={(e) => setUseWood(e.target.checked)}
          />{" "}
          Use Wood Texture
        </label>
      </div>

      <button
        onClick={startGame}
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
        Start Game
      </button>

      <button
        onClick={() => navigate("/")}
        style={{
          padding: "12px",
          width: "100%",
          backgroundColor: "transparent",
          color: "white",
          border: "1px solid white",
          borderRadius: "4px",
          cursor: "pointer",
          marginTop: "10px",
        }}
      >
        Back
      </button>
    </div>
  );
}

import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export function LocalSetup() {
  const navigate = useNavigate();
  const location = useLocation();

  // Get settings from the previous game, if they exist
  const prevConfig = location.state?.prevConfig || {};

  const [name, setName] = useState("");
  const [botCount, setBotCount] = useState((prevConfig.maxPlayers || 2) - 1);
  const [boardSize, setBoardSize] = useState(prevConfig.boardSize || 9);
  const [goalCondition, setGoalCondition] = useState(
    prevConfig.goalCondition || "opposite-edge",
  );
  const [startingWalls, setStartingWalls] = useState(
    prevConfig.startingWalls ?? 10,
  );
  const [useWood, setUseWood] = useState(false);
  const [botTimeLimit, setBotTimeLimit] = useState(1500);
  //const [botMode, setBotMode] = useState<"heuristic" | "minimax" | "defensive">( "heuristic",);
  const [randomizeSpawns, setRandomizeSpawns] = useState(true);
  const startGame = () => {
    const playerNames = [name.trim() || "Player"];
    for (let i = 0; i < botCount; i++) {
      playerNames.push(`Bot ${i + 1}`);
    }

    navigate("/game", {
      state: {
        playerNames,
        vsBot: true,
        useWood,
        botTimeLimit,
        //botMode,
        configOverrides: {
          boardSize,
          goalCondition,
          startingWalls,
          maxPlayers: botCount + 1,
          randomizeSpawns, // <-- Add this
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
        <label>Number of Bots:</label>
        <select
          value={botCount}
          onChange={(e) => setBotCount(Number(e.target.value))}
          style={{ width: "100%", padding: "8px", color: "black" }}
        >
          <option value={1}>1 Bot (1v1)</option>
          <option value={2}>2 Bots (1v1v1)</option>
          <option value={3}>3 Bots (1v1v1v1)</option>
        </select>
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
      <div style={{ marginBottom: "10px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={randomizeSpawns}
            onChange={(e) => setRandomizeSpawns(e.target.checked)}
          />
          Randomize Starting Positions
        </label>
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
      <div style={{ marginBottom: "10px" }}>
        <label>Bot Think Time: {(botTimeLimit / 1000).toFixed(1)}s</label>
        <input
          type="range"
          min="500" // 0.5 secs
          max="15000" // 15 secs
          step="500"
          value={botTimeLimit}
          onChange={(e) => setBotTimeLimit(Number(e.target.value))}
          style={{ width: "100%" }}
        />{" "}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "#ccc",
            marginTop: "4px",
          }}
        >
          <span>Easy</span>
          <span>Medium</span>
          <span>Hard</span>
        </div>
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

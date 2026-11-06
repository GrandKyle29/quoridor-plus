import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { loadLocalSetup, saveLocalSetup } from "./utils";
import type { LocalSetupState } from "./utils";

export function LocalSetup() {
  const navigate = useNavigate();
  const location = useLocation();

  // Get settings from the previous game if we came from one, otherwise
  // load from localStorage (or defaults).
  const prevConfig = location.state?.prevConfig;

  const [name, setName] = useState("");
  const [botCount, setBotCount] = useState(1);
  const [botTimeLimit, setBotTimeLimit] = useState(1500);

  const [setup, setSetup] = useState<LocalSetupState>(() => {
    if (prevConfig) {
      // Came from a finished game — use its config as starting point
      return loadLocalSetup({
        boardSize: prevConfig.boardSize,
        goalCondition: prevConfig.goalCondition,
        startingWalls:
          typeof prevConfig.startingWalls === "number"
            ? prevConfig.startingWalls
            : 10,
        randomizeSpawns: prevConfig.randomizeSpawns !== false,
        sharedWalls: prevConfig.wallPool === "shared",
        lenientJumps: prevConfig.lenientJumps === true,
        useWood: false, // not stored in engine config, so default
      });
    }
    return loadLocalSetup();
  });

  // Persist every time setup changes
  useEffect(() => {
    saveLocalSetup(setup);
  }, [setup]);

  const update = <K extends keyof LocalSetupState>(
    key: K,
    value: LocalSetupState[K],
  ) => {
    setSetup((prev) => ({ ...prev, [key]: value }));
  };

  const startGame = () => {
    const playerNames = [name.trim() || "Player"];
    for (let i = 0; i < botCount; i++) {
      playerNames.push(`Bot ${i + 1}`);
    }

    const defaultColors = ["#3b82f6", "#ef4444", "#eab308", "#22c55e"];

    navigate("/game", {
      state: {
        playerNames,
        vsBot: true,
        useWood: setup.useWood,
        botTimeLimit,
        playerColors: defaultColors.slice(0, playerNames.length),
        configOverrides: {
          boardSize: setup.boardSize,
          goalCondition: setup.goalCondition,
          startingWalls: setup.startingWalls,
          lenientJumps: setup.lenientJumps,
          randomizeSpawns: setup.randomizeSpawns,
          wallPool: setup.sharedWalls ? "shared" : "per-player",
          maxPlayers: botCount + 1,
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
          value={setup.boardSize}
          onChange={(e) => update("boardSize", Number(e.target.value))}
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
          value={setup.goalCondition}
          onChange={(e) => update("goalCondition", e.target.value)}
          style={{ width: "100%", padding: "8px", color: "black" }}
        >
          <option value="opposite-edge">Reach Opposite Side</option>
          <option value="center">King of the Hill</option>
          <option value="top">Reach the Top</option>
        </select>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label>Walls per Player:</label>
        <input
          type="number"
          value={setup.startingWalls}
          onChange={(e) => update("startingWalls", Number(e.target.value))}
          style={{ width: "100%", padding: "8px" }}
        />
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={setup.sharedWalls}
            onChange={(e) => update("sharedWalls", e.target.checked)}
          />
          Shared wall pool
        </label>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={setup.lenientJumps}
            onChange={(e) => update("lenientJumps", e.target.checked)}
          />
          Lenient jumps (diagonals always available)
        </label>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={setup.randomizeSpawns}
            onChange={(e) => update("randomizeSpawns", e.target.checked)}
          />
          Randomize Starting Positions
        </label>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label>
          <input
            type="checkbox"
            checked={setup.useWood}
            onChange={(e) => update("useWood", e.target.checked)}
          />{" "}
          Use Wood Texture
        </label>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label>Bot Think Time: {(botTimeLimit / 1000).toFixed(1)}s</label>
        <input
          type="range"
          min="500"
          max="15000"
          step="500"
          value={botTimeLimit}
          onChange={(e) => setBotTimeLimit(Number(e.target.value))}
          style={{ width: "100%" }}
        />
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

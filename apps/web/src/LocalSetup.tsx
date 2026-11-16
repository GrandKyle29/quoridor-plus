import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { loadLocalSetup, saveLocalSetup } from "./utils";
import type { LocalSetupState } from "./utils";
import { DEFAULT_COLORS } from "./utils";

export function LocalSetup() {
  const navigate = useNavigate();
  const location = useLocation();

  const prevConfig = location.state?.prevConfig;

  const [name, setName] = useState("");

  const [setup, setSetup] = useState<LocalSetupState>(() => {
    if (prevConfig) {
      return loadLocalSetup({
        boardSize: prevConfig.boardSize,
        goalCondition: prevConfig.goalCondition,
        startingWalls:
          typeof prevConfig.startingWalls === "number"
            ? prevConfig.startingWalls
            : 10,
        randomizeSpawns: prevConfig.randomizeSpawns !== false,
        wallPool: prevConfig.wallPool ?? "per-player",
        lenientJumps: prevConfig.lenientJumps === true,
        useTeams: prevConfig.useTeams === true,
        teamWinCondition: prevConfig.teamWinCondition ?? "all",
        useWood: false,
      });
    }
    return loadLocalSetup();
  });

  useEffect(() => {
    saveLocalSetup(setup);
  }, [setup]);

  const update = <K extends keyof LocalSetupState>(
    key: K,
    value: LocalSetupState[K],
  ) => {
    setSetup((prev) => ({ ...prev, [key]: value }));
  };
  const resetToDefaults = () => {
    setSetup((prev) => ({
      ...prev,
      boardSize: 9,
      goalCondition: "opposite-edge",
      startingWalls: 10,
      wallPool: "per-player",
      useTeams: false,
      teamWinCondition: "all",
      lenientJumps: false,
      randomizeSpawns: true,
    }));
  };
  const playerCount = setup.botCount + 1;
  const reachTheTopDisabled = playerCount > setup.boardSize;
  const teamsAvailable = playerCount >= 4;
  const teamsEnabled = teamsAvailable && setup.useTeams === true;

  useEffect(() => {
    if (setup.goalCondition === "top" && playerCount > setup.boardSize) {
      update("goalCondition", "opposite-edge");
    }
  }, [setup.botCount, setup.boardSize, setup.goalCondition]);

  // Auto-adjust wall pool when team mode changes
  useEffect(() => {
    if (teamsEnabled && setup.wallPool === "per-player") {
      update("wallPool", "team");
    } else if (!teamsEnabled && setup.wallPool === "team") {
      update("wallPool", "per-player");
    }
  }, [teamsEnabled, setup.wallPool]);

  const wallPoolOptions = teamsEnabled
    ? (["shared", "team"] as const)
    : (["per-player", "shared"] as const);

  const startGame = () => {
    const playerNames = [name.trim() || "Player"];
    for (let i = 0; i < setup.botCount; i++) {
      playerNames.push(`Bot ${i + 1}`);
    }

    navigate("/game", {
      state: {
        playerNames,
        vsBot: true,
        useWood: setup.useWood,
        botTimeLimit: setup.botTimeLimit,
        playerColors: DEFAULT_COLORS.slice(0, playerNames.length),
        configOverrides: {
          boardSize: setup.boardSize,
          goalCondition: setup.goalCondition,
          startingWalls: setup.startingWalls,
          lenientJumps: setup.lenientJumps,
          randomizeSpawns: setup.randomizeSpawns,
          wallPool: setup.wallPool,
          maxPlayers: setup.botCount + 1,
          useTeams: setup.useTeams,
          teamWinCondition: setup.teamWinCondition,
          teams: {},
        },
      },
    });
  };

  return (
    <div style={{ maxWidth: "400px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "15px",
        }}
      >
        <h2 style={{ margin: 0 }}>Game Settings</h2>
        <button
          onClick={resetToDefaults}
          style={{
            padding: "6px 12px",
            backgroundColor: "#4b5563",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Reset to Defaults
        </button>
      </div>

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
          value={setup.botCount}
          onChange={(e) => update("botCount", Number(e.target.value))}
          style={{ width: "100%", padding: "8px", color: "black" }}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n} Bot{n > 1 ? "s" : ""} ({n + 1} players)
            </option>
          ))}
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
          <option value="top" disabled={reachTheTopDisabled}>
            Reach the Top{reachTheTopDisabled ? " (unavailable)" : ""}
          </option>
        </select>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label>{teamsEnabled ? "Walls per Team:" : "Walls per Player:"}</label>
        <input
          type="number"
          value={setup.startingWalls}
          onChange={(e) => update("startingWalls", Number(e.target.value))}
          style={{ width: "100%", padding: "8px" }}
        />
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label>Wall Pool:</label>
        <select
          value={setup.wallPool}
          onChange={(e) =>
            update("wallPool", e.target.value as LocalSetupState["wallPool"])
          }
          style={{ width: "100%", padding: "8px", color: "black" }}
        >
          {wallPoolOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "per-player" && "Per Player"}
              {opt === "shared" &&
                (teamsEnabled ? "Shared (Both Teams)" : "Shared (All Players)")}
              {opt === "team" && "Shared (Per Team)"}
            </option>
          ))}
        </select>
      </div>

      {/* Separator */}
      <div style={{ borderTop: "1px solid #555", margin: "15px 0" }} />

      {/* Teams */}
      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="checkbox"
          disabled={!teamsAvailable}
          checked={setup.useTeams}
          onChange={(e) => update("useTeams", e.target.checked)}
        />
        Teams mode
      </label>
      {!teamsAvailable && (
        <p style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>
          Teams require at least 4 players.
        </p>
      )}
      {teamsEnabled && (
        <p style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>
          Players will be randomly assigned to balanced teams at game start.
        </p>
      )}

      {/* Team win condition */}
      {teamsEnabled && (
        <div style={{ marginTop: "10px" }}>
          <label>Team Win Condition:</label>
          <select
            value={setup.teamWinCondition}
            onChange={(e) =>
              update("teamWinCondition", e.target.value as "any" | "all")
            }
            style={{ width: "100%", padding: "8px", color: "black" }}
          >
            <option value="all">All members must reach the goal</option>
            <option value="any">First member to reach wins</option>
          </select>
        </div>
      )}

      {/* Separator */}
      <div style={{ borderTop: "1px solid #555", margin: "15px 0" }} />

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        <input
          type="checkbox"
          checked={setup.lenientJumps}
          onChange={(e) => update("lenientJumps", e.target.checked)}
        />
        Lenient jumps
      </label>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        <input
          type="checkbox"
          checked={setup.randomizeSpawns}
          onChange={(e) => update("randomizeSpawns", e.target.checked)}
        />
        Randomize Start Positions
      </label>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "20px",
        }}
      >
        <input
          type="checkbox"
          checked={setup.useWood}
          onChange={(e) => update("useWood", e.target.checked)}
        />
        Use Wood Texture
      </label>

      <div style={{ marginBottom: "10px" }}>
        <label>Bot Think Time: {(setup.botTimeLimit / 1000).toFixed(1)}s</label>
        <input
          type="range"
          min="500"
          max="15000"
          step="500"
          value={setup.botTimeLimit}
          onChange={(e) => update("botTimeLimit", Number(e.target.value))}
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

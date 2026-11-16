export function getMyPlayerId(): string {
  let id = localStorage.getItem("quoridor_player_id");
  if (!id) {
    id = Math.random().toString(36).substring(2, 10); // Generate a short unique ID
    localStorage.setItem("quoridor_player_id", id);
  }
  return id;
}

export const COLOR_PALETTE = [
  { name: "Blue", hex: "#3b82f6" },
  { name: "Red", hex: "#ef4444" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Green", hex: "#22c55e" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Orange", hex: "#f97316" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "White", hex: "#cccccc" },
];

// Derived for rendering: same order, just the hex strings
export const DEFAULT_COLORS = COLOR_PALETTE.map((c) => c.hex);
// In utils.ts
export type LocalSetupState = {
  boardSize: number;
  goalCondition: string;
  startingWalls: number;
  randomizeSpawns: boolean;
  wallPool: "per-player" | "shared" | "team";
  lenientJumps: boolean;
  useWood: boolean;
  useTeams: boolean;
  teamWinCondition: "any" | "all";
  botCount: number; // <-- NEW
  botTimeLimit: number; // <-- NEW
};

const DEFAULT_LOCAL_SETUP: LocalSetupState = {
  boardSize: 9,
  goalCondition: "opposite-edge",
  startingWalls: 10,
  randomizeSpawns: true,
  wallPool: "per-player",
  lenientJumps: false,
  useWood: false,
  useTeams: false,
  teamWinCondition: "all",
  botCount: 1, // <-- NEW
  botTimeLimit: 1500, // <-- NEW
};

export function loadLocalSetup(
  overrides?: Partial<LocalSetupState>,
): LocalSetupState {
  try {
    const raw = localStorage.getItem("quoridor_localSetup");
    if (!raw) return { ...DEFAULT_LOCAL_SETUP, ...overrides };
    const parsed = JSON.parse(raw);
    // Migrate legacy sharedWalls -> wallPool
    if (parsed.sharedWalls !== undefined && parsed.wallPool === undefined) {
      parsed.wallPool = parsed.sharedWalls ? "shared" : "per-player";
      delete parsed.sharedWalls;
    }
    const stored = { ...DEFAULT_LOCAL_SETUP, ...parsed };
    return { ...stored, ...overrides };
  } catch {
    return { ...DEFAULT_LOCAL_SETUP, ...overrides };
  }
}

export function saveLocalSetup(state: LocalSetupState) {
  try {
    localStorage.setItem("quoridor_localSetup", JSON.stringify(state));
  } catch {
    // private mode / quota exceeded — silently ignore
  }
}

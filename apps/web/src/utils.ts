export function getMyPlayerId(): string {
  let id = localStorage.getItem("quoridor_player_id");
  if (!id) {
    id = Math.random().toString(36).substring(2, 10); // Generate a short unique ID
    localStorage.setItem("quoridor_player_id", id);
  }
  return id;
}

export const COLOR_PALETTE = [
  { name: "Red", hex: "#ef4444" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Green", hex: "#22c55e" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Orange", hex: "#f97316" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "White", hex: "#cccccc" },
];

// In utils.ts
export type LocalSetupState = {
  boardSize: number;
  goalCondition: string;
  startingWalls: number;
  randomizeSpawns: boolean;
  sharedWalls: boolean;
  lenientJumps: boolean;
  useWood: boolean;
};

const DEFAULT_LOCAL_SETUP: LocalSetupState = {
  boardSize: 9,
  goalCondition: "opposite-edge",
  startingWalls: 10,
  randomizeSpawns: true,
  sharedWalls: false,
  lenientJumps: false,
  useWood: false,
};

export function loadLocalSetup(): LocalSetupState {
  try {
    const raw = localStorage.getItem("quoridor_localSetup");
    if (!raw) return DEFAULT_LOCAL_SETUP;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_LOCAL_SETUP, ...parsed };
  } catch {
    return DEFAULT_LOCAL_SETUP;
  }
}

export function saveLocalSetup(state: LocalSetupState) {
  try {
    localStorage.setItem("quoridor_localSetup", JSON.stringify(state));
  } catch {
    // Silently ignore (private mode, storage quota, etc.)
  }
}

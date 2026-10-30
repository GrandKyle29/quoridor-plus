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

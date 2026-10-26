export function getMyPlayerId(): string {
  let id = localStorage.getItem("quoridor_player_id");
  if (!id) {
    id = Math.random().toString(36).substring(2, 10); // Generate a short unique ID
    localStorage.setItem("quoridor_player_id", id);
  }
  return id;
}

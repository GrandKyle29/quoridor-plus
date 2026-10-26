import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { createGame, applyMove } from "@quoridor/engine"; // Import createGame & applyMove
import type { GameState, Move } from "@quoridor/engine";

export function useOnlineGame(roomCode: string) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    supabase
      .from("rooms")
      .select("game_state")
      .eq("id", roomCode)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else if (data) setState(data.game_state);
      });

    const channel = supabase
      .channel(`room-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomCode}`,
        },
        (payload) => {
          setState(payload.new.game_state as GameState);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  const playMove = (move: Move) => {
    if (!state) return;
    try {
      const nextState = applyMove(state, move);
      setState(nextState); // Optimistic update
      supabase
        .from("rooms")
        .update({ game_state: nextState })
        .eq("id", roomCode)
        .then();
    } catch (e) {
      console.error("Illegal move", e);
    }
  };

  const resetOnlineGame = () => {
    if (!state) return;
    // Create a fresh game with the same players
    const nextState = createGame(
      state.config,
      state.players.map((p) => p.name),
    );
    setState(nextState);
    supabase
      .from("rooms")
      .update({ game_state: nextState })
      .eq("id", roomCode)
      .then();
  };

  return { state, playMove, resetOnlineGame, error };
}

import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

interface DebugOverlayProps {
  roomCode?: string;
  moveLogLength: number;
  lastReceivedBytes?: number;
  lastSentBytes?: number;
  heartbeatAge?: number | null; // in ms
}

export function DebugOverlay({
  roomCode,
  moveLogLength,
  lastReceivedBytes = 0,
  lastSentBytes = 0,
  heartbeatAge = null,
}: DebugOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!visible) return null;

  const bytesColor =
    lastReceivedBytes > 50000
      ? "#ef4444"
      : lastReceivedBytes > 10000
        ? "#eab308"
        : "#4ade80";
  const heartbeatColor =
    heartbeatAge === null
      ? "#ccc"
      : heartbeatAge > 25000
        ? "#ef4444"
        : heartbeatAge > 15000
          ? "#eab308"
          : "#4ade80";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "10px",
        right: "10px",
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        color: "#0f0",
        padding: "10px 15px",
        borderRadius: "6px",
        fontSize: "12px",
        fontFamily: "monospace",
        zIndex: 9999,
        lineHeight: "1.6",
        minWidth: "240px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{ fontWeight: "bold", marginBottom: "6px", color: "#4ade80" }}
      >
        🐛 Debug Overlay (Ctrl+Shift+D)
      </div>
      <div>
        Room: <span style={{ color: "#ccc" }}>{roomCode ?? "local"}</span>
      </div>
      <div>
        Move count: <span style={{ color: "#ccc" }}>{moveLogLength}</span>
      </div>
      <div>
        Last broadcast sent:{" "}
        <span style={{ color: bytesColor }}>{lastSentBytes} B</span>
      </div>
      <div>
        Last broadcast recv:{" "}
        <span style={{ color: bytesColor }}>{lastReceivedBytes} B</span>
      </div>
      <div>
        Last heartbeat age:{" "}
        <span style={{ color: heartbeatColor }}>
          {heartbeatAge !== null
            ? `${Math.round(heartbeatAge / 1000)}s`
            : "N/A"}
        </span>
      </div>
      <div style={{ marginTop: "6px", fontSize: "10px", color: "#888" }}>
        Thresholds: &gt;10KB=yellow, &gt;50KB=red
      </div>
    </div>
  );
}

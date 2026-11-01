import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { GameScreen } from "./GameScreen";
import "./index.css";
import { LocalSetup } from "./LocalSetup";
import { ReplayScreen } from "./ReplayScreen";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/local" element={<LocalSetup />} />
          {/* THIS IS THE CRUCIAL FIX: */}
          <Route path="/game" element={<GameScreen />} /> {/* Local Game */}
          <Route path="/game/:roomCode" element={<GameScreen />} />{" "}
          {/* Online Game */}
          <Route path="/replay" element={<ReplayScreen />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

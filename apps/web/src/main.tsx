import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { GameScreen } from "./GameScreen";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        {/* THIS IS THE CRUCIAL FIX: */}
        <Route path="/game/:roomCode" element={<GameScreen />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

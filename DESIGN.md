Quoridor Plus — Design Document
Quick Project Overview

Quoridor Plus is a browser-based implementation of Quoridor (with mods). It's a monorepo:

packages/engine — The pure game logic. No React, no Supabase, no DOM. Testable in isolation.
apps/web — The React frontend + Supabase client. Consumes the engine and renders it.

The split is deliberate: the engine is the single source of truth for the game rules, and the frontend is one of many possible consumers. You could later build a CLI, a mobile app, or a bot harness against the same engine.

Data Flow
text
User clicks → React state → engine.applyMove → new state → React re-render
↓
(online: also pushed to Supabase)

packages/engine/src — The Game Logic
types.ts — The Vocabulary

Defines the fundamental types used everywhere:

Coord
PlayerId
Player
Wall
Move
Orientation

If you need to know what a "wall" or "move" is, look here.

Key detail: Move is a discriminated union:

typescript
{ kind: "move", to }
{ kind: "wall", wall }

This is what lets TypeScript narrow correctly across the codebase.

config.ts — The Rules Knobs

Defines GameConfig, the object that describes how a game is played.

Contains:

boardSize
startingWalls
wallPool (per-player vs shared)
goalCondition: "opposite-edge" | "center" | "top"
randomizeSpawns
lenientJumps
allowDiagonalJumps
schemaVersion (currently 3) — Used by the share code to detect incompatible replays.

Rule of thumb: If you're adding a new game variant, the first place to add it is here. Then work outward.

state.ts — The Current Game

Defines GameState, the complete snapshot of a game in progress:

config, players, walls
turnIndex — Whose turn it is
moveLog — The full history, used for replays
status — "active" | "finished"
winner
sharedWallsRemaining — Only defined when wallPool === "shared"

Important: GameState is immutable. Every mutation returns a new object. This is what makes undo, replay, and networking trivially correct.

game.ts — The Core Operations

This is the heart of the engine.

Core Functions
createGame(config, playerNames, playerColors)

Sets up a new game. Wraps buildInitialState (see below).

buildInitialState(config, playerData)

The single source of truth for initial state construction.

Both createGame and every reconstruction path (replay, rewind) call this.

If you add a new config field that affects initial state, you change it here and nowhere else.

applyMove(state, move)

Validates a move and returns the next state.

Throws "Illegal move" if invalid.
Handles turn advancement.
Handles wall decrements.
Handles win detection.
isPlayerGoal(state, playerIndex, coord)

Checks if a coordinate is a winning square for a player.

Used by both applyMove (via checkWin) and the AI (via getDistanceToGoal).

getStartPositions / getStartPositionsRaw

Start position helpers.

The "raw" version doesn't shuffle.
The plain version is used internally by createGame.
copyState

Deep-copies a state.

Used by applyMove to preserve immutability.

Every field of GameState must be copied here, or the field will be lost across moves.

Historical note: This was the source of a shared-wall bug once.

moves.ts — Legal Move Generation
legalMoves(state)

Returns every legal move for the current player.

This is the most complex file in the engine because of:

Pawn Movement
Four-direction movement.
Wall blocking.
Jump over an adjacent player.
Diagonal jump fallback (or always, in lenient mode).
Chain Jumps (3+ Players)

When players line up, the current player can jump over multiple players.

This is a BFS over (from, over) pairs to handle arbitrary chains and L-shapes.

Wall Placements

Validates:

Bounds.
Overlaps.
Crossings.
Path-finding checks (does the wall block anyone's path to their goal?).
Key Helpers
Function Description
isBlockedByWall(state, from, to) Wall collision check. Used by both pawn movement and pathfinding.
canReachGoal(state, playerId) BFS from a player's position to their goal. Used to validate that a wall doesn't trap anyone.
getChainJumps(state, start) BFS for chain jumps.
checkDiagonals(state, over, ...) Extracted helper for diagonal jump validation.

Gotcha: moves.ts is called extremely frequently:

Every legal move check.
Every AI evaluation.
Every replay reconstruction.

It's the hottest path in the codebase. If you're adding a feature that touches legalMoves, be mindful of performance.

ai.ts — The Bot
getBestMove(state, timeLimit, mode)

The AI entry point.

Supported modes:

"heuristic" — Fast, no search, uses static evaluation. Good for Easy.
"minimax" — Alpha-beta search with iterative deepening. Good for Hard.
Key Pieces
getDistanceToGoal(state, playerId)

BFS distance from a player's position to their goal.

Used by:

AI.
Replay UI.
Final standings panel.
getPrunedMoves(state)

Only considers walls near players, cutting branch factor by approximately 10x.

evaluate(state, botId)

Static board evaluation.

Mode-aware:

Different weights for per-player vs shared walls.
A "top" mode threat calculation (getClearLaneDistance) that penalizes opponents with clear vertical lanes.
evaluateMoveDelta(state, move, botId)

A move ordering heuristic.

For each candidate move, computes the delta in distance for both the bot and the closest opponent.

Used to sort moves before Minimax starts, so alpha-beta prunes better.

Tunable Weights

Weights at the top of the file (botDistWeight, deltaOppWeight, etc.) are deliberately tunable.

You can adjust them in the file and see the effect immediately in local development.

Testing tip: If you want to iterate on weights:

Run pnpm --filter web dev.
Change a weight.
Save and reload.

No deploy needed.

encoding.ts — Share Code Move Encoding

Compact move format used by share codes.

Each move is three characters:

Format Meaning
mXY Move to (X, Y)
hXY Horizontal wall at (X, Y)
vXY Vertical wall at (X, Y)

Coordinates are base-36 (0-9, a-z), so up to 36x36 boards.

Why this exists:

JSON move objects are approximately 35 characters.
Compact moves are approximately 3 characters.
After lz-string compression, a 50-move game goes from approximately 1,500 to 500 characters in the URL.
encoding.test.ts / index.test.ts — Tests

Two test files:

encoding.test.ts

Unit tests for the compact move format:

encodeMove
decodeMove
Roundtrip tests for all coordinate values, including values ≥ 10.
index.test.ts

The main test suite for the engine.

Covers:

createGame
legalMoves
applyMove
Wall validation
Pathfinding
Win conditions

Run tests:

bash
pnpm --filter @quoridor/engine test:run

index.ts — The Package's Public Surface

Re-exports everything from all the above files.

This is what apps/web sees when it does:

typescript
import { applyMove } from "@quoridor/engine";

Kept clean on purpose — no logic lives here. It's a pure re-export.

apps/web/src — The React Frontend
main.tsx — The Entry Point

Mounts React to the DOM, wraps the app in <ErrorBoundary> and <BrowserRouter>, and defines the top-level routes:

Route Component Purpose
/ App Home screen
/game GameScreen Local game, no room code
/game/:roomCode GameScreen Online game
/local LocalSetup Local game setup
/replay ReplayScreen Replay viewer
App.tsx — The Home Screen

Landing page.

Contains:

Player name input.
Create Online Room button:
Creates a room in Supabase.
Navigates to /game/:roomCode.
Join Room with room code input.
Play Local Game button:
Navigates to /local.

Minimal logic.

Uses getMyPlayerId from utils.ts to identify the current browser session.

LocalSetup.tsx — The Local Game Setup Screen

Configures a game against bots.

Settings
Player name.
Number of bots.
Board size.
Goal condition.
Walls per player.
Toggles
Shared walls.
Lenient jumps.
Randomize spawns.
Wood texture.
Other Settings
Bot think time slider.

Persists all settings to localStorage via:

loadLocalSetup
saveLocalSetup

Both are from utils.ts.

Also accepts prevConfig from navigation state (when coming back from a game) as higher-priority overrides.

On Start Game: Navigates to /game with all the config in location.state.

GameScreen.tsx — The Game Host (Local + Online)

This is the orchestrator.

It handles three modes:

1. Local Game (No Room Code)
   Renders GameBoard with vsBot={true}.
   Simplest path.
2. Online Game Setup
   Fetches the room from Supabase.
   Subscribes to realtime updates.
   Manages the heartbeat.
   Renders either:
   WaitingRoom (if status === "lobby").
   GameBoard (if status === "playing").
3. Online Gameplay
   playMove sends moves to Supabase.
   Tracks move deltas for the Share Replay feature.
   Passes the config to GameBoard.
   Key Responsibilities
   Fetching and subscribing to the rooms table.
   The heartbeat (updates players.last_ping every 5 seconds).
   Cleanup on leave (leaveRoom).
   Replay generation (handleShareReplay):
   Fetches the moves table.
   Composes the full move log.
   Encodes it as a share code.
   Malformed-state guards (defensive rendering if game_state is malformed).

Why this is complex:

It bridges the pure engine (which expects a GameState) with Supabase's asynchronous, distributed reality.

Every shared resource (room state, heartbeat, move log) has to be synchronized across clients.

GameBoard.tsx — The Board Renderer

This is the largest component and the most visible one.

Responsibilities
Render the grid (tiles, gaps, borders). The layout adapts to boardSize.
Render the walls (with placedBy colors).
Render the players as animated pieces.
Render the ghost walls (valid moves, hover states).
Render goal indicators:
Edge lines for opposite-edge.
Ring for center.
Top-line for top.
Render player cards:
Name.
Walls remaining.
Disconnected indicator.
Render the confirm-move bar when pendingMove is set.
Handle the Settings popup.
Handle sound effects (move/wall/win).
Handle the game-over screen and buttons:
Play Again.
Share Replay.
Leave.
Interactions with the Engine
Calls legalMoves(state) on every render to know what's playable.
Passes moves to playMove (passed as a prop, either from useGame for local or from GameScreen for online).
Complexity Drivers

Local games (vs bot, hotseat) use useGame internally.

Online games receive:

onlineState
onlinePlayMove

Both paths must behave identically from the user's perspective.

Per-User Settings (Persisted to localStorage)
Setting Default Description
confirmMoves ON Requires a confirm step before playing a move.
showGoalLines ON Shows edge/center indicators.
GameBoard.css — The Board Styling

All the CSS for the board.

Key Classes
Class Description
.board-container Grid container with --tile-size / --gap-size variables.
.tile A single cell.
.tile.valid-move Highlights legal destinations.
.tile.pending-move Highlights the currently pending destination (blue).
.placed-wall A wall that's been placed (colored by player).
.ghost-wall A valid wall placement (hover state).
.ghost-wall.pending-wall A pending wall (blue).
.player-piece-animated Pawns, animated via left/top.
.goal-line / .goal-center Goal indicators.
.board-container.wood Wood-texture variant.

Gotcha: The --tile-size uses clamp() for mobile responsiveness.

Player positions are computed in GameBoard.tsx as:

css
calc(var(--padding) + x \* (var(--tile-size) + var(--gap-size)))

This depends on those CSS variables existing exactly as defined here.

index.css — Global Styles

Body background, font, and basic layout resets.

Minimal — most styling is inline or in GameBoard.css.

WaitingRoom.tsx — The Online Lobby

Renders when:

typescript
room.status === "lobby"

Contains
Room code display.
Player list (with colors).
Host settings panel:
Board size.
Goal condition.
Walls per player.
Shared walls.
Lenient jumps.
Randomize spawns.
Color picker.
Start Game button (host only).
Kick buttons (host only).
Leave Room button.

Key behavior: The host changes settings live, and everyone else sees the changes immediately via realtime updates (updateConfig writes to Supabase).

ReplayScreen.tsx — The Replay Viewer

Loads a share code, reconstructs the initial state, and lets the user scrub through moves.

Contains
Scrubber (range slider).
Play/pause button (auto-advance at 500ms).
Step forward/back buttons.
Jump to start/end buttons.
Keyboard shortcuts (← / → / Space).
Board rendering via GameBoard (in spectator mode).
Key Optimization

Forward scrubbing applies only the delta from replayStep to currentStep.

Backward scrubbing rebuilds from scratch.

This keeps forward scrubbing instant even on 100+ move games.

Uses buildInitialState from the engine (not a local rebuild function). This is essential for consistency.

shareCode.ts — Share Code Encode/Decode

Two functions:

encodeShareCode(state)

Compresses a state into a URL-safe string.

Format:

typescript
{ config, players, moveLog }

Where moveLog is compact-encoded via encoding.ts.

Then lz-string compresses the whole thing.

decodeShareCode(code)

Reverses the process.

Uses buildInitialState from the engine (not a local rebuild).
Applies moves in order.
Throws if any move is illegal (with detailed console logging to diagnose).
Schema Gating

Checks:

typescript
config.schemaVersion === 3

Old share codes (v1, v2) fail with a clear message instead of crashing.

useGame.ts — The Local-Game State Hook

React hook for local games (against bots or hotseat).

Wraps createGame in useState, exposes:

playMove
resetGame
config

Triggers the bot via a useEffect when it's a bot's turn.

Bot Triggering
Runs a Web Worker (ai.worker.ts) so the UI doesn't freeze during Minimax searches.
Bot turn detection: currentPlayer.name.startsWith("Bot").
Uses botTimeLimit prop to configure search time.

Important: The bot must be triggered via useEffect on state changes, not synchronously. Otherwise, the UI would deadlock waiting for the bot.

ai.worker.ts — The Web Worker

Runs getBestMove in a separate thread.

Receives { state, timeLimit }.
Posts back the best move.

This is why the UI stays responsive during a 5-second Minimax search.

DebugOverlay.tsx — The Dev Diagnostics Overlay

Hidden feature toggled by Ctrl+Shift+D.

Shows:

Room code.
Move count.
Last broadcast bytes (sent/received).
Heartbeat age.

Used to diagnose broadcast-size crashes and disconnects.

This saved us during the "gray screen" bugs.

ErrorBoundary.tsx — The Crash Handler

React error boundary wrapping the whole app.

If a component throws during render, instead of a blank gray screen, it shows a red error panel with the stack trace.

Why this matters: In production, unhandled render errors unmount the whole React tree, leaving a blank page. The boundary ensures you see what went wrong.

utils.ts — Small Helpers
getMyPlayerId()

Returns a persistent browser UUID (stored in localStorage).

Used to identify the current player across page refreshes.

COLOR_PALETTE

The list of available player colors.

loadLocalSetup(overrides?) / saveLocalSetup(state)

Persist local game setup to localStorage.

LocalSetupState

The shape of persisted local setup.

apps/web Config Files
File Purpose
.gitignore Standard git ignore (node*modules, dist, etc.).
eslint.config.js ESLint rules for the web app.
index.html Vite's HTML entry point (loads main.tsx).
package.json Web app dependencies and scripts.
tsconfig.app.json TS config for app code.
tsconfig.json Base TS config (extends the above).
tsconfig.node.json TS config for Node tooling (Vite config, etc.).
vercel.json Vercel SPA routing config (all routes → index.html).
vite.config.ts Vite build config.
README.md Default Vite README (probably replace with a custom one eventually).
apps/web Other Folders
Folder Purpose
public Static assets served as-is (e.g., move.mp3, wall.mp3, win.mp3 sound files).
node_modules Installed dependencies.
packages/engine Config Files
File Purpose
package.json Engine package metadata and scripts (test, test:run, typecheck).
tsconfig.json TS config for the engine.
Root Files
File Purpose
.gitignore Root git ignore.
package.json Root workspace scripts and dev dependencies.
pnpm-lock.yaml Dependency lockfile (always commit).
pnpm-workspace.yaml Workspace definition (packages/* and apps/\_).
tsconfig.base.json Base TS config that both packages extend.
Cross-Cutting Concepts Worth Remembering
The "Single Source of Truth" Rule

Three functions are the canonical source for their respective concerns.

If you ever find yourself duplicating their logic elsewhere, stop and reuse:

1. buildInitialState

The only place that constructs a fresh game state.

Used by:

createGame
decodeShareCode
ReplayScreen 2. legalMoves

The only place that decides what moves are legal.

Used by:

GameBoard
applyMove
ai.ts 3. applyMove

The only place that transitions between states.

Used by all game flows.

Core principle: Every bug we've hit has been from breaking this rule. Every fix has been restoring it.

The "Four Places Must Stay in Sync" Rule

When adding a config field that affects gameplay, you must update:

packages/engine/src/config.ts — Add the field.
packages/engine/src/buildInitialState — Use the field.
packages/engine/src/legalMoves and/or applyMove — Respect the field.
The UI — Add a checkbox in LocalSetup.tsx and/or WaitingRoom.tsx.

If you skip any, replays or live games will break in a mode-specific way.

The "Broadcast Is Small, Storage Is Big" Rule
Broadcasts

Supabase realtime updates to the rooms table carry only the current game state.

moveLog is stripped before broadcast.

This keeps payloads under 5 KB regardless of game length.

Storage

The moves table holds the full move history, one row per move.

This is unbounded but never broadcast.

Used only for replay generation at game end.

Important: If you ever add a new field to GameState that grows with game length (like a move list, chat log, or history), do not broadcast it.

Put it in a separate table and fetch on demand.

The "Engine Doesn't Know About Supabase" Rule

The engine is pure logic.

It has zero knowledge of:

The rooms table.
Realtime channels.
Heartbeats.
Player IDs that aren't p0-p3.
Any network concept.

If you ever find yourself wanting to import Supabase or React from inside the engine, that's a design smell.

The logic belongs in apps/web or a new engine-agnostic layer.

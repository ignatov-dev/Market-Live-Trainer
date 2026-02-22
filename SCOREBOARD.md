Create a Scoreboard that ranks users by their session return percentage and displays the top performers grouped into:

🥇 Gold — top performers

🥈 Silver — second tier

🥉 Bronze — third tier

The scoreboard must update automatically in real time using a new dedicated WebSocket connection.

🧱 Technical Requirements
1. Component Structure

Create a new feature folder:

/src/components/Scoreboard/
  Scoreboard.tsx
  Scoreboard.module.css
  types.ts
  useScoreboardSocket.ts
  utils.ts

Use functional React components

Use CSS modules

Keep logic modular and clean

Use TypeScript

2. Data Model

Assume backend/WebSocket returns:

type ScoreboardEntry = {
  userId: string
  userName: string
  sessionReturnPercent: number
}

Leaderboard is sorted descending by sessionReturnPercent.

3. Ranking Logic

Split users into 3 levels:

Gold → top 3 users

Silver → next 5 users

Bronze → next 10 users

If fewer users exist, adjust automatically.

Create utility:

groupUsersByRank(entries: ScoreboardEntry[])

Return:

{
  gold: ScoreboardEntry[]
  silver: ScoreboardEntry[]
  bronze: ScoreboardEntry[]
}
4. UI Requirements

Scoreboard should display:

User name

Session return %

Rank section (Gold / Silver / Bronze)

Layout:

Scoreboard
  Gold Section
    User row
  Silver Section
  Bronze Section

Each row:

Username | +12.45%

Style requirements:

Clean minimal layout

Visual distinction between tiers

Reusable styles in Scoreboard.module.css

Responsive layout

5. Real-Time Updates (WebSocket)

Create a separate WebSocket connection specifically for scoreboard updates.

Implement hook:

useScoreboardSocket()

Behavior:

Connect on mount

Subscribe to scoreboard_updates

Update state when new data arrives

Auto-reconnect on disconnect

Clean up on unmount

Prevent duplicate connections

Example event:

{
  "type": "scoreboard_update",
  "payload": ScoreboardEntry[]
}

The UI must re-render automatically when data changes.

6. Backend Expectations (for reference)

Assume backend:

Computes session return %

Sends full updated scoreboard snapshot

Publishes updates whenever a session result changes

Frontend should only consume updates.

7. Performance Requirements

Avoid unnecessary re-renders

Use memoization where appropriate

Efficient sorting and grouping

Handle large lists gracefully

8. Export

Component should be reusable:

export default Scoreboard

Usage:

<Scoreboard />
9. Bonus (if simple)

Loading state

Empty state

Connection status indicator

Smooth row update animation

✅ Deliverables

Provide:

Full folder structure

Complete TypeScript code

CSS module styles

WebSocket hook implementation

Utilities implementation

Example usage

Keep code production quality.
# Mafia War

Remake of my Construct 2 game in Phaser 3 + TypeScript + Vite. Same art, sounds and rules.

Drive with WASD or the arrow keys, aim with the mouse, click to shoot. P pauses, R retries.
Mafia cars ram you, red convertibles have a gunner, thugs on foot punch you. Hearts heal.
Now and then a tank rolls in: 20 hits to destroy, fires shells, worth 25 points.
On phones and tablets, a joystick appears bottom-left: push it the way you want to drive. Tap anywhere else to shoot there (one shot at a time).

## Run it

    npm install
    npm run dev      # local dev server with hot reload
    npm test         # game-rule and leaderboard tests
    npm run build    # production build into dist/

## Deploy (Vercel)

Vercel → Add New → Project → import this repo. It detects Vite; no settings needed.

## Where things are

- src/logic.ts — car handling, health and score rules; tweak numbers here
- src/main.ts  — scenes: Boot (loading), Menu, Game, Leaderboard
- public/assets — sprites and sounds from the original (cut out of the Construct 2 sprite sheets, sounds converted to mp3 for Safari)

## Online leaderboard

`api/scores.js` is a Vercel function that stores the top scores in Upstash Redis, under the key `mafia-wars:leaderboard`.
It can share the same Upstash database as Sushi Terbang: Vercel project → Storage → connect the existing Upstash database, then redeploy.

`npm run dev` doesn't run the function (the board shows "offline"); use `npx vercel dev` to test it locally.

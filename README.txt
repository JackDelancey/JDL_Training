JDL Training Patch v4 — Custom Exercises (MVP)

What this adds:
- Tracked exercises per user (Profile -> Tracked exercises)
- Weekly log is driven by tracked exercises (weight/reps/RPE per exercise)
- Dashboard + charts use tracked exercises (first 3 for tiles/charts; first 6 for table)
- API persists tracked exercises + weekly entries in api/data.json

Apply:
1) Stop both servers (API + client)
2) Overwrite files with the ones in this zip:
   - api/server.js
   - api/package.json
   - client/src/App.jsx
   - client/src/styles.css
3) In /api:
   npm install
   npm run dev
4) In /client:
   npm install
   npm run dev

Notes:
- Goals are still Bench/Squat/Deadlift only for now (next patch: goals per exercise).
- Weekly payload now includes: { unit, bodyweight, sleep_hours, pec_pain_0_10, zone2_mins, notes, entries:[...] }

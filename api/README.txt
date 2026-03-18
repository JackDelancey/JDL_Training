JDL Training API — Persistence Patch (No Native Builds)

Problem you hit:
- Node v24 on Windows + better-sqlite3 => needs native build toolchain (Python + VS Build Tools) AND prebuilt binaries may not exist yet.
- Your error shows node-gyp can't find Python and there are no prebuilt binaries.

This patch:
- Uses lowdb (JSON file) so there are NO native modules
- Data persists to api/data.json (survives restarts)
- Keeps the same endpoints your app uses today

Apply:
1) In your api folder, overwrite:
   - server.js
   - package.json
2) Run:
   npm install
   npm run dev

Data:
- api/data.json

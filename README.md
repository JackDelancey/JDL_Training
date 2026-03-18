# JDL Training (MVP)

This MVP mirrors the Excel workbook weekly logging style and adds:
- accounts + auth
- unit toggle kg/lb (all weights stored internally as KG)
- create/join groups using a shareable join code
- weekly logs matching TRAINING_LOG
- e1RM computed via Epley, progress to targets, and basic group comparisons

## Quick start (local)

### 1) Start API
```bash
cd api
npm i
npm run dev
```

### 2) Start Client
In a new terminal:
```bash
cd client
npm i
npm run dev
```

Open: http://localhost:5173

## CSV import
Export your TRAINING_LOG sheet to CSV and ensure columns like:
- Week
- BW
- Sleep (h)
- Pec Pain (0-10)
- Bench Top
- Bench RPE
- Bench Reps (optional)
- Squat Top
- Squat RPE
- Squat Reps (optional)
- DL Top
- DL RPE
- DL Reps (optional)
- Zone2 (mins)
- Notes

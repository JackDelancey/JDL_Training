# JDL Training - API

## Run locally
```bash
cd api
npm i
npm run dev
```

API default: http://localhost:4000  
CORS allows: http://localhost:5173

## Notes
- Uses SQLite in `api/data.db`
- Stores all weights internally in KG and converts to user preference (kg/lb)
- Weekly logs mirror the spreadsheet (TRAINING_LOG) with extra reps columns for e1RM calculation

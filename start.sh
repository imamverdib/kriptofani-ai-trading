#!/bin/sh
# Wait for the DB directory to be ready (if using volume)
mkdir -p /app/data
touch /app/data/app.log

# Run migrations or anything needed (db is auto-created in db.ts)

# Start Next.js server in the background
npm run start 2>&1 | tee -a /app/data/app.log &

# Start the worker
npm run worker 2>&1 | tee -a /app/data/app.log

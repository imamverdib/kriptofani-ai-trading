#!/bin/sh
mkdir -p /app/data
touch /app/data/app.log

# Start Next.js web application server in background on port 7860
npm run start 2>&1 | tee -a /app/data/app.log &

# Start the background trading worker
npm run worker 2>&1 | tee -a /app/data/app.log

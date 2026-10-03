FROM node:20-alpine

WORKDIR /app

# Install native compilation dependencies for SQLite
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci

# Copy all source files
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=3005
ENV DB_PATH=/app/data/kripto.db

# Build Next.js application
RUN npm run build

# Setup data directory permissions
RUN mkdir -p /app/data && chmod 700 /app/data && chmod +x start.sh

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s CMD node -e "fetch('http://localhost:3005/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./start.sh"]

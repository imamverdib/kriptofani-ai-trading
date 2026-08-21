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
ENV PORT=7860
ENV DB_PATH=/app/data/kripto.db

# Build Next.js application
RUN npm run build

# Setup data directory permissions
RUN mkdir -p /app/data && chmod 777 /app/data && chmod +x start.sh

EXPOSE 7860

CMD ["./start.sh"]

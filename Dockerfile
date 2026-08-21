FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
# We need python, make, g++ for sqlite3 building if needed, but alpine usually needs them for native modules
RUN apk add --no-cache python3 make g++ 

COPY package.json package-lock.json* ./
RUN npm ci

# Copy all files
COPY . .

# Build Next.js
RUN npm run build

# Make start script executable
RUN chmod +x start.sh

# Environment variables
ENV NODE_ENV=production
ENV DB_PATH=/app/data/kripto.db

# Expose port
EXPOSE 3005

# Run the start script
CMD ["./start.sh"]

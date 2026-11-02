FROM node:20-alpine

# Set working directory
WORKDIR /app

# 1. Install git and build dependencies required by Baileys packages
RUN apk add --no-cache git python3 make g++

# 2. Copy package definition files
COPY package*.json ./

# 3. Clean install production packages (git is now available to npm)
RUN npm install --omit=dev

# 4. Copy application files
COPY server.js ./

# Create directory for persistent auth tokens
RUN mkdir -p /app/auth_info_baileys

EXPOSE 3000

CMD ["node", "server.js"]
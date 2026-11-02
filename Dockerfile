FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source
COPY server.js ./

# Create directory for persistent auth tokens
RUN mkdir -p /app/auth_info_baileys

# Expose microservice port
EXPOSE 3000

CMD ["node", "server.js"]
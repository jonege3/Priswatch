FROM node:20-alpine

WORKDIR /app

# Install server deps
COPY package*.json ./
RUN npm install --omit=dev

# Install & build client
COPY client/package*.json ./client/
RUN npm install --prefix client
COPY client/ ./client/
RUN npm run build --prefix client

# Copy server
COPY server/ ./server/

# Data volume for SQLite
RUN mkdir -p /data
ENV DB_PATH=/data/prisvakt.db
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/index.js"]

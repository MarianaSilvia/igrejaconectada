FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
RUN mkdir -p /app/.local && chown -R node:node /app/.local
USER node
ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100
CMD ["npm", "start"]

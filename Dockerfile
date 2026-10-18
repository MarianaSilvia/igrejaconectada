FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY admin ./admin
COPY backend ./backend
COPY data ./data
COPY docs ./docs
COPY prototype ./prototype
COPY README.md ./

ENV PORT=3000
ENV DATA_DIR=/data
ENV NODE_ENV=production

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "backend/server.js"]

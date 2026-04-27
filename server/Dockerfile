# Layer A — deterministic Node/Express claims sandbox API.
# Build context: server/ (see docker-compose.yml).

FROM node:22-alpine

WORKDIR /app

RUN addgroup -g 1001 -S nodeapp && adduser -u 1001 -S nodeapp -G nodeapp

COPY --chown=nodeapp:nodeapp package.json package-lock.json ./

USER nodeapp

RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=nodeapp:nodeapp . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=8s --retries=12 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]

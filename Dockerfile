FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 DATA_DIR=/app/data
COPY --from=build /app/package*.json ./
# tsx runs the small TypeScript API.
RUN npm ci --omit=dev --no-audit --no-fund && mkdir /app/data && chown node:node /app/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/model.ts ./src/model.ts
USER node
VOLUME ["/app/data"]
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","--import","tsx","server/index.ts"]

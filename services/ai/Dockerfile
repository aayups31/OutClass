FROM node:24-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY services/ai services/ai
COPY src src
RUN node node_modules/esbuild/bin/esbuild services/ai/server.ts --bundle --platform=node --format=esm --packages=external --outfile=server.js
FROM node:24-alpine
WORKDIR /app
COPY services/ai/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /build/server.js ./server.js
USER node
EXPOSE 8080
CMD ["node", "server.js"]

FROM node:22-bookworm-slim AS deps

WORKDIR /workspace

ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package*.json ./
RUN npm ci \
  && mkdir -p /data/projects /data/sqlite \
  && chown -R node:node /workspace /data

FROM deps AS dev

COPY --chown=node:node . .

USER node

EXPOSE 3001

CMD ["npm", "run", "dev"]

FROM dev AS build

RUN npm run build

FROM node:22-bookworm-slim AS production

WORKDIR /workspace

ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package*.json ./
RUN npm ci --omit=dev \
  && mkdir -p /data/projects /data/sqlite \
  && chown -R node:node /workspace /data
COPY --from=build --chown=node:node /workspace/dist ./dist

USER node

EXPOSE 3001

CMD ["npm", "run", "start"]

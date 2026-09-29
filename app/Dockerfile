FROM node:22-bookworm-slim AS deps

WORKDIR /workspace

ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package*.json ./
RUN npm ci && chown -R node:node /workspace

FROM deps AS dev

COPY --chown=node:node . .

USER node

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM dev AS build

RUN npm run build

FROM node:22-bookworm-slim AS preview

WORKDIR /workspace

ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY --from=deps --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/dist ./dist
COPY --chown=node:node package*.json ./

USER node

EXPOSE 4173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]

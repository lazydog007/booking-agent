FROM node:20-alpine

WORKDIR /app

# Keep runtime simple for monorepo services (web + worker).
RUN npm install -g pnpm@9.12.3 tsx

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm build

ENV NODE_ENV=production


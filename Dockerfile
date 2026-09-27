FROM node:22-bookworm AS production-dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --omit=dev

FROM node:22-bookworm AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
RUN groupadd --gid 10001 pylearn \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin pylearn
COPY --from=production-dependencies --chown=pylearn:pylearn /app/node_modules ./node_modules
COPY --chown=pylearn:pylearn package.json package-lock.json tsconfig.json ./
COPY --from=build --chown=pylearn:pylearn /app/.next ./.next
COPY --chown=pylearn:pylearn lib ./lib
COPY --chown=pylearn:pylearn prisma ./prisma
COPY --chown=pylearn:pylearn scripts ./scripts
COPY --chown=pylearn:pylearn worker ./worker
RUN mkdir -p /app/uploads /app/.next/cache \
    && chown -R pylearn:pylearn /app/uploads /app/.next/cache
USER pylearn
EXPOSE 3000
CMD ["npm", "run", "start"]

FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install all dependencies so `react-router build` (Vite) can run
RUN npm ci

COPY . .

# Use the PostgreSQL schema for production builds
RUN cp prisma/schema.production.prisma prisma/schema.prisma

RUN npm run build

# Drop devDependencies to keep the image smaller
RUN npm prune --omit=dev

# Render and other proxies must reach the process; react-router-serve binds to HOST when set.
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "docker-start"]

FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install all dependencies so `react-router build` (Vite) can run
RUN npm ci

COPY . .

RUN npm run build

# Drop devDependencies to keep the image smaller
RUN npm prune --omit=dev

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "docker-start"]

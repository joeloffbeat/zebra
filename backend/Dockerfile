FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app /app

EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]

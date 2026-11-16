FROM node:22-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY services/shared/package*.json ./services/shared/
RUN cd services/shared && npm install
COPY services/shared ./services/shared

COPY services/bots/package*.json ./services/bots/
WORKDIR /app/services/bots
RUN npm install
COPY services/bots .
EXPOSE 4002
CMD ["node", "src/index.js"]

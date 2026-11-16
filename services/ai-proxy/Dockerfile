FROM node:22-alpine
WORKDIR /app
COPY services/shared/package*.json ./services/shared/
RUN cd services/shared && npm install
COPY services/shared ./services/shared

COPY services/ai-proxy/package*.json ./services/ai-proxy/
WORKDIR /app/services/ai-proxy
RUN npm install
COPY services/ai-proxy .
EXPOSE 4003
CMD ["node", "src/index.js"]

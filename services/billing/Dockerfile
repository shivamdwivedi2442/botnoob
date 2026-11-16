FROM node:22-alpine
WORKDIR /app
COPY services/shared/package*.json ./services/shared/
RUN cd services/shared && npm install
COPY services/shared ./services/shared

COPY services/billing/package*.json ./services/billing/
WORKDIR /app/services/billing
RUN npm install
COPY services/billing .
EXPOSE 4004
CMD ["node", "src/index.js"]

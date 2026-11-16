FROM node:22-alpine
WORKDIR /app
COPY services/shared/package*.json ./services/shared/
RUN cd services/shared && npm install
COPY services/shared ./services/shared

COPY services/support/package*.json ./services/support/
WORKDIR /app/services/support
RUN npm install
COPY services/support .
EXPOSE 4005
CMD ["node", "src/index.js"]

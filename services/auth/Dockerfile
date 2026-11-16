FROM node:22-alpine
WORKDIR /app
COPY services/shared/package*.json ./services/shared/
RUN cd services/shared && npm install
COPY services/shared ./services/shared

COPY services/auth/package*.json ./services/auth/
WORKDIR /app/services/auth
RUN npm install
COPY services/auth .
EXPOSE 4001
CMD ["node", "src/index.js"]

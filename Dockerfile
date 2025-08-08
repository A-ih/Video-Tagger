FROM node:20-alpine

# Install ffmpeg and ffprobe
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3020

EXPOSE 3020

CMD ["npm", "start"] 
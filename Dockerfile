FROM node:20-alpine

# Install bashio for Home Assistant add-on helpers
RUN apk add --no-cache bash jq curl

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy built application
COPY dist/ ./dist/
COPY run.sh ./
RUN chmod +x run.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8099/health || exit 1

EXPOSE 8099

CMD ["./run.sh"]

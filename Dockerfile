# Stage 1: Extract broker URL certs from official hame-relay image
FROM ghcr.io/tomquist/hame-relay:latest AS hame-relay-certs

# The certs are already in /app/certs/ in the hame-relay image
# We copy them in the next stage

# Stage 2: Build our application
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Stage 3: Production image
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache bash jq curl

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY dist/ ./dist/
COPY run.sh ./
RUN chmod +x run.sh

# Copy broker URL certs from hame-relay image
# These contain the secret broker URLs for hame-2024 and hame-2025
COPY --from=hame-relay-certs /app/certs/hame-2024-url ./certs/hame-2024-url
COPY --from=hame-relay-certs /app/certs/hame-2025-url ./certs/hame-2025-url
COPY --from=hame-relay-certs /app/certs/ca.crt ./certs/ca.crt
COPY --from=hame-relay-certs /app/certs/hame-2024.crt ./certs/hame-2024.crt
COPY --from=hame-relay-certs /app/certs/hame-2024.key ./certs/hame-2024.key
COPY --from=hame-relay-certs /app/certs/hame-2025.crt ./certs/hame-2025.crt
COPY --from=hame-relay-certs /app/certs/hame-2025.key ./certs/hame-2025.key
COPY --from=hame-relay-certs /app/certs/hame-2025-topic-encryption-key ./certs/hame-2025-topic-encryption-key

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8099/health || exit 1

EXPOSE 8099

CMD ["./run.sh"]

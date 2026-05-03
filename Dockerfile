# Multi-stage build for minimal production image
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Production stage
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

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8099/health || exit 1

EXPOSE 8099

CMD ["./run.sh"]

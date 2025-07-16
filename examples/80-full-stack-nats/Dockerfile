# --- Stage 1: Builder ---
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json from the example directory
COPY examples/80-full-stack-nats/package.json ./

# Install dependencies. This will use the docker cache if the package
# was previously installed in a parent image.
RUN npm install

# Copy the source code of the example
COPY examples/80-full-stack-nats/src ./src

# Copy the tsconfig.json for the example
COPY examples/80-full-stack-nats/tsconfig.json ./

# Build the example
RUN npm run build

# --- Stage 2: Production ---
FROM node:18-alpine AS production

WORKDIR /app

# Copy built artifacts from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Expose the port for the API Gateway
EXPOSE 3000

# The command to run the service will be provided by docker-compose.
CMD [ "node", "dist/api-gateway/index.js" ] 
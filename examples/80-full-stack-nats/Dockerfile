# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Install all dependencies for the entire monorepo
RUN npm install

# Copy the entire project source code
COPY . .

# Build the main library first
RUN npm run build

# Pack the main library into a .tgz file
RUN npm pack

# Then, build the specific example
WORKDIR /app/examples/80-full-stack-nats
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

# Copy the package.json for the example
COPY --from=builder /app/examples/80-full-stack-nats/package.json ./package.json

# Copy the packed library from the builder stage
COPY --from=builder /app/syntropylog-*.tgz ./

# Install production dependencies for the example, including our packed library
RUN npm install ./syntropylog-*.tgz

# Copy the compiled source code of the example
COPY --from=builder /app/examples/80-full-stack-nats/dist ./dist

# Expose the port the app runs on
EXPOSE 3000

# Command to run the specific service, this will be overridden by docker-compose
CMD ["node", "dist/api-gateway/index.js"] 
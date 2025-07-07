# Example 06 - Redis (Single Instance)

This example demonstrates how to use `beaconlog` with the `redis` library to connect to a single Redis instance. It shows how commands are automatically logged with context and performance metrics.

## Prerequisites

Before running this example, you must first build the main `beaconlog` library from the project's root directory:

```bash
# From the project root
npm run build
```

This step ensures that the local `beaconlog` dependency used by this example is up-to-date.

## Setup

1. **Start Redis:**
   This example requires a running Redis instance. You can easily start one using the provided Docker Compose file:
   ```bash
   # From this directory (examples/06-redis-single)
   docker-compose up -d
   ```

2. **Install dependencies:**
   Install the project dependencies, including the `redis` peer dependency.
   ```bash
   npm install
   ```

## Running the Example

Once Redis is running and dependencies are installed, you can run the example:

```bash
npm start
```

This will execute the `index.ts` file. You will see structured JSON logs in your console for each Redis command, enriched with a correlation ID and other metadata.

## Cleaning Up

To stop and remove the Redis container when you are finished, run:

```bash
docker-compose down
```
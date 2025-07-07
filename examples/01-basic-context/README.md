# Basic Context Example

This example demonstrates the basic usage of `beaconlog` to log events with a context.

## Prerequisites

Before running this example, you must first build the main `beaconlog` library from the project's root directory:

```bash
# From the project root
npm run build
```

This step ensures that the local `beaconlog` dependency used by this example is up-to-date. After building, you can proceed with installing the example's dependencies.

## How to Run

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the example:**
   ```bash
   npm start
   ```

## Expected Output

When you run the example, you will see output similar to this in your console:

```
[2023-10-27T10:00:00.000Z] INFO: User logged in. Context: { userId: '123', ipAddress: '192.168.1.100' }
[2023-10-27T10:00:00.001Z] WARN: Failed login attempt. Context: { userId: 'guest', ipAddress: '192.168.1.101' }
[2023-10-27T10:00:00.002Z] ERROR: Database connection lost. Context: { service: 'auth-service' }
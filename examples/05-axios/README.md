# Example 05 - Axios

This example demonstrates how to use `beaconlog` with `axios` to log network requests.

## Prerequisites

Before running this example, you must first build the main `beaconlog` library from the project's root directory:

```bash
# From the project root
npm run build
```

This step ensures that the local `beaconlog` dependency used by this example is up-to-date. After building, you can proceed with installing the example's dependencies.

## Setup

1. **Install dependencies:**

   ```bash
   npm install axios beaconlog
   ```

2. **Run the example:**

   ```bash
   node index.js
   ```

## Code Explanation

The `index.js` file sets up `beaconlog` to intercept `axios` requests and responses.

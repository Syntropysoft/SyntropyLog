# Example 100: Custom Serializers

This example demonstrates one of the most powerful features of SyntropyLog: **Custom Serializers**.

## The Goal

Sometimes, you need to log complex objects from third-party libraries, like an ORM (e.g., Prisma, TypeORM) or a database driver. These objects often contain sensitive information (like password hashes), circular references, or excessive metadata that pollutes your logs.

Custom serializers allow you to define a specific function to transform these objects into a clean, structured, and safe log format *before* they are written.

## How It Works

1.  **Define a Serializer Function**: You create a simple function that receives the object and returns a string. Inside this function, you have full control to cherry-pick fields, redact data, or format the output as you see fit.
2.  **Register the Serializer**: When initializing `syntropylog`, you provide your function in the `serializers` configuration map. You assign it a unique key (e.g., `prismaUser`).
3.  **Use It Transparently**: When you make a log call, you add a field to the metadata object with the same key you registered (e.g., `{ prismaUser: myUserObject }`). SyntropyLog will automatically detect it and pipe `myUserObject` through your custom serializer.

This approach keeps your application code clean, centralizes your serialization logic, and ensures your logs are always structured and secure.

## Running the Example

1.  Navigate to this directory:
    ```sh
    cd examples/100-custom-serializers
    ```
2.  Install dependencies:
    ```sh
    npm install
    ```
3.  Run the script:
    ```sh
    npm start
    ```

You will see in the console how the raw user object is processed by the custom serializer, removing the `passwordHash` and formatting the output cleanly. 
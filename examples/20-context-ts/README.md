# Example 02: Using SyntropyLog with TypeScript

This example demonstrates how to integrate SyntropyLog into a TypeScript project, leveraging the benefits of static typing for a more robust and developer-friendly experience.

## The "Why"

While SyntropyLog works perfectly in JavaScript, using it with TypeScript provides several advantages:

*   **Type-Safe Configuration**: The `syntropyLog.init()` method is fully typed. Your IDE will provide autocomplete and error checking, preventing typos and ensuring your configuration object is valid before you even run the code.
*   **Discoverability**: TypeScript makes it easier to discover available options within the configuration, such as different transport types or masking settings.
*   **Stronger Contracts**: When you create child loggers or use `runWith`, you can be confident you're passing correctly typed data.

## Purpose

The goal of this example is to show:
1.  How to import and initialize `syntropyLog` in a TypeScript file.
2.  How the TypeScript compiler helps you write a valid configuration.
3.  A simple demonstration of logging within a typed project.

## How to Run

1.  **Install Dependencies**:
    From the `examples/02-context-ts` directory, run:
    ```bash
    npm install
    ```

2.  **Run the Script**:
    ```bash
    npm start
    ```

## Expected Output

The output will be a simple series of logs, demonstrating a logger instance working correctly within a TypeScript application.

```
INFO (my-ts-app): Logger initialized in TypeScript project.
INFO (my-ts-app): This is a typed log message! {"userId":42,"status":"active"}
```

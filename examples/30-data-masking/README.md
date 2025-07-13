# Example 30: Data Masking

This example demonstrates SyntropyLog's powerful and configurable data masking engine, a critical feature for security and compliance.

## The "Why"

In any real-world application, you handle sensitive data: passwords, API keys, personal information, credit card numbers, etc. Accidentally logging this data is a major security risk and can lead to compliance violations (like GDPR or HIPAA).

SyntropyLog's philosophy is **secure by default**. Its masking engine automatically finds and redacts sensitive information before it ever leaves your application.

## Purpose

This example demonstrates two key masking strategies:

1.  **Fixed-Length Masking (Default)**: The most secure approach. It replaces sensitive data with a fixed-length string (e.g., `******`). This prevents leaking any metadata about the secret, including its length.
2.  **Preserve-Length Masking**: A more flexible option for development or debugging. It replaces sensitive data with a mask of the *same length* as the original value, which can make logs easier to read.

## How to Run

1.  **Install Dependencies**:
    From the `examples/30-data-masking` directory, run:
    ```bash
    npm install
    ```

2.  **Build the Example**:
    This example must be compiled from TypeScript to JavaScript first.
    ```bash
    npm run build
    ```

3.  **Run the Scripts**:
    You can run each demonstration separately.

    *   To see the default, fixed-length masking:
        ```bash
        npm run start:fixed
        ```
    *   To see the preserve-length masking:
        ```bash
        npm run start:preserve
        ```

## Expected Output

### Fixed-Length Masking

When you run `npm run start:fixed`, you will see that all sensitive fields and path segments are replaced with `******`.

```
--- Testing Default "fixed" Masking Style ---
{"payload":{"transactionId":"txn_12345abc",...,"ssn":"******",...,"creditCardNumber":"******",...,"apiToken":"******","requestPath":"/api/v1/user/ssn/******/details"},...}
```

### Preserve-Length Masking

When you run `npm run start:preserve`, the mask (`*`) will match the length of the original data.

```
--- Testing "preserve-length" Masking Style ---
{"payload":{"transactionId":"txn_12345abc",...,"ssn":"***********",...,"creditCardNumber":"*******************",...,"apiToken":"********************","requestPath":"/api/v1/user/ssn/***********/details"},...}
``` 
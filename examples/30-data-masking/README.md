# Example 08: Data Masking

This example demonstrates how to automatically mask or redact sensitive information from your logs.

## The "Why"

In any real-world application, you'll handle sensitive data: passwords, API keys, personal information, credit card numbers, etc. Accidentally logging this data is a major security risk and can lead to compliance violations (like GDPR or HIPAA).

SyntropyLog provides a built-in data masking engine to prevent this. You simply tell the logger which data keys are sensitive, and it will automatically replace their values before they are written to any log output.

It's like having a friendly security guard for your logs who automatically blacks out the important stuff with a marker.

## Purpose

The goal of this example is to show how to:
1.  Configure the logger with a list of sensitive `keys` to mask.
2.  Log a complex, nested object containing some of those sensitive keys.
3.  Observe how the output automatically redacts the sensitive values.

## How to Run

1.  **Install Dependencies**:
    From the `examples/08-data-masking` directory, run:
    ```bash
    npm install
    ```

2.  **Run the Script**:
    ```bash
    npm start
    ```

## Expected Output

You will see the log output in your console, but notice that the values for `creditCardNumber` and `apiToken` have been replaced with `[REDACTED]`:

```
INFO (secure-payment-processor): Processing a new payment...
INFO (secure-payment-processor): New payment received {"payload":{"transactionId":"txn_12345abc","amount":49.99,"currency":"USD","customer":{"id":"cust_67890","name":"John Doe"},"paymentMethod":{"type":"credit_card","creditCardNumber":"[REDACTED]"},"metadata":{"source":"web-checkout","apiToken":"[REDACTED]","timestamp":"..."}}}
INFO (secure-payment-processor): Payment processed successfully. Awaiting confirmation.
``` 
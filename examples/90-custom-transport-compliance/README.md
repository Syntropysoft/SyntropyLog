# Example 90: Custom Transport for Compliance

This advanced example demonstrates how to build a custom log transport to ship logs to an external collector. This pattern is the foundation for meeting compliance requirements (like GDPR, HIPAA, or SOC 2) which often demand centralized logging, specific retention policies, and audit trails.

## The "Why"

In a production environment, logging directly to the console or a local file isn't enough. You need to send logs to a robust, centralized system (like Fluentd, Logstash, Datadog, or Splunk) for:
- **Centralization**: Aggregating logs from dozens or hundreds of services.
- **Retention**: Storing logs for long periods (e.g., 1 year) as required by regulations.
- **Analysis & Alerting**: Searching, analyzing, and creating alerts based on log data.
- **Security**: Ensuring log data is stored securely and is tamper-proof.

SyntropyLog's transport system is designed to be extended. By creating a custom transport, you can teach the framework how to send logs to **any destination** in **any format**.

## Purpose

The goal of this example is to build a `UdpJsonTransport` that sends logs over the network to a [Fluent Bit](https://fluentbit.io/) collector running in Docker. We will demonstrate:
1.  How to create a custom class that implements the `Transport` interface from SyntropyLog.
2.  How to use Node.js's built-in `dgram` module to send data over UDP.
3.  How to configure SyntropyLog to use our new custom transport.
4.  How to use Docker Compose to run a Fluent Bit log collector.
5.  How to verify that our logs are being successfully received by the collector.

## How to Run

This example has two parts: the log collector service (Fluent Bit) and our Node.js application.

1.  **Start the Log Collector**:
    This command starts Fluent Bit in the background. It will listen on UDP port 5170 for incoming logs.
    ```bash
    npm run services:up
    ```

2.  **View the Collector's Logs**:
    Open a **new terminal** and run this command. You will see the Fluent Bit startup messages. Keep this terminal open to see your application's logs arrive.
    ```bash
    npm run services:logs
    ```

3.  **Install Dependencies and Run the App**:
    In your original terminal, install the Node.js dependencies and run the application.
    ```bash
    npm install
    npm start
    ```

4.  **Observe the Output**:
    - Your application's terminal will show minimal output.
    - The **Fluent Bit terminal** (from step 2) will display the JSON logs sent from your application, proving the custom transport is working!

5.  **Clean Up**:
    Once you're done, stop the Fluent Bit container.
    ```bash
    npm run services:down
    ```

## Expected Output (in Fluent Bit Terminal)

You will see output similar to this in the `npm run services:logs` terminal, showing the logs as received by Fluent Bit:

```
[0] udp.0: [1709322699.539385, {"msg":"Logger initialized with custom UDP transport.","level":30,...}]
[1] udp.0: [1709322699.539498, {"msg":"Shipping this log to Fluent Bit!","level":30,...}]
[2] udp.0: [1709322699.539523, {"msg":"Another one...","level":40,"payload":{"userId":123},"..."}]
``` 
# SyntropyLog — General Overview

SyntropyLog is a **structured observability framework** designed specifically for **Node.js** applications. Its primary goal is to let you declare what information your logs should carry automatically, guaranteeing performance and regulatory compliance at all times.

It is purpose-built for **high-demand** and **highly regulated** environments (such as banking, healthcare, or fintech), where data control and system resilience are critical.

---

## What is it for?

In traditional applications, logs can be heavy, hard to trace, or contain sensitive information (like passwords or personal data) that violates regulations like GDPR or HIPAA.

SyntropyLog solves this by allowing you to:
1. **Control what is shown:** Using a matrix (`Logging Matrix`), you define which context fields (such as `userId` or `correlationId`) are included at each log level (e.g., few on `info`, everything on `error`).
2. **Protect sensitive data:** An automatic masking engine (`MaskingEngine`) filters passwords, emails, credit cards, etc., **before** the log leaves the system.
3. **Never crash the application:** The processing pipeline is designed to be fail-safe: it neutralizes circular references, limits depth, and uses a high-performance **Rust** native addon so that writing a log never blocks Node.js's event loop.

---

## Key Concepts

| Concept | What it does |
| :--- | :--- |
| **Native Addon (Rust)** | An optional Rust module (recommended) that processes logs at maximum speed (serialization, masking, and sanitization). |
| **Logging Matrix** | A declarative configuration that defines which context variables are visible according to the log level (`debug`, `info`, `warn`, `error`). **Important:** Only fields or headers declared in the initial context configuration are processed and shown. |
| **MaskingEngine** | Redacts sensitive fields in real time based on predefined rules or regular expressions. **Config:** You can enable default rules and/or define your own text patterns (regex) to replace. |
| **Universal Adapter** | Lets you send your logs to any database or service (PostgreSQL, MongoDB, Elasticsearch) by implementing a single save function (`executor`), without locking in to a specific vendor. |

---

## Main Benefits

* **Extreme Performance:** Thanks to the Rust addon, log processing is very lightweight on Node.js CPU.
* **Direct Compliance:** Facilitates audits (SOX, GDPR, PCI-DSS) through a dedicated `audit` level (**immune to log level filters, always written**) and retention policies.
* **Active Security:** Sanitizes strings to prevent *Log Injection* attacks.
* **Traceability:** Automatically manages `Correlation ID` and `Transaction ID` throughout the entire request or lifecycle.

---

*For code examples and the full feature list, see [features-and-examples.md](./features-and-examples.md).*

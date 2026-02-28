# Serialization & Custom Formatting

SyntropyLog handles data complex structures automatically, but you can override this behavior using custom serializers.

## 🧩 Custom Serializers

Serializers are functions that transform specific fields in your log metadata before they are processed by transports. This is useful for:
- Redacting PII from specific objects.
- Truncating large logs.
- Formatting complex data types (e.g., Dates, BigInts).

### **Configuration**
```typescript
await syntropyLog.init({
  logger: {
    serializers: {
      password: (val) => '[REDACTED]',
      user: (user) => `${user.name} (${user.id})`,
      req: (req) => ({ method: req.method, url: req.url })
    },
    serializerTimeoutMs: 100 // Protection against slow serializers
  }
});
```

---

## 🛡️ The Silent Observer Guard

Custom serializers run inside the **Silent Observer** pipeline. If a serializer throws an error or exceeds the `serializerTimeoutMs`, SyntropyLog will catch the error, report it internally, and continue with the original un-serialized data.

**Your application will never crash because of a log formatter.**

---

## 🎒 Pre-built Serializers (Adapters)

While SyntropyLog is framework-agnostic, we provide pre-built patterns for common tools:

- **Prisma Serializer**: Gracefully handles Prisma error objects.
- **Axios Serializer**: Formats request/response objects concisely.
- **Express Serializer**: Extracts `method`, `path`, and `ip` from request objects.

> [!NOTE]
> Standard serializers are being migrated to the `@syntropylog/adapters` package.

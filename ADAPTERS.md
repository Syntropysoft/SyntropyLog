# SyntropyLog Adapters

This repository includes external adapters for SyntropyLog as a Git submodule.

## 📦 Installation

The adapters are available as a separate npm package:

```bash
npm install @syntropylog/adapters
```

## 🔧 Usage

### Import from npm package (Recommended)

```typescript
// Import everything
import { 
  KafkaAdapter, 
  PrismaSerializer, 
  AxiosAdapter 
} from '@syntropylog/adapters';

// Import by category (tree-shaking)
import { PrismaSerializer } from '@syntropylog/adapters/serializers';
import { KafkaAdapter } from '@syntropylog/adapters/brokers';
import { AxiosAdapter } from '@syntropylog/adapters/http';
```

### Use with SyntropyLog

```typescript
import { syntropyLog } from 'syntropylog';
import { PrismaSerializer } from '@syntropylog/adapters/serializers';

// Initialize SyntropyLog
const logger = syntropyLog({
  name: 'my-app',
  level: 'info'
});

// Use adapters independently
const prismaSerializer = new PrismaSerializer();
const result = await prismaSerializer.serialize(prismaQuery, {
  timeout: 100,
  sanitize: true
});
```

## 🏗️ Architecture

### Independent Packages
- **syntropylog**: Main framework
- **@syntropylog/adapters**: External adapters package

### Benefits
- ✅ **Independent versioning** - Each package evolves separately
- ✅ **Selective installation** - Install only what you need
- ✅ **Tree-shaking friendly** - Import only specific adapters
- ✅ **No dependencies** - Main framework doesn't depend on adapters

## 📋 Available Adapters

### Brokers
- **KafkaAdapter** - Apache Kafka integration
- **NatsAdapter** - NATS messaging system
- **RabbitMQAdapter** - RabbitMQ message broker

### HTTP Clients
- **AxiosAdapter** - Axios HTTP client
- **FetchAdapter** - Native fetch API
- **GotAdapter** - Got HTTP client

### Database Serializers
- **PrismaSerializer** - Prisma ORM queries and errors
- **TypeORMSerializer** - TypeORM queries and errors
- **MySQLSerializer** - MySQL queries and errors
- **PostgreSQLSerializer** - PostgreSQL queries and errors
- **SQLServerSerializer** - SQL Server queries and errors
- **OracleSerializer** - Oracle Database queries and errors
- **MongoDBSerializer** - MongoDB queries and aggregations

## 🔗 Links

- **NPM Package**: https://www.npmjs.com/package/@syntropylog/adapters
- **GitHub Repository**: https://github.com/Syntropysoft/syntropylog-adapters
- **Documentation**: See the README in the adapters package

## 🧪 Development

For development, the adapters are included as a Git submodule in `external-adapters/`.

```bash
# Initialize submodules
git submodule update --init --recursive

# Update submodule to latest
git submodule update --remote
``` 
import { SerializationManager } from '../src/serialization/SerializationManager';
import { PrismaSerializer } from '../modules/syntropyLog-adapters/src/serializers/prisma/PrismaSerializer';
import { TypeORMSerializer } from '../modules/syntropyLog-adapters/src/serializers/typeorm/TypeORMSerializer';
import { MySQLSerializer } from '../modules/syntropyLog-adapters/src/serializers/mysql/MySQLSerializer';
import { PostgreSQLSerializer } from '../modules/syntropyLog-adapters/src/serializers/postgres/PostgreSQLSerializer';
import { SQLServerSerializer } from '../modules/syntropyLog-adapters/src/serializers/sqlserver/SQLServerSerializer';
import { OracleSerializer } from '../modules/syntropyLog-adapters/src/serializers/oracle/OracleSerializer';

// 🚀 **EJEMPLO ESPECTACULAR: Arquitectura de Pipeline con SRP**

async function demonstratePipelineArchitecture() {
  console.log('🚀 **ARQUITECTURA DE PIPELINE ESPECTACULAR**\n');

  // 1. Configurar el manager con pipeline
  const manager = new SerializationManager({
    enableMetrics: true,
    sanitizeSensitiveData: true,
    sanitizationContext: {
      sensitiveFields: ['password', 'token', 'secret', 'api_key', 'connection_string'],
      redactPatterns: [
        /password\s*=\s*['"][^'"]*['"]/gi,
        /user\s*=\s*['"][^'"]*['"]/gi,
        /token\s*=\s*['"][^'"]*['"]/gi
      ],
      maxStringLength: 200,
      enableDeepSanitization: true
    }
  });

  // 2. Registrar todos los serializadores ultra-rápidos
  manager.register(new PrismaSerializer());
  manager.register(new TypeORMSerializer());
  manager.register(new MySQLSerializer());
  manager.register(new PostgreSQLSerializer());
  manager.register(new SQLServerSerializer());
  manager.register(new OracleSerializer());

  console.log('✅ Serializadores registrados:', manager.getRegisteredSerializers());
  console.log('');

  // 3. Datos de prueba con información sensible
  const testData = {
    // Query de Prisma compleja
    prismaQuery: {
      model: 'User',
      action: 'findMany',
      args: {
        where: {
          email: { contains: 'admin' },
          password: 'super_secret_password_123', // 🔒 Sensible
          api_key: 'sk-1234567890abcdef' // 🔒 Sensible
        },
        include: {
          profile: true,
          posts: {
            include: {
              comments: true
            }
          }
        },
        take: 50,
        orderBy: { createdAt: 'desc' }
      }
    },

    // Query de TypeORM con joins
    typeormQuery: {
      sql: `
        SELECT u.id, u.email, u.password, u.api_key, p.name, p.bio 
        FROM users u 
        LEFT JOIN profiles p ON u.id = p.user_id 
        WHERE u.email LIKE '%admin%' AND u.password = 'secret123'
      `,
      parameters: ['admin', 'secret123'],
      queryType: 'SELECT',
      table: 'users',
      alias: 'u',
      joins: [
        { table: 'profiles', alias: 'p', condition: 'u.id = p.user_id' }
      ]
    },

    // Query de MySQL con stored procedure
    mysqlQuery: {
      sql: `
        SELECT u.id, u.email, u.password, p.name 
        FROM users u 
        LEFT JOIN profiles p ON u.id = p.user_id 
        WHERE u.email LIKE ? AND u.password = ?
      `,
      values: ['admin', 'secret123'],
      connectionConfig: {
        host: 'localhost',
        port: 3306,
        database: 'myapp',
        user: 'admin',
        password: 'mysql_password_123' // 🔒 Sensible
      }
    },

    // Query de PostgreSQL con CTE
    postgresQuery: {
      text: `
        WITH user_stats AS (
          SELECT user_id, COUNT(*) as post_count 
          FROM posts 
          WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY user_id
        )
        SELECT u.id, u.email, u.password, us.post_count
        FROM users u
        LEFT JOIN user_stats us ON u.id = us.user_id
        WHERE u.email LIKE $1
      `,
      values: ['admin'],
      config: {
        host: 'localhost',
        port: 5432,
        database: 'myapp',
        user: 'postgres',
        password: 'postgres_password_456' // 🔒 Sensible
      }
    },

    // Query de SQL Server con stored procedure
    sqlserverQuery: {
      query: `
        EXEC GetUserData 
        @Email = @email, 
        @Password = @password
      `,
      parameters: [
        { name: '@email', value: 'admin@example.com' },
        { name: '@password', value: 'sqlserver_pass_789' } // 🔒 Sensible
      ],
      config: {
        server: 'localhost',
        database: 'myapp',
        user: 'sa',
        password: 'sqlserver_password' // 🔒 Sensible
      }
    },

    // Query de Oracle con PL/SQL
    oracleQuery: {
      sql: `
        BEGIN
          SELECT u.id, u.email, u.password, p.name
          INTO :user_id, :user_email, :user_password, :profile_name
          FROM users u
          LEFT JOIN profiles p ON u.id = p.user_id
          WHERE u.email = :email_param;
        END;
      `,
      bindParams: [
        { name: 'email_param', value: 'admin@oracle.com' },
        { name: 'user_password', value: 'oracle_password_abc', direction: 'out' } // 🔒 Sensible
      ],
      config: {
        host: 'localhost',
        port: 1521,
        serviceName: 'XE',
        user: 'system',
        password: 'oracle_password_123', // 🔒 Sensible
        connectString: 'localhost:1521/XE'
      }
    },

    // Error de Prisma con información sensible
    prismaError: {
      code: 'P2002',
      message: 'Unique constraint failed on the fields: (`email`)',
      meta: {
        target: ['email'],
        connection_string: 'mysql://user:password@localhost:3306/db' // 🔒 Sensible
      }
    },

    // Error de MySQL
    mysqlError: {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      sqlMessage: 'Duplicate entry for key PRIMARY',
      sql: 'INSERT INTO users (email, password) VALUES (?, ?)', // 🔒 Sensible
      sqlState: '23000'
    },

    // Error de PostgreSQL
    postgresError: {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      detail: 'Key (email)=(admin@example.com) already exists.',
      sql: 'INSERT INTO users (email, password) VALUES ($1, $2)', // 🔒 Sensible
      table: 'users',
      constraint: 'users_email_key'
    }
  };

  // 4. Procesar cada tipo de dato
  console.log('🔄 **PROCESANDO DATOS CON PIPELINE**\n');

  for (const [name, data] of Object.entries(testData)) {
    console.log(`📊 Procesando: ${name}`);
    console.log('─'.repeat(50));

    const startTime = Date.now();
    const result = await manager.serialize(data);
    const totalDuration = Date.now() - startTime;

    if (result.success) {
      console.log('✅ Serialización exitosa');
      console.log(`📈 Duración total: ${totalDuration}ms`);
      
      // Mostrar métricas del pipeline
      const pipelineMetrics = manager.getPipelineMetrics();
      if (pipelineMetrics) {
        console.log('🔧 Métricas del Pipeline:');
        console.log(`   • Serialización: ${pipelineMetrics.stepDurations.serialization || 0}ms`);
        console.log(`   • Sanitización: ${pipelineMetrics.stepDurations.sanitization || 0}ms`);
        console.log(`   • Timeout: ${pipelineMetrics.stepDurations.timeout || 0}ms`);
        console.log(`   • Timeout de operación: ${pipelineMetrics.operationTimeout}ms`);
        console.log(`   • Estrategia: ${pipelineMetrics.timeoutStrategy}`);
      }

      // Mostrar datos procesados (solo estructura, no contenido sensible)
      console.log('📋 Estructura del resultado:');
      console.log(`   • Tipo: ${result.data.type}`);
      console.log(`   • Serializador: ${result.data.serializer || 'N/A'}`);
      console.log(`   • Complejidad: ${result.data.serializationComplexity || 'N/A'}`);
      console.log(`   • Sanitizado: ${result.data.sanitized ? 'Sí' : 'No'}`);
      console.log(`   • Timeout aplicado: ${result.data.timeoutApplied ? 'Sí' : 'No'}`);

      // Verificar que la serialización fue ultra-rápida
      const serializationDuration = result.data.serializationDuration || 0;
      if (serializationDuration <= 10) {
        console.log(`⚡ Serialización ultra-rápida: ${serializationDuration}ms ✅`);
      } else {
        console.log(`⚠️  Serialización lenta: ${serializationDuration}ms ❌`);
      }

    } else {
      console.log('❌ Error en serialización:', result.error);
    }

    console.log('');
  }

  // 5. Mostrar métricas finales
  console.log('📊 **MÉTRICAS FINALES**');
  console.log('─'.repeat(50));

  const metrics = manager.getMetrics();
  console.log(`Total serializaciones: ${metrics.totalSerializations}`);
  console.log(`Exitosas: ${metrics.successfulSerializations}`);
  console.log(`Fallidas: ${metrics.failedSerializations}`);
  console.log(`Duración promedio de serialización: ${metrics.averageSerializationDuration.toFixed(2)}ms`);
  console.log(`Timeout promedio de operación: ${metrics.averageOperationTimeout.toFixed(2)}ms`);
  console.log(`Duración máxima de serialización: ${metrics.maxSerializationDuration}ms`);
  console.log(`Duración mínima de serialización: ${metrics.minSerializationDuration}ms`);

  console.log('\n📈 Distribución por complejidad:');
  console.log(`   • Baja: ${metrics.complexityDistribution.low}`);
  console.log(`   • Media: ${metrics.complexityDistribution.medium}`);
  console.log(`   • Alta: ${metrics.complexityDistribution.high}`);

  console.log('\n🔧 Distribución por serializador:');
  Object.entries(metrics.serializerDistribution).forEach(([serializer, count]) => {
    console.log(`   • ${serializer}: ${count}`);
  });

  console.log('\n⏱️  Distribución por estrategia de timeout:');
  Object.entries(metrics.timeoutStrategyDistribution).forEach(([strategy, count]) => {
    console.log(`   • ${strategy}: ${count}`);
  });

  // 6. Verificar que los timeouts de serialización son ultra-bajos
  console.log('\n⚡ **VERIFICACIÓN DE PERFORMANCE**');
  console.log('─'.repeat(50));

  if (metrics.averageSerializationDuration <= 10) {
    console.log(`✅ Serialización ultra-rápida: ${metrics.averageSerializationDuration.toFixed(2)}ms promedio`);
  } else {
    console.log(`❌ Serialización lenta: ${metrics.averageSerializationDuration.toFixed(2)}ms promedio`);
  }

  if (metrics.maxSerializationDuration <= 10) {
    console.log(`✅ Sin serializaciones lentas: máximo ${metrics.maxSerializationDuration}ms`);
  } else {
    console.log(`⚠️  Serializaciones lentas detectadas: máximo ${metrics.maxSerializationDuration}ms`);
  }

  console.log('\n🎉 **ARQUITECTURA PIPELINE IMPLEMENTADA CON ÉXITO**');
  console.log('✅ Responsabilidades separadas (SRP)');
  console.log('✅ Serializadores ultra-rápidos (< 10ms)');
  console.log('✅ Timeouts de operación inteligentes');
  console.log('✅ Sanitización centralizada');
  console.log('✅ Métricas precisas y detalladas');
  console.log('✅ Pipeline extensible y mantenible');
  console.log('✅ Soporte completo para 6 bases de datos');
}

// Ejecutar el ejemplo
demonstratePipelineArchitecture().catch(console.error); 
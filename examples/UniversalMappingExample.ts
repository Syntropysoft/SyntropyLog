/**
 * @file examples/UniversalMappingExample.ts
 * @description Demostración de UniversalAdapter y UniversalLogFormatter.
 * Mapea logs de aplicación a un esquema "Legacy SIEM" plano sin tocar el código de negocio.
 */
import {
    syntropyLog,
    UniversalAdapter,
    UniversalLogFormatter,
    LogLevel
} from '../src/index';
import { AdapterTransport } from '../src/logger/transports/AdapterTransport';

async function runExample() {
    // 1. Definimos el mapeo para el "Legacy SIEM"
    // El SIEM espera campos específicos: 'evt_time', 'sev', 'msg', 'app_id', 'tx_id'
    const legacyFormatter = new UniversalLogFormatter({
        mapping: {
            evt_time: 'timestamp',
            sev: 'level',
            msg: 'message',
            app_id: { value: 'PAYMENT-GATEWAY-01' }, // Valor estático
            tx_id: ['transactionId', 'correlationId', { value: 'N/A' }], // Fallbacks en cascada
            user: 'user.id', // Path profundo (si existe en metadatos)
            retention_days: 'retention.days'
        }
    });

    // 2. Definimos el adaptador universal con un ejecutor (ej. una llamada a API o DB)
    const siemAdapter = new UniversalAdapter({
        executor: async (mappedData) => {
            console.log('\n--- [DESTINO LEGACY SIEM] ---');
            console.log('Enviando objeto mapeado:', JSON.stringify(mappedData, null, 2));
            console.log('-----------------------------\n');
            // Aquí iría: await axios.post('https://siem.internal/logs', mappedData);
        }
    });

    // 3. Configuramos el transporte usando el adaptador y el formateador
    const legacyTransport = new AdapterTransport({
        adapter: siemAdapter,
        formatter: legacyFormatter as any, // Cast por compatibilidad de tipos estructural
        name: 'LegacySiemTransport'
    });

    // 4. Inicializamos SyntropyLog
    await syntropyLog.init({
        logger: {
            serviceName: 'payment-service',
            level: 'info' as LogLevel,
            transports: [legacyTransport]
        }
    });

    const logger = syntropyLog.getLogger('payment-service');

    console.log('Iniciando transacción...');

    // 5. El código de negocio solo loguea con metadatos estándar
    // SyntropyLog se encarga de la magia del mapeo
    await logger
        .withTransactionId('TX-999555')
        .info('Procesando pago de tarjeta', {
            user: { id: 'usr_4422', email: 'test@example.com' },
            amount: 1500.50,
            retention: { days: 90, policy: 'FINANCIAL_RECORDS' }
        });

    await syntropyLog.shutdown();
}

runExample().catch(console.error);

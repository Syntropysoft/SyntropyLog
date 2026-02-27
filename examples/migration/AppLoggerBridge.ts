/**
 * @file AppLoggerBridge.ts
 * @description Proof of Concept: Bridging the legacy app-logger API to SyntropyLog.
 * 
 * REFINED VERSION: Incorporates technical feedback for schema alignment and best practices.
 */

// Use package-style imports if available, otherwise relative paths
import { syntropyLog } from '../../src/SyntropyLog';
import { UniversalAdapter } from '../../src/logger/adapters/UniversalAdapter';
import { UniversalLogFormatter } from '../../src/logger/formatters/UniversalLogFormatter';
import { AdapterTransport } from '../../src/logger/transports/AdapterTransport';
import { MaskingStrategy } from '../../src/masking/MaskingEngine';

/**
 * 1. Define the Legacy Mapping (ECLB-167 / echeq_logs.system_logs table)
 * Adjusted to use root-level property resolution since metadata is merged into LogEntry.
 */
const legacyMapping = {
    // id: Omitted: let DB handle UUID/Serial generation
    level: ['originalLevel', 'level'], // Use legacy level if available, fallback to 'audit'
    message: 'message',
    // context: Omitted here, handled by 'includeAllIn' option
    user_id: ['userId', 'bindings.userId'],
    tenant_id: ['tenantId', 'bindings.tenantId'],
    ip_address: ['ip', 'ipAddress', 'metadata.ipAddress'],
    user_agent: ['userAgent', 'metadata.userAgent'],
    created_at: 'timestamp',
    source: ['source', 'category'],
    error_detail: ['error.stack', 'err.stack'],
    endpoint: ['endpoint', 'url'],
    batch_id: 'batchId',
    user_email: 'userEmail',
    company_name: 'companyName',
    diagnostic_summary: 'summary',
};

/**
 * 2. Define the Masking Policy (ECLB-204)
 * Aligned with MaskingEngine schema (rules + strategies).
 */
const maskingPolicy = {
    preserveLength: true,
    rules: [
        { pattern: /password|token|secret|cvv|pincode/i, strategy: MaskingStrategy.PASSWORD },
        { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, strategy: MaskingStrategy.CREDIT_CARD },
        { pattern: /\b\d{2}-\d{8}-\d{1}\b/g, strategy: MaskingStrategy.CUSTOM, customMask: (val: string) => 'XX-XXXX-X' }
    ]
};

/**
 * 3. Initialize SyntropyLog with the Bridge Config
 * @param dbExecutor Function that executes the INSERT into system_logs.
 * It should receive the mapped object and omit the 'id' field if necessary.
 */
export async function initLegacyBridge(dbExecutor: (data: any) => Promise<void>) {
    await syntropyLog.init({
        // Masking is now at the root of the config
        masking: maskingPolicy,
        logger: {
            level: 'info',
            transports: {
                // App logs: standard console or separate file
                default: [],
                // Audit logs: route to Legacy Postgres Table via Universal Adapter
                audit: [
                    new AdapterTransport({
                        adapter: new UniversalAdapter({ executor: dbExecutor }),
                        formatter: new UniversalLogFormatter({
                            mapping: legacyMapping,
                            includeAllIn: 'context' // Voids bindings+metadata into the 'context' field
                        })
                    })
                ]
            }
        }
    });
}

/**
 * THE FACADE: appLogger (Match the legacy API exactly to ensure 100% transparency)
 */
export const appLogger = {
    info: (msg: string, meta?: any) => syntropyLog.getLogger('app').info(msg, meta),
    warn: (msg: string, meta?: any) => syntropyLog.getLogger('app').warn(msg, meta),
    error: (msg: string, meta?: any) => syntropyLog.getLogger('app').error(msg, meta),

    /**
     * ECLB-167: Unified Audit method
     * @param message Action description
     * @param meta Context (userId, tenantId, etc.)
     * @param level Legacy level mapping (info, warn, error)
     */
    audit: async (message: string, meta: any, level = 'info') => {
        const logger = syntropyLog.getLogger('audit');
        // .audit() bypasses intensity filters. We pass 'originalLevel' for the DB formatter.
        await logger.audit(message, { ...meta, originalLevel: level });
    }
};

/**
 * Example Setup:
 * 
 * import { initLegacyBridge, appLogger } from './AppLoggerBridge';
 * 
 * // The executor can be anything: pg, prisma, fetch, etc.
 * await initLegacyBridge(async (logData) => {
 *   // Example: Using a standard SQL Pool
 *   // const { id, ...columns } = logData; // Omit ID if handled by DB
 *   // await pool.query('INSERT INTO echeq_logs.system_logs ...', Object.values(columns));
 *   
 *   console.log('SQL PERSISTENCE SIMULATION:', logData);
 * });
 * 
 * appLogger.audit('User Login Attempt', { userId: 'u123', ip: '192.168.1.1' });
 */

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const syntropylog_1 = require("syntropylog");
const crypto_1 = require("crypto");
const nock_1 = __importDefault(require("nock"));
const got_1 = __importStar(require("got"));
const MOCK_API_URL = 'https://api.example.com';
// --- STEP 1: Implement the custom adapter ---
/**
 * A helper to convert Got's complex header object into a simple Record.
 */
function normalizeGotHeaders(headers) {
    const normalized = {};
    for (const key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
            const value = headers[key];
            if (value !== undefined) {
                normalized[key] = value;
            }
        }
    }
    return normalized;
}
/**
 * This is our custom adapter for the 'got' library.
 * It implements the IHttpClientAdapter interface, acting as a translator.
 */
class GotAdapter {
    gotInstance;
    constructor(instance) {
        this.gotInstance = instance;
    }
    async request(request) {
        try {
            // Translate the generic request to a Got-specific one
            const response = await this.gotInstance(request.url, {
                method: request.method,
                headers: request.headers,
                json: request.body,
                searchParams: request.queryParams,
                throwHttpErrors: false,
            });
            if (!response.ok) {
                throw new got_1.RequestError(response.statusMessage || 'HTTP Error', {}, response.request);
            }
            // Translate the Got response back to the generic format
            return {
                statusCode: response.statusCode,
                data: response.body,
                headers: normalizeGotHeaders(response.headers),
            };
        }
        catch (error) {
            if (error instanceof got_1.RequestError) {
                // Translate a Got error back to the generic format
                const normalizedError = {
                    name: 'AdapterHttpError',
                    message: error.message,
                    stack: error.stack,
                    isAdapterError: true,
                    request: request,
                    response: error.response
                        ? {
                            statusCode: error.response.statusCode,
                            data: error.response.body,
                            headers: normalizeGotHeaders(error.response.headers),
                        }
                        : undefined,
                };
                throw normalizedError;
            }
            throw error;
        }
    }
}
// --- STEP 2: Use the custom adapter ---
async function main() {
    syntropylog_1.syntropyLog.init({
        logger: {
            serviceName: 'custom-adapter-example',
            level: 'info',
            transports: [new syntropylog_1.CompactConsoleTransport()],
            serializerTimeoutMs: 100,
        },
        context: {
            correlationIdHeader: 'X-Correlation-ID',
        },
        http: {
            instances: [
                {
                    instanceName: 'my-got-client',
                    // Here we pass an *instance* of our custom adapter.
                    adapter: new GotAdapter(got_1.default.extend({ prefixUrl: MOCK_API_URL })),
                },
            ],
        },
    });
    const logger = syntropylog_1.syntropyLog.getLogger('main');
    logger.info('Initialized.');
    (0, nock_1.default)(MOCK_API_URL)
        .get('/products/456')
        .reply(200, function (uri, requestBody) {
        const correlationHeader = this.req.headers['x-correlation-id'];
        if (!correlationHeader) {
            throw new Error('X-Correlation-ID header was not received!');
        }
        logger.info('Nock mock confirmed: Correlation ID received!', { correlationId: correlationHeader });
        return { id: 456, name: 'SyntropyWidget' };
    });
    const contextManager = syntropylog_1.syntropyLog.getContextManager();
    await contextManager.run(async () => {
        const correlationId = (0, crypto_1.randomUUID)();
        contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
        logger.info('Context created. Making HTTP call...');
        const apiClient = syntropylog_1.syntropyLog.getHttp('my-got-client');
        try {
            await apiClient.request({
                method: 'GET',
                url: '/products/456',
                headers: {},
            });
        }
        catch (error) {
            logger.error('API call failed', { error });
        }
        logger.info('Request finished.');
    });
    await syntropylog_1.syntropyLog.shutdown();
}
main();

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NatsAdapter = void 0;
const nats_1 = require("nats");
const CORRELATION_ID_KEY = 'x-correlation-id';
class NatsAdapter {
    nc = null;
    sc = (0, nats_1.StringCodec)();
    natsServers;
    subscriptions = [];
    constructor(servers = 'nats://nats:4222') {
        this.natsServers = Array.isArray(servers) ? servers : [servers];
    }
    async connect() {
        if (this.nc)
            return;
        try {
            this.nc = await (0, nats_1.connect)({ servers: this.natsServers });
        }
        catch (err) {
            // Allow the manager to handle logging of this error.
            throw new Error(`Failed to connect to NATS servers: ${err}`);
        }
    }
    async disconnect() {
        if (this.nc) {
            this.subscriptions.forEach((sub) => sub.drain());
            await this.nc.drain();
            this.nc = null;
        }
    }
    async publish(topic, message) {
        if (!this.nc) {
            throw new Error('NATS client not connected. Cannot publish.');
        }
        const natsHeaders = (0, nats_1.headers)();
        if (message.headers) {
            for (const key in message.headers) {
                const value = message.headers[key];
                // The value from InstrumentedBrokerClient will be a string.
                // NATS header values must be strings.
                if (typeof value === 'string') {
                    natsHeaders.append(key, value);
                }
                else {
                    // It's a buffer, so we decode it. This might not be hit
                    // if the instrumenter always provides strings.
                    natsHeaders.append(key, this.sc.decode(value));
                }
            }
        }
        this.nc.publish(topic, message.payload, { headers: natsHeaders });
    }
    async subscribe(topic, handler) {
        if (!this.nc) {
            throw new Error('NATS client not connected. Cannot subscribe.');
        }
        const sub = this.nc.subscribe(topic);
        this.subscriptions.push(sub);
        (async () => {
            for await (const m of sub) {
                const brokerMessage = {
                    payload: Buffer.from(m.data),
                    headers: this.natsHeadersToRecord(m.headers),
                };
                const controls = {
                    ack: async () => { },
                    nack: async () => { },
                };
                // The BrokerManager will wrap this handler call in a context.
                await handler(brokerMessage, controls);
            }
        })().catch((err) => {
            // Let the BrokerManager's logger handle this.
            console.error(`Error in NATS subscription for topic "${topic}":`, err);
        });
    }
    natsHeadersToRecord(natsHeaders) {
        const record = {};
        if (!natsHeaders)
            return record;
        for (const [key, values] of natsHeaders) {
            if (values.length > 0) {
                record[key] = values[0];
            }
        }
        return record;
    }
}
exports.NatsAdapter = NatsAdapter;
//# sourceMappingURL=NatsAdapter.js.map
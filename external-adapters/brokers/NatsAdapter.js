"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NatsAdapter = void 0;
const nats_1 = require("nats");
class NatsAdapter {
    natsServers;
    natsConnection;
    codec = (0, nats_1.JSONCodec)();
    subscriptions = [];
    constructor(natsServers = ['nats://localhost:4222']) {
        this.natsServers = natsServers;
    }
    async connect() {
        if (this.natsConnection)
            return;
        this.natsConnection = await (0, nats_1.connect)({ servers: this.natsServers });
    }
    async disconnect() {
        if (this.natsConnection) {
            await Promise.all(this.subscriptions.map((sub) => sub.drain()));
            await this.natsConnection.drain();
        }
    }
    async publish(topic, message, options) {
        if (!this.natsConnection) {
            throw new Error('NATS client not connected.');
        }
        const natsHeaders = (0, nats_1.headers)();
        if (message.headers) {
            for (const [key, value] of Object.entries(message.headers)) {
                natsHeaders.append(key, value.toString());
            }
        }
        this.natsConnection.publish(topic, this.codec.encode(message.payload), {
            headers: natsHeaders,
        });
    }
    async subscribe(topic, handler) {
        if (!this.natsConnection) {
            throw new Error('NATS client not connected.');
        }
        const sub = this.natsConnection.subscribe(topic);
        this.subscriptions.push(sub);
        const subscription = {
            unsubscribe: async () => {
                sub.unsubscribe();
            },
        };
        (async () => {
            for await (const m of sub) {
                const msg = {
                    payload: this.codec.decode(m.data),
                    headers: this.natsHeadersToRecord(m.headers),
                };
                await handler(null, msg, {
                    ack: async () => {
                        /* NOP for core NATS */
                    },
                    nack: async () => {
                        /* NOP for core NATS */
                    },
                });
            }
        })();
        return subscription;
    }
    natsHeadersToRecord(natsHeaders) {
        const record = {};
        if (natsHeaders) {
            for (const [key, values] of natsHeaders.entries()) {
                if (values.length > 0) {
                    record[key] = values[0];
                }
            }
        }
        return record;
    }
}
exports.NatsAdapter = NatsAdapter;
//# sourceMappingURL=NatsAdapter.js.map
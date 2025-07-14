import { IBrokerAdapter, BrokerMessage, MessageHandler } from '../../src/brokers/adapter.types';
export declare class NatsAdapter implements IBrokerAdapter {
    private nc;
    private readonly sc;
    private readonly natsServers;
    private subscriptions;
    constructor(servers?: string | string[]);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    publish(topic: string, message: BrokerMessage): Promise<void>;
    subscribe(topic: string, handler: MessageHandler): Promise<void>;
    private natsHeadersToRecord;
}

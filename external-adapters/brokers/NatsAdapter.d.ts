import { IBrokerAdapter, Subscription, PublishOptions, Message, MessageHandler } from 'syntropylog';
export declare class NatsAdapter implements IBrokerAdapter {
    private readonly natsServers;
    private natsConnection;
    private codec;
    private subscriptions;
    constructor(natsServers?: string[]);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    publish(topic: string, message: Message, options?: PublishOptions): Promise<void>;
    subscribe(topic: string, handler: MessageHandler): Promise<Subscription>;
    private natsHeadersToRecord;
}

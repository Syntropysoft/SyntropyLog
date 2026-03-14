import { Transport } from '../src/logger/transports/Transport';
import { LogEntry } from '../src/types';

export class NullTransport extends Transport {
    constructor() {
        super({ name: 'null' });
    }
    async log(_entry: LogEntry): Promise<void> {
        void _entry;
        // Zero work
    }
}

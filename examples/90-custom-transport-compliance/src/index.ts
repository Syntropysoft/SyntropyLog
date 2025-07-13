import { syntropyLog, Transport, LogEntry } from 'syntropylog';
import dgram from 'dgram';

const FLUENT_BIT_PORT = 5170;
const FLUENT_BIT_HOST = '127.0.0.1';

// --- STEP 1: Implement the custom transport ---

/**
 * A custom transport that sends log entries as JSON over UDP.
 */
class UdpJsonTransport extends Transport {
  private client: dgram.Socket;

  constructor() {
    super();
    // Create a UDP client socket.
    this.client = dgram.createSocket('udp4');

    // It's good practice to handle errors on the socket.
    this.client.on('error', (err) => {
      console.error('UdpJsonTransport Error:', err);
      this.client.close();
    });
  }

  /**
   * This is the core method every transport must implement.
   * It receives a log entry, converts it to a Buffer, and sends it.
   * @param entry The log entry object from SyntropyLog.
   */
  async log(entry: LogEntry): Promise<void> {
    try {
      const logString = JSON.stringify(entry);
      const message = Buffer.from(logString);
      
      this.client.send(message, FLUENT_BIT_PORT, FLUENT_BIT_HOST, (err) => {
        if (err) {
          console.error('Failed to send log via UDP:', err);
        }
      });
    } catch (error) {
      console.error('Failed to serialize log entry for UDP transport:', error);
    }
  }

  /**
   * It's a good practice to implement a shutdown method to clean up resources.
   * SyntropyLog will call this automatically when `syntropyLog.shutdown()` is invoked.
   */
  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      // Check if the client exists and hasn't been closed already
      if (this.client && this.client.remoteAddress()) {
        this.client.close(() => {
          console.log('UDP transport client closed.');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// --- STEP 2: Use the custom transport ---

async function main() {
  // Initialize SyntropyLog, but instead of a built-in transport,
  // we pass an *instance* of our custom transport.
  syntropyLog.init({
    logger: {
      serviceName: 'compliance-app',
      level: 'info',
      transports: [new UdpJsonTransport()], // Use our new transport!
      serializerTimeoutMs: 100,
    },
  });

  const logger = syntropyLog.getLogger('main');
  
  logger.info('Logger initialized with custom UDP transport.');
  logger.info('Shipping this log to Fluent Bit!');
  logger.warn('Another one...', { payload: { userId: 123 } });

  // Give the UDP client a moment to send the messages before shutting down.
  await new Promise(resolve => setTimeout(resolve, 100));

  await syntropyLog.shutdown();
}

main().catch(console.error); 
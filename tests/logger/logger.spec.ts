import { describe, it, expect, beforeEach, vi } from 'vitest';
import { beaconLog } from '../../src/index';
import { SpyTransport } from '../../src/logger/transports/SpyTransport';
import { LoggerFactory } from '../../src/logger/LoggerFactory';
import { ConsoleTransport } from '../../src/logger/transports/ConsoleTransport';
import { ContextManager } from '../../src/context/ContextManager';

describe('Logger Architecture', () => {
  // Antes de cada prueba, reiniciamos la instancia de beaconLog para asegurar el aislamiento.
  beforeEach(() => {
    // Esto es un truco para "resetear" el singleton para las pruebas.
    // En una aplicación real, init() se llama una sola vez.
    (beaconLog as any)._isInitialized = false;
    // Limpiamos el caché de loggers para garantizar que cada prueba obtenga una instancia nueva.
    LoggerFactory.reset();
  });

  describe('Test Harness ("Magic Path")', () => {
    it('should capture logs using the spyTransport from setupTestHarness', () => {
      // 1. Configurar el arnés de prueba.
      const { spyTransport } = beaconLog.setupTestHarness();

      // 2. Obtener un logger y usarlo.
      const logger = beaconLog.getLogger('TestService');
      logger.info('Hello from the test harness');

      // 3. Verificar que el log fue capturado.
      // We use findEntries to be specific and ignore the "harness active" log.
      const entries = spyTransport.findEntries({ msg: 'Hello from the test harness' });
      expect(entries).toHaveLength(1);
      expect(entries[0].msg).toBe('Hello from the test harness');
      expect(entries[0].level).toBe('info');
      expect(entries[0].service).toBe('TestService');
    });

    it('should capture logs from a child logger with correct bindings', () => {
      const { spyTransport } = beaconLog.setupTestHarness();

      const parentLogger = beaconLog.getLogger('ParentService');
      const childLogger = parentLogger.child({ requestId: 'req-123' });

      childLogger.warn('This is a child log');

      // Verificar que el log del hijo fue capturado y tiene los bindings correctos.
      const entries = spyTransport.findEntries({
        msg: 'This is a child log',
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('warn');
      expect(entries[0].service).toBe('ParentService'); // El nombre del servicio se hereda
      expect(entries[0].requestId).toBe('req-123'); // El binding del hijo está presente
    });
  });

  describe('Advanced Configuration ("Autopista")', () => {
    it('should use the transports provided in the init configuration', () => {
      // 1. Crear nuestro propio transport para la prueba.
      const customSpy = new SpyTransport();

      // 2. Inicializar beaconLog con la configuración avanzada.
      beaconLog.init({
        logger: {
          // En lugar de `level`, proveemos `transports`.
          transports: [customSpy],
        },
      });

      // 3. Obtener un logger y usarlo.
      const logger = beaconLog.getLogger('AdvancedService');
      logger.error('This should go to the custom spy', { code: 500 });

      // 4. Verificar que nuestro transport personalizado recibió el log específico que esperamos,
      // ignorando cualquier otro log (como el de inicialización).
      const foundEntries = customSpy.findEntries({
        level: 'error',
        service: 'AdvancedService',
      });

      expect(foundEntries).toHaveLength(1);
      const entry = foundEntries[0];
      expect(entry.msg).toBe('This should go to the custom spy');
      expect(entry.code).toBe(500);
    });

    it('should respect logger and transport log levels and allow dynamic updates', () => {
      // 1. Setup with a specific level on the transport
      const customSpy = new SpyTransport({ level: 'warn' }); // This transport only logs 'warn' and above.
      beaconLog.init({
        logger: {
          level: 'debug', // The logger itself allows 'debug' and above.
          transports: [customSpy],
        },
      });

      const logger = beaconLog.getLogger('LevelTest');

      // 2. Log at different levels
      logger.debug('This should be ignored by the transport.');
      logger.info('This should also be ignored by the transport.');
      logger.warn('This should be captured.');
      logger.fatal('This should also be captured.');

      // 3. Verify only warn and fatal were captured
      expect(customSpy.findEntries({ level: 'warn' })).toHaveLength(1);
      expect(customSpy.findEntries({ level: 'fatal' })).toHaveLength(1);
      expect(customSpy.getEntries()).toHaveLength(2);

      // 4. Dynamically update the log level for all loggers
      LoggerFactory.updateLogLevels('error');
      logger.warn('This should now be ignored by the logger itself.');

      // 5. Verify the warn log was not captured after the level update
      expect(customSpy.getEntries()).toHaveLength(2); // No new entries
    });
  });
});

describe('Coverage Enhancements', () => {
  describe('ConsoleTransport', () => {
    // Mock console methods
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    beforeEach(() => {
      // Clear mocks history before each test
      logSpy.mockClear();
      warnSpy.mockClear();
      errorSpy.mockClear();
    });

    it('should call console.log for info, debug, and trace levels', async () => {
      const transport = new ConsoleTransport();
      await transport.log({ level: 'info', msg: 'info message' });
      await transport.log({ level: 'debug', msg: 'debug message' });
      await transport.log({ level: 'trace', msg: 'trace message' });

      expect(logSpy).toHaveBeenCalledTimes(3);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should call console.warn for warn level', async () => {
      const transport = new ConsoleTransport();
      await transport.log({ level: 'warn', msg: 'warn message' });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should call console.error for error and fatal levels', async () => {
      const transport = new ConsoleTransport();
      await transport.log({ level: 'error', msg: 'error message' });
      await transport.log({ level: 'fatal', msg: 'fatal message' });

      expect(errorSpy).toHaveBeenCalledTimes(2);
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('SpyTransport', () => {
    it('should clear captured entries correctly', async () => {
      const spy = new SpyTransport();
      await spy.log({ level: 'info', msg: 'message 1' });
      expect(spy.getEntries()).toHaveLength(1);

      spy.clear();
      expect(spy.getEntries()).toHaveLength(0);
    });
  });

  describe('LoggerFactory', () => {
    it('should return the singleton context manager', () => {
      const cm1 = LoggerFactory.getContextManager();
      const cm2 = LoggerFactory.getContextManager();
      expect(cm1).toBeInstanceOf(ContextManager);
      expect(cm1).toBe(cm2); // Check for singleton instance
    });
  });

  describe('Transport base class', () => {
    it('should have a default flush method that resolves', async () => {
      const transport = new SpyTransport(); // SpyTransport extends Transport
      await expect(transport.flush()).resolves.toBeUndefined();
    });
  });
});
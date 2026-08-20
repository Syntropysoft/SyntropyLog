/// <reference types="vitest/globals" />
/**
 * FILE: tests/logger/exempt-transports.test.ts
 * DESCRIPTION: `masking.exemptTransports` — the unmasked entry reaches ONLY the transports the
 * application declared exempt, and an unknown name fails loud at init.
 *
 * The invariant under test is a security one: masking is the default and the exemption is the
 * exception. Every test that asserts the exempt transport got the truth is paired with one
 * asserting the others did not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Logger,
  LoggerDependencies,
  UnknownExemptTransportError,
} from '../../src/logger/Logger';
import { resolveExemptTransports } from '../../src/logger/LoggerFactory';
import { Transport } from '../../src/logger/transports/Transport';
import { LogLevel } from '../../src/logger/levels';
import { IContextManager } from '../../src/context';
import { SyntropyLog } from '../../src/SyntropyLog';

const RAW = { level: 'info', message: 'ok', cuit: '20-12345678-9' };
const MASKED = { level: 'info', message: 'ok', cuit: '2*********9' };

function makeTransport(name: string, wantsObject = false): Transport {
  return {
    name,
    level: 'info' as LogLevel,
    log: vi.fn(),
    isLevelEnabled: vi.fn().mockReturnValue(true),
    flush: vi.fn().mockResolvedValue(undefined),
    get wantsObject() {
      return wantsObject;
    },
  } as unknown as Transport;
}

function makeDeps(
  overrides: Partial<LoggerDependencies> = {}
): LoggerDependencies {
  return {
    maskingEngine: { process: vi.fn().mockReturnValue(MASKED) } as any,
    serializationManager: {
      serializeDirect: vi.fn().mockReturnValue({ data: RAW, success: true }),
    } as any,
    contextManager: {
      getFilteredContext: vi.fn().mockReturnValue({}),
    } as unknown as IContextManager,
    syntropyLogInstance: {} as SyntropyLog,
    ...overrides,
  };
}

describe('masking.exemptTransports — JS pipeline', () => {
  let audit: Transport;
  let console_: Transport;

  beforeEach(() => {
    audit = makeTransport('audit-db');
    console_ = makeTransport('console');
  });

  it('el exento recibe la verdad y el resto recibe la versión enmascarada', () => {
    const deps = makeDeps({ exemptTransports: new Set(['audit-db']) });
    new Logger('t', [audit, console_], deps).info('ok');

    expect(audit.log).toHaveBeenCalledWith(RAW);
    expect(console_.log).toHaveBeenCalledWith(MASKED);
  });

  it('sin exentos declarados, TODOS reciben enmascarado (default intacto)', () => {
    const deps = makeDeps();
    new Logger('t', [audit, console_], deps).info('ok');

    expect(audit.log).toHaveBeenCalledWith(MASKED);
    expect(console_.log).toHaveBeenCalledWith(MASKED);
  });

  it('un set vacío no exime a nadie', () => {
    const deps = makeDeps({ exemptTransports: new Set<string>() });
    new Logger('t', [audit, console_], deps).info('ok');

    expect(audit.log).toHaveBeenCalledWith(MASKED);
  });

  it('el nombre exento que no está entre los transportes efectivos no filtra nada', () => {
    const deps = makeDeps({ exemptTransports: new Set(['otro']) });
    new Logger('t', [audit, console_], deps).info('ok');

    expect(audit.log).toHaveBeenCalledWith(MASKED);
    expect(console_.log).toHaveBeenCalledWith(MASKED);
  });
});

describe('masking.exemptTransports — camino nativo', () => {
  const MASKED_LINE = '{"cuit":"2*********9"}';
  const RAW_LINE = '{"cuit":"20-12345678-9"}';

  it('pide la salida doble solo cuando hay un transporte exento', () => {
    const audit = makeTransport('audit-db');
    const serializeDirect = vi.fn().mockReturnValue({
      serializedNative: MASKED_LINE,
      data: null,
      success: true,
    });

    const deps = makeDeps({
      exemptTransports: new Set(['audit-db']),
      serializationManager: { serializeDirect } as any,
    });
    new Logger('t', [audit], deps).info('ok');
    expect(serializeDirect.mock.calls.at(-1)![5]).toBe(true);

    const soloConsola = makeDeps({
      serializationManager: { serializeDirect } as any,
    });
    new Logger('t', [makeTransport('console')], soloConsola).info('ok');
    expect(serializeDirect.mock.calls.at(-1)![5]).toBe(false);
  });

  it('reparte la línea cruda al exento y la enmascarada al resto', () => {
    const audit = makeTransport('audit-db');
    const console_ = makeTransport('console');
    const deps = makeDeps({
      exemptTransports: new Set(['audit-db']),
      serializationManager: {
        serializeDirect: vi.fn().mockReturnValue({
          serializedNative: MASKED_LINE,
          serializedNativeRaw: RAW_LINE,
          data: null,
          success: true,
        }),
      } as any,
    });

    new Logger('t', [audit, console_], deps).info('ok');

    expect(audit.log).toHaveBeenCalledWith(RAW_LINE);
    expect(console_.log).toHaveBeenCalledWith(MASKED_LINE);
  });

  it('sin línea cruda disponible el exento recibe la enmascarada: se sobre-enmascara, nunca se filtra', () => {
    const audit = makeTransport('audit-db');
    const deps = makeDeps({
      exemptTransports: new Set(['audit-db']),
      serializationManager: {
        serializeDirect: vi.fn().mockReturnValue({
          serializedNative: MASKED_LINE,
          data: null,
          success: true,
        }),
      } as any,
    });

    new Logger('t', [audit], deps).info('ok');
    expect(audit.log).toHaveBeenCalledWith(MASKED_LINE);
  });

  it('un transporte que pide objeto recibe la cruda parseada, no la enmascarada', () => {
    const audit = makeTransport('audit-db', true);
    const console_ = makeTransport('console', true);
    const deps = makeDeps({
      exemptTransports: new Set(['audit-db']),
      serializationManager: {
        serializeDirect: vi.fn().mockReturnValue({
          serializedNative: MASKED_LINE,
          serializedNativeRaw: RAW_LINE,
          data: null,
          success: true,
        }),
      } as any,
    });

    new Logger('t', [audit, console_], deps).info('ok');

    expect(audit.log).toHaveBeenCalledWith(JSON.parse(RAW_LINE));
    expect(console_.log).toHaveBeenCalledWith(JSON.parse(MASKED_LINE));
  });
});

describe('resolveExemptTransports — fail loud', () => {
  const pool = () =>
    new Map<string, Transport>([
      ['audit-db', makeTransport('audit-db')],
      ['console', makeTransport('console')],
    ]);

  it('un nombre desconocido tira, listando los configurados', () => {
    expect(() => resolveExemptTransports(['audit-dbb'], pool())).toThrow(
      UnknownExemptTransportError
    );
    try {
      resolveExemptTransports(['audit-dbb'], pool());
    } catch (err) {
      expect((err as Error).message).toContain('audit-dbb');
      expect((err as Error).message).toContain('audit-db');
    }
  });

  it('nombres válidos devuelven el set', () => {
    expect(resolveExemptTransports(['audit-db'], pool())).toEqual(
      new Set(['audit-db'])
    );
  });

  it('ausente o vacío → undefined (sin exenciones)', () => {
    expect(resolveExemptTransports(undefined, pool())).toBeUndefined();
    expect(resolveExemptTransports([], pool())).toBeUndefined();
  });
});

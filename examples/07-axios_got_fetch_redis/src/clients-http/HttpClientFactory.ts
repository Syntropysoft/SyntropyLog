// En el archivo del ejemplo: src/HttpClientFactory.ts

import { beaconLog } from '../../../../src';
import { IHttpClient } from './IHttpClient';

// Importa los adaptadores que creaste
import { AxiosClient } from './AxiosClient';
import { GotClient } from './GotClient';
import { FetchClient } from './FetchClient';

// Importa los tipos nativos para los type guards
import { AxiosInstance } from 'axios';
import { Got } from 'got';
import { InstrumentedFetch } from '../../../../src/http/types';

// --- Type Guards para la "Detección Mágica" ---
function isAxios(client: any): client is AxiosInstance {
  // axios tiene una propiedad 'interceptors' que los otros no tienen.
  return typeof client.interceptors !== 'undefined';
}

function isGot(client: any): client is Got {
  // got tiene un método 'extend' que los otros no tienen.
  return typeof client.extend === 'function';
}

function isFetch(client: any): client is InstrumentedFetch {
  // fetch es simplemente una función.
  return typeof client === 'function';
}

// --- La Fábrica ---
export class HttpClientFactory {
  /**
   * Recibe el nombre de una instancia de beaconlog, obtiene el cliente nativo,
   * detecta de qué tipo es y devuelve el adaptador correcto.
   */
  static createAdaptedClient(instanceName: string): IHttpClient {
    const nativeClient = beaconLog.getHttpClient(instanceName);

    if (isAxios(nativeClient)) {
      return new AxiosClient(nativeClient);
    }
    if (isGot(nativeClient)) {
      return new GotClient(nativeClient);
    }
    if (isFetch(nativeClient)) {
      return new FetchClient(nativeClient);
    }

    throw new Error(
      `No adapter found for HTTP client instance: ${instanceName}`
    );
  }
}

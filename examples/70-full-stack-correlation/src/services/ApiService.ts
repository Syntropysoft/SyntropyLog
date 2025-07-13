/**
 * @file CachedApiService.ts
 * @description Una clase genérica que extiende ApiService para añadir una capa de caché
 * con Redis, implementando el patrón "Cache-Aside". El caché es opcional.
 */

// Asumimos que estos tipos son exportados desde tu librería 'syntropylog'
import { syntropyLog, IBeaconRedis } from 'syntropylog';
import {
  InstrumentedHttpClient,
  AdapterHttpRequest,
  AdapterHttpResponse,
} from 'syntropylog/http';

/**
 * @interface RequestOptions
 * @description Opciones para las peticiones, incluyendo configuración de caché.
 */
export interface RequestOptions {
  headers?: Record<string, string>;
  queryParams?: Record<string, any>;
  // Opciones específicas para el caché en esta petición
  caching?: {
    /** Deshabilita la lectura y escritura de caché para esta petición específica. */
    disabled?: boolean;
    /** TTL (Time-To-Live) en segundos para esta entrada de caché. Sobrescribe el default. */
    ttlSeconds?: number;
  };
}

/**
 * @interface ApiServiceOptions
 * @description Opciones para configurar el ApiService con caché.
 */
export interface ApiServiceOptions {
  /** El nombre de la instancia de Redis a usar para el caché. Si no se provee, el caché se deshabilita. */
  redisInstanceName?: string;
  /** Un prefijo para todas las claves de caché para evitar colisiones. */
  cacheKeyPrefix?: string;
  /** El tiempo de vida (TTL) por defecto en segundos para las entradas de caché. */
  defaultCacheTTLSeconds?: number;
}

/**
 * @class CachedApiService
 * @description Proporciona una API de cliente REST simple y fuertemente tipada,
 * con una capa de caché Redis integrada y opcional.
 */
export class CachedApiService {
  private httpClient: InstrumentedHttpClient;
  // El cliente de Redis ahora es opcional.
  private redisClient: IBeaconRedis | null = null;
  private options: {
    cacheKeyPrefix: string;
    defaultCacheTTLSeconds: number;
  };
  private logger = syntropyLog.getLogger('ApiService');

  /**
   * @constructor
   * @param {string} httpInstanceName - El nombre de la instancia HTTP configurada.
   * @param {ApiServiceOptions} [options] - Las opciones de configuración para el caché (opcionales).
   */
  constructor(httpInstanceName: string, options: ApiServiceOptions = {}) {
    this.httpClient = syntropyLog.getHttp(httpInstanceName);
    if (!this.httpClient) {
      throw new Error(`Instancia HTTP no encontrada: "${httpInstanceName}"`);
    }

    // Intenta obtener el cliente de Redis solo si se especifica un nombre de instancia.
    if (options.redisInstanceName) {
      try {
        this.redisClient = syntropyLog.getRedis(options.redisInstanceName);
        this.logger.info(
          `Servicio API usando caché con instancia Redis: "${options.redisInstanceName}"`
        );
      } catch (error) {
        // Si getRedis lanza un error (ej. la instancia no existe), lo loggeamos pero no rompemos la aplicación.
        this.logger.warn(
          `No se pudo inicializar el caché Redis para la instancia "${options.redisInstanceName}". El servicio operará sin caché.`,
          { error }
        );
        this.redisClient = null;
      }
    } else {
      this.logger.info(
        'No se proveyó instancia de Redis. El servicio operará sin caché.'
      );
    }

    this.options = {
      cacheKeyPrefix: options.cacheKeyPrefix ?? 'api-cache',
      defaultCacheTTLSeconds: options.defaultCacheTTLSeconds ?? 3600, // 1 hora por defecto
    };
  }

  /**
   * Genera una clave de caché única para una petición.
   * @private
   */
  private generateCacheKey(
    url: string,
    queryParams?: Record<string, any>
  ): string {
    const sortedParams = queryParams
      ? `?${new URLSearchParams(queryParams).toString()}`
      : '';
    return `${this.options.cacheKeyPrefix}:${url}${sortedParams}`;
  }

  /**
   * Realiza una petición GET, con lógica de caché opcional.
   */
  public async get<T>(url: string, options: RequestOptions = {}): Promise<T> {
    // El caché se usa solo si el cliente de Redis existe y no está deshabilitado en las opciones.
    const useCache = !!this.redisClient && !options.caching?.disabled;
    const cacheKey = this.generateCacheKey(url, options.queryParams);

    if (useCache) {
      try {
        const cachedData = await this.redisClient!.get(cacheKey);
        if (cachedData) {
          return JSON.parse(cachedData) as T;
        }
      } catch (error) {
        this.logger.error('Error al leer desde Redis. Se procederá a la API.', {
          key: cacheKey,
          error,
        });
      }
    }

    const request: AdapterHttpRequest = {
      method: 'GET',
      url,
      headers: options.headers ?? {},
      queryParams: options.queryParams,
    };
    const response = await this.httpClient.request<T>(request);
    const apiData = response.data;

    if (useCache) {
      try {
        const ttl =
          options.caching?.ttlSeconds ?? this.options.defaultCacheTTLSeconds;
        await this.redisClient!.set(cacheKey, JSON.stringify(apiData), ttl);
      } catch (error) {
        this.logger.error('Error al escribir en Redis.', {
          key: cacheKey,
          error,
        });
      }
    }

    return apiData;
  }

  /**
   * Realiza una petición POST e invalida la caché si está habilitada.
   */
  public async post<T>(
    url: string,
    body: any,
    options: RequestOptions = {}
  ): Promise<T> {
    const request: AdapterHttpRequest = {
      method: 'POST',
      url,
      body,
      headers: options.headers ?? {},
    };
    const response = await this.httpClient.request<T>(request);

    if (this.redisClient) {
      const keyToInvalidate = this.generateCacheKey(url);
      try {
        await this.redisClient.del(keyToInvalidate);
      } catch (error) {
        this.logger.error('Error al invalidar caché en POST.', {
          key: keyToInvalidate,
          error,
        });
      }
    }

    return response.data;
  }

  /**
   * Realiza una petición PUT e invalida la caché si está habilitada.
   */
  public async put<T>(
    url: string,
    body: any,
    options: RequestOptions = {}
  ): Promise<T> {
    const request: AdapterHttpRequest = {
      method: 'PUT',
      url,
      body,
      headers: options.headers ?? {},
    };
    const response = await this.httpClient.request<T>(request);

    if (this.redisClient) {
      const cacheKey = this.generateCacheKey(url, options.queryParams);
      try {
        await this.redisClient.del(cacheKey);
      } catch (error) {
        this.logger.error('Error al invalidar caché en PUT.', {
          key: cacheKey,
          error,
        });
      }
    }

    return response.data;
  }

  /**
   * Realiza una petición DELETE e invalida la caché si está habilitada.
   */
  public async delete<T>(
    url: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const request: AdapterHttpRequest = {
      method: 'DELETE',
      url,
      headers: options.headers ?? {},
    };
    const response = await this.httpClient.request<T>(request);

    if (this.redisClient) {
      const cacheKey = this.generateCacheKey(url, options.queryParams);
      try {
        await this.redisClient.del(cacheKey);
      } catch (error) {
        this.logger.error('Error al invalidar caché en DELETE.', {
          key: cacheKey,
          error,
        });
      }
    }

    return response.data;
  }
}

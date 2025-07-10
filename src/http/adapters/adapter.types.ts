/**
 * FILE: src/http/adapter.types.ts (NUEVO)
 * * DESCRIPTION:
 * Define el "Contrato Universal" para cualquier cliente HTTP que quiera ser
 * instrumentado por SyntropyLog. Estas interfaces genéricas son la clave
 * para desacoplar el framework de implementaciones específicas como axios o got.
 */

/**
 * Representa una petición HTTP genérica, normalizada para que el framework
 * la entienda. El adaptador será responsable de convertir esto al formato
 * específico de la librería subyacente.
 */
export interface AdapterHttpRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers: Record<string, string | number | string[]>;
  body?: unknown;
  queryParams?: Record<string, any>;
}

/**
 * Representa una respuesta HTTP genérica y normalizada. El adaptador
 * convertirá la respuesta específica de la librería a este formato.
 * @template T El tipo de dato esperado en el cuerpo de la respuesta.
 */
export interface AdapterHttpResponse<T = any> {
  statusCode: number;
  data: T;
  headers: Record<string, string | number | string[]>;
}

/**
 * Representa un error HTTP genérico y normalizado. El adaptador
 * convertirá el error específico de la librería a este formato.
 */
export interface AdapterHttpError extends Error {
  request: AdapterHttpRequest;
  response?: AdapterHttpResponse;
  isAdapterError: true;
}

/**
 * La interfaz que todo Adaptador de Cliente HTTP debe implementar.
 * Este es el "enchufe" donde los usuarios conectarán sus clientes.
 */
export interface IHttpClientAdapter {
  /**
   * El único método que el instrumentador de SyntropyLog necesita.
   * Ejecuta una petición HTTP y devuelve una respuesta normalizada,
   * o lanza un error normalizado.
   * @param request La petición HTTP genérica a ejecutar.
   */
  request<T>(request: AdapterHttpRequest): Promise<AdapterHttpResponse<T>>;
}

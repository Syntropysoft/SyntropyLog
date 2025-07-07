/**
 * FILE: src/instrumentations/axios/instrumentAxios.ts
 * DESCRIPTION: Applies BeaconLog interceptors to an Axios instance.
 */
import { AxiosInstance } from 'axios';
import { ILogger } from '../../logger';
import { IContextManager } from '../../context';
import { BeaconHttpConfig } from '../../config';
import { BeaconAxiosInterceptors } from './interceptors';

/**
 * Instruments an Axios instance by attaching request and response interceptors.
 *
 * @param axiosInstance - The Axios instance to instrument.
 * @param logger - The logger instance for instrumentation.
 * @param contextManager - The context manager for trace propagation.
 * @param globalHttpConfig - The global HTTP configuration.
 */
export function instrumentAxios(
  axiosInstance: AxiosInstance,
  logger: ILogger,
  contextManager: IContextManager,
  globalHttpConfig: BeaconHttpConfig
): void {
  const interceptors = new BeaconAxiosInterceptors(
    logger,
    contextManager,
    globalHttpConfig as Required<BeaconHttpConfig>
  );

  axiosInstance.interceptors.request.use(
    (config) => interceptors.handleRequest(config),
    (error) => interceptors.handleRequestError(error)
  );

  axiosInstance.interceptors.response.use(
    (response) => interceptors.handleResponse(response),
    (error) => interceptors.handleResponseError(error)
  );
}
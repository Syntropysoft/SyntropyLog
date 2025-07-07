// ARCHIVO: src/container.ts

import { HttpClientFactory } from '../clients-http/HttpClientFactory';
import { IUserService } from '../services/IUserService';
import { UserService } from '../services/UserService';

// This is a simple cache to ensure that each service is a singleton.
const serviceCache = new Map<string, IUserService>();

/**
 * A factory function that creates (or retrieves from cache) a UserService instance.
 * This lazy-loads the service, ensuring that `beaconLog.getHttpClient` is only
 * called *after* `beaconLog.init()` has been executed.
 * @param clientName The name of the HTTP client instance to use.
 * @returns An instance of IUserService.
 */
function createUserService(clientName: string): IUserService {
  if (!serviceCache.has(clientName)) {
    const adaptedClient = HttpClientFactory.createAdaptedClient(clientName);
    const service = new UserService(adaptedClient);
    serviceCache.set(clientName, service);
  }
  return serviceCache.get(clientName)!;
}

// We export functions that act as service locators/factories.
export const getUserServiceAxios = () => createUserService('axios-client');
export const getUserServiceGot = () => createUserService('got-client');
export const getUserServiceFetch = () => createUserService('fetch-client');
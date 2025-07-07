import { IHttpClient } from '../clients-http/IHttpClient';
import { IUserService, User } from './IUserService';

/**
 * Implements the IUserService interface.
 * This class depends on an IHttpClient to perform the actual HTTP requests.
 * This decouples the business logic (fetching a user) from the specific
 * HTTP client implementation (axios, got, fetch).
 */
export class UserService implements IUserService {
  private httpClient: IHttpClient;

  constructor(httpClient: IHttpClient) {
    this.httpClient = httpClient;
  }

  /**
   * Fetches a user by making a GET request through the injected HTTP client.
   * @param id The ID of the user to fetch.
   * @returns A promise that resolves to the User object.
   */
  public async getUser(id: number): Promise<User> {
    // The HTTP client adapters are configured with a baseURL,
    // so we only need to provide the relative path.
    return this.httpClient.get<User>(`/users/${id}`);
  }
}
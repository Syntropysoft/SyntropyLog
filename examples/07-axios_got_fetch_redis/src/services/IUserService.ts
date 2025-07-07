// A simple interface for the User object from jsonplaceholder
export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  address: {
    street: string;
    suite: string;
    city: string;
    zipcode: string;
    geo: {
      lat: string;
      lng: string;
    };
  };
  phone: string;
  website: string;
  company: {
    name: string;
    catchPhrase: string;
    bs: string;
  };
}

// The contract for our user service.
export interface IUserService {
  /**
   * Fetches a user by their ID.
   * @param id The ID of the user to fetch.
   * @returns A promise that resolves to the User object.
   */
  getUser(id: number): Promise<User>;
}
declare module 'regex-test' {
  interface RegexTestOptions {
    timeout?: number;
  }

  class RegexTest {
    constructor(options?: RegexTestOptions);
    test(regex: RegExp, input: string): Promise<boolean>;
    cleanWorker?(): void;
  }

  export default RegexTest;
}

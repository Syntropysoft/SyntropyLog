declare module 'regex-test' {
  interface RegexTestOptions {
    timeout?: number;
    safeRegexOnly?: boolean;
  }

  class RegexTest {
    constructor(options?: RegexTestOptions);
    test(pattern: RegExp, value: string): Promise<boolean>;
  }

  export default RegexTest;
} 
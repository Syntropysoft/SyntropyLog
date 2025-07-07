/**
 * FILE: src/utils/dependencyCheck.ts
 * DESCRIPTION: Centralized utility to verify that optional peer dependencies are installed if configured.
 */
import { BeaconLogConfig } from '../config';

// A map of a feature/type name to its required npm package.
// This provides a single source of truth for optional dependencies.
const DEPENDENCY_MAP: Record<string, string> = {
  // Redis
  redis: 'redis',
  // HTTP Client Types
  axios: 'axios',
  got: 'got',
  // 'fetch' is native and has no dependency, so it's omitted.
};

/**
 * Verifies that all peer dependencies required by the provided configuration are installed.
 * This function should be called at the beginning of the `init` process to fail fast
 * with a clear, actionable error message if the environment is not set up correctly.
 *
 * @param config The validated BeaconLog configuration.
 * @throws {Error} if one or more required dependencies are not found.
 */
export function checkPeerDependencies(config: BeaconLogConfig): void {
  const requiredPackages = new Set<string>();

  // 1. Gather all dependencies required by the configuration.
  if (config.redis?.instances?.length) {
    requiredPackages.add(DEPENDENCY_MAP.redis);
  }

  if (config.http?.instances?.length) {
    config.http.instances.forEach((instance) => {
      const packageName = DEPENDENCY_MAP[instance.type];
      if (packageName) {
        requiredPackages.add(packageName);
      }
    });
  }

  // 2. Check if all gathered dependencies are actually installed.
  const missingDependencies = [...requiredPackages].filter((pkg) => {
    try {
      require.resolve(pkg);
      return false; // Found it, not missing.
    } catch (e) {
      return true; // Didn't find it, it's missing.
    }
  });

  // 3. If any are missing, throw a single, comprehensive, and user-friendly error.
  if (missingDependencies.length > 0) {
    const plural = missingDependencies.length > 1;
    const rawMessage = `####################################################################################
        BeaconLog Initialization Error: Configuration found for ${missingDependencies.join(', ')}, but the required package${plural ? 's are' : ' is'} not installed.\n` +
          `Please run 'npm install ${missingDependencies.join(' ')}' to add ${plural ? 'them' : 'it'} to your project.
        ####################################################################################  
        `;

    // Using raw ANSI escape codes to avoid a dependency on 'chalk', which can
    // slow down initialization. This provides the same visual feedback without
    // the overhead.
    // \x1b[41m -> Red Background
    // \x1b[97m -> Bright White Text
    // \x1b[0m  -> Reset
    const message = `\x1b[41m\x1b[97m${rawMessage}\x1b[0m`;

    throw new Error(message);
  }
}

/**
 * @file src/logger/defineRetentionPolicies.ts
 * @description Type-safe builder for the retention-policy registry passed into
 * `init({ retentionPolicies })`. Preserves literal types so consumers can derive
 * a string union of registered policy names for use with `logger.withRetention(name)`.
 *
 * The runtime payload is identical to a plain object literal — the function
 * exists to anchor the generic and to make intent explicit at the call site.
 */

/**
 * Declare a registry of named retention policies. The return value's keys are
 * preserved as literal types, so callers can derive a `PolicyName` union:
 *
 * ```ts
 * import { defineRetentionPolicies, syntropyLog } from 'syntropylog';
 *
 * const retentionPolicies = defineRetentionPolicies({
 *   SOX_AUDIT_TRAIL: { years: 5 },
 *   GDPR_ARTICLE_17: { years: 7, subjectIdField: 'userId' },
 *   PCI_DSS_REQ_10:  { years: 1, immediate: true },
 * });
 *
 * type PolicyName = keyof typeof retentionPolicies;
 *
 * await syntropyLog.init({
 *   logger: { ... },
 *   retentionPolicies,
 * });
 *
 * // At the call site, get autocomplete + typo safety:
 * const auditLog = syntropyLog.getLogger()
 *   .withRetention('SOX_AUDIT_TRAIL' satisfies PolicyName);
 *
 * // Unknown name → RetentionPolicyNotFoundError at runtime, with a listing
 * // of what is registered.
 * ```
 *
 * The full surface (object literal, no helper) also works:
 *
 * ```ts
 * await syntropyLog.init({
 *   retentionPolicies: {
 *     SOX_AUDIT_TRAIL: { years: 5 },
 *   },
 * });
 * ```
 *
 * The helper is recommended when you want the registry to anchor compile-time
 * autocomplete in code that calls `withRetention(name)`.
 */
export function defineRetentionPolicies<
  const T extends Readonly<Record<string, Readonly<Record<string, unknown>>>>,
>(policies: T): T {
  return policies;
}

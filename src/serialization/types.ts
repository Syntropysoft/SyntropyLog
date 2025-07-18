/**
 * @file src/serialization/types.ts
 * @description Core types and interfaces for the intelligent serialization system
 */

import {
  SerializableData,
  SerializedData,
  SerializationContextConfig,
  SerializationResult,
  SerializationMetrics,
} from '../types';

/**
 * @interface ISerializer
 * @description Base interface for all serializers in the intelligent system
 */
export interface ISerializer {
  /** Unique name identifier for the serializer */
  readonly name: string;

  /** Priority level for serializer selection (higher = more preferred) */
  readonly priority: number;

  /** Serialize data to string representation */
  serialize(
    data: SerializableData,
    context?: SerializationContextConfig
  ): Promise<SerializationResult>;

  /** Check if this serializer can handle the given data */
  canSerialize(data: SerializableData): boolean;

  /** Get the complexity level of the data for timeout calculation */
  getComplexity(data: SerializableData): SerializationComplexity;

  /** Get custom timeout for this specific data (optional) */
  getCustomTimeout?(data: SerializableData): number | null;
}

/**
 * @enum SerializationComplexity
 * @description Complexity levels that determine timeout strategy
 */
export enum SerializationComplexity {
  SIMPLE = 'simple', // Basic objects, simple queries
  COMPLEX = 'complex', // Nested objects, moderate queries
  CRITICAL = 'critical', // Deep nesting, aggregations, large datasets
}

/**
 * @interface TimeoutStrategy
 * @description Configuration for timeout management
 */
export interface TimeoutStrategy {
  /** Timeout for simple operations */
  simple: number;
  /** Timeout for complex operations */
  complex: number;
  /** Timeout for critical operations */
  critical: number;
  /** Default fallback timeout */
  fallback: number;
}

/**
 * @interface SerializerConfig
 * @description Configuration for individual serializers
 */
export interface SerializerConfig {
  /** Custom timeout for this serializer */
  timeout?: number;
  /** Additional sensitive fields to redact */
  sensitiveFields?: string[];
  /** Maximum depth for serialization */
  maxDepth?: number;
  /** Whether to enable sanitization */
  sanitize?: boolean;
  /** Custom complexity override */
  complexity?: SerializationComplexity;
}

/**
 * @interface SerializationManagerConfig
 * @description Configuration for the SerializationManager
 */
export interface SerializationManagerConfig {
  /** Timeout strategy configuration */
  timeouts?: Partial<TimeoutStrategy>;
  /** Auto-detection settings */
  autoDetect?: boolean;
  /** Default serializer configuration */
  defaultConfig?: SerializerConfig;
  /** Custom serializers to register */
  serializers?: Record<string, SerializerConfig>;
  /** Whether to enable performance monitoring */
  enableMetrics?: boolean;
}

/**
 * @type SerializerRegistry
 * @description Registry of available serializers
 */
export type SerializerRegistry = Map<string, ISerializer>;

/**
 * @type SerializationContext
 * @description Context for serialization operations
 */
export interface SerializationContext {
  /** Current depth in the object tree */
  depth: number;
  /** Maximum allowed depth */
  maxDepth: number;
  /** Sensitive fields to redact */
  sensitiveFields: string[];
  /** Whether sanitization is enabled */
  sanitize: boolean;
  /** Custom timeout for this operation */
  customTimeout?: number;
}

// Re-export types from main types file for consistency
export type {
  SerializableData,
  SerializedData,
  SerializationContextConfig,
  SerializationResult,
  SerializationMetrics,
} from '../types';

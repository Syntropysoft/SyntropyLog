/**
 * @file src/serialization/types.ts
 * @description Core types and interfaces for the intelligent serialization system
 */

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
  serialize(data: any, context?: SerializationContext): Promise<SerializationResult>;
  
  /** Check if this serializer can handle the given data */
  canSerialize(data: any): boolean;
  
  /** Get the complexity level of the data for timeout calculation */
  getComplexity(data: any): SerializationComplexity;
  
  /** Get custom timeout for this specific data (optional) */
  getCustomTimeout?(data: any): number | null;
}

/**
 * @enum SerializationComplexity
 * @description Complexity levels that determine timeout strategy
 */
export enum SerializationComplexity {
  SIMPLE = 'simple',      // Basic objects, simple queries
  COMPLEX = 'complex',    // Nested objects, moderate queries
  CRITICAL = 'critical'   // Deep nesting, aggregations, large datasets
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
 * @interface SerializationResult
 * @description Result of a serialization operation
 */
export interface SerializationResult {
  /** The serialized data */
  data: any;
  /** The serializer used */
  serializer: string;
  /** Time taken for serialization */
  duration: number;
  /** Complexity level detected */
  complexity: SerializationComplexity;
  /** Whether sanitization was applied */
  sanitized: boolean;
  /** Whether the operation was successful */
  success: boolean;
  /** Additional metadata about the operation */
  metadata: {
    /** Step durations for pipeline operations */
    stepDurations?: {
      serialization?: number;
      sanitization?: number;
    };
    /** Operation timeout used */
    operationTimeout?: number;
    /** Complexity level */
    complexity?: SerializationComplexity;
    /** Serializer name */
    serializer?: string;
    /** Timeout strategy used */
    timeoutStrategy?: string;
  };
  /** Error message if operation failed */
  error?: string;
}

/**
 * @interface SerializationMetrics
 * @description Performance metrics for serialization
 */
export interface SerializationMetrics {
  /** Total serializations performed */
  total: number;
  /** Average serialization time */
  averageTime: number;
  /** Serializations by complexity level */
  byComplexity: Record<SerializationComplexity, number>;
  /** Serializations by serializer type */
  bySerializer: Record<string, number>;
  /** Timeout occurrences */
  timeouts: number;
  /** Error occurrences */
  errors: number;
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
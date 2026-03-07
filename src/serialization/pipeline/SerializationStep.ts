import { PipelineStep } from '../SerializationPipeline';
import { SerializationPipelineContext } from '../../types';
import { ISerializer } from '../types';
import { SerializableData } from '../../types';

export class SerializationStep implements PipelineStep<SerializableData> {
  name = 'serialization';
  private serializers: ISerializer[] = [];

  constructor(serializers: ISerializer[] = []) {
    this.serializers = serializers;
  }

  addSerializer(serializer: ISerializer): void {
    // Insert in priority order (higher priority first)
    const insertIndex = this.serializers.findIndex(
      (s) => s.priority < serializer.priority
    );
    if (insertIndex === -1) {
      this.serializers.push(serializer);
    } else {
      this.serializers.splice(insertIndex, 0, serializer);
    }
  }

  async execute(
    data: SerializableData,
    context: SerializationPipelineContext
  ): Promise<SerializableData> {
    const startTime = Date.now();

    // 1. Find appropriate serializer
    const serializer = this.findSerializer(data);

    if (!serializer) {
      // If no serializer, return original data (safe by default)
      return data;
    }

    try {
      // 2. Run serialization (resilience is handled by pipeline)
      const result = await serializer.serialize(
        data,
        context.serializationContext
      );

      const duration = Date.now() - startTime;

      // 4. Return serialized data with metadata
      return {
        ...result.data,
        serializationDuration: duration,
        serializer: serializer.name,
        serializationComplexity:
          result.complexity || result.metadata?.complexity || null,
      };
    } catch (error) {
      // Ensure error carries serializer name
      if (error instanceof Error && !(error as any).serializer) {
        (error as any).serializer = serializer.name;
      }
      throw error;
    }
  }

  private findSerializer(data: SerializableData): ISerializer | null {
    // Serializers are already ordered by priority (highest first) via addSerializer,
    // so we only need to find the first one that can serialize the data
    for (const serializer of this.serializers) {
      if (serializer.canSerialize(data)) {
        return serializer;
      }
    }
    return null;
  }

  getRegisteredSerializers(): string[] {
    return this.serializers.map((s) => s.name);
  }
}

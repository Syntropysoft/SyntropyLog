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

  /**
   * Ejecuta serialización en línea (sync). Sin Promise.race ni timers:
   * los serializadores deben devolver SerializationResult de forma síncrona.
   */
  execute(
    data: SerializableData,
    context: SerializationPipelineContext
  ): SerializableData {
    const startTime = Date.now();

    const serializer = this.findSerializer(data);
    if (!serializer) return data;

    try {
      const result = serializer.serialize(data, context.serializationContext);
      const duration = Date.now() - startTime;

      const dataBase =
        typeof result.data === 'object' && result.data !== null
          ? (result.data as Record<string, unknown>)
          : {};
      (dataBase as Record<string, unknown>).serializationDuration = duration;
      (dataBase as Record<string, unknown>).serializer = serializer.name;
      (dataBase as Record<string, unknown>).serializationComplexity =
        result.complexity || result.metadata?.complexity || null;
      return dataBase as SerializableData;
    } catch (error) {
      if (
        error instanceof Error &&
        !(error as { serializer?: string }).serializer
      ) {
        (error as unknown as { serializer: string }).serializer =
          serializer.name;
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

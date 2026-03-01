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
    // Insertar en orden de prioridad (mayor prioridad primero)
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

    // 1. Encontrar serializador apropiado
    const serializer = this.findSerializer(data);

    if (!serializer) {
      // Si no hay serializador, devolvemos el dato original (Safe by default)
      return data;
    }

    try {
      // 2. Ejecutar serialización (resilience is handled by pipeline)
      const result = await serializer.serialize(
        data,
        context.serializationContext
      );

      const duration = Date.now() - startTime;

      // 4. Devolver datos serializados con metadata
      return {
        ...result.data,
        serializationDuration: duration,
        serializer: serializer.name,
        serializationComplexity:
          result.complexity || result.metadata?.complexity || null,
      };
    } catch (error) {
      // Asegurar que el error tenga el nombre del serializador
      if (error instanceof Error && !(error as any).serializer) {
        (error as any).serializer = serializer.name;
      }
      throw error;
    }
  }

  private findSerializer(data: SerializableData): ISerializer | null {
    // Los serializers ya están ordenados por prioridad (mayor primero)
    // debido al método addSerializer, así que solo necesitamos encontrar el primero
    // que pueda serializar los datos
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

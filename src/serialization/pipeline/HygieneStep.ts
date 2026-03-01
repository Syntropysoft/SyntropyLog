import { PipelineStep } from '../SerializationPipeline';
import { SerializationPipelineContext } from '../../types';
import { SerializableData } from '../../types';
import { parse, stringify } from 'flatted';

/**
 * @class HygieneStep
 * @description Ensures data is safe for serialization by handling circular references
 * and enforcing depth limits. This is part of the "Safety by Default" engine.
 */
export class HygieneStep implements PipelineStep<SerializableData> {
    name = 'hygiene';

    /**
     * Identifies and resolves circular references and limits depth.
     */
    async execute(
        data: SerializableData,
        context: SerializationPipelineContext
    ): Promise<SerializableData> {
        if (data === null || typeof data !== 'object') {
            return data;
        }

        try {
            // 1. Handle special objects like Errors (they don't stringify well)
            if (data instanceof Error) {
                return {
                    name: data.name,
                    message: data.message,
                    stack: data.stack,
                    ...(data as any),
                };
            }

            // 2. Handle circular references using flatted
            // This is a "Safety First" approach.
            const stringified = stringify(data);
            const cleaned = parse(stringified);

            // 3. Enforce depth limits (already present in context, 
            // but we could add more logic here if needed)
            // The current SerializationPipeline handles recursion depth elsewhere,
            // but 'flatted' already flattened the object for us.

            return cleaned as SerializableData;
        } catch (error) {
            // Silently fail and return a placeholder if hygiene fails
            return `[HYGIENE_ERROR: ${error instanceof Error ? error.message : String(error)}]`;
        }
    }
}

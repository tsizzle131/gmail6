import { v4 as uuidv4 } from 'uuid';
import { orchestrator } from './orchestrator';
import { StateRepository } from './stateRepository';
import { MessagesAnnotation } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { AgentState, AgentStatus } from './state';
import logger from '../logger';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';

const stateRepo = new StateRepository();

/**
 * Runs the orchestrator graph, persisting and recovering state in Supabase
 */
export async function invokeOrchestrator(
  messages: HumanMessage[],
  workflowId?: string
): Promise<AgentState> {
  let record: AgentState | null = null;
  try {
    if (!workflowId) {
      // Start new workflow
      const newWorkflowId = uuidv4();
      record = await stateRepo.create('orchestrator', newWorkflowId, { messages });
    } else {
      // Resume existing workflow
      record = await stateRepo.getByWorkflowId(workflowId);
      if (!record) {
        throw new Error(`No workflow found for ID ${workflowId}`);
      }
    }

    // Invoke graph with existing or initial state
    const inputMessages = (record.state as any).messages || messages;
    // Set up LangSmith tracing and retry on failure
    const tracer = new LangChainTracer();
    let result!: any;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await orchestrator.invoke(
          { messages: inputMessages },
          { callbacks: [tracer] }
        );
        await awaitAllCallbacks(); // ensure traces are submitted
        break;
      } catch (invokeError: any) {
        logger.error(`Orchestrator execution failed on attempt ${attempt}`, { error: invokeError.message, workflowId: record.id });
        await stateRepo.recordError(record.id, invokeError.message);
        if (attempt === maxRetries) {
          throw invokeError;
        }
        // wait before retrying
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    // Update state and status
    const status: AgentStatus = result.errors?.length ? 'failed' : 'completed';
    const updated = await stateRepo.updateState(record.id, result, status);
    return updated;
  } catch (err: any) {
    if (record) {
      await stateRepo.recordError(record.id, err.message);
    }
    throw err;
  }
}

import { supabase } from '../db/supabaseClient';
import { AgentState, AgentStatus } from './state';

/**
 * Repository for managing agent workflow states in Supabase
 */
export class StateRepository {
  /** Create a new agent state entry */
  async create(
    agentName: string,
    workflowId: string,
    initialState: any
  ): Promise<AgentState> {
    const { data, error } = await supabase
      .from('agent_states')
      .insert([
        {
          agent_name: agentName,
          workflow_id: workflowId,
          state: initialState,
          status: 'pending'
        }
      ])
      .single();

    if (error) {
      throw error;
    }
    return data;
  }

  /** Update state and status for an existing agent state entry */
  async updateState(
    id: string,
    newState: any,
    status: AgentStatus
  ): Promise<AgentState> {
    const { data, error } = await supabase
      .from('agent_states')
      .update({ state: newState, status })
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }
    return data;
  }

  /** Record an error and mark the agent state as failed */
  async recordError(id: string, errorMsg: string): Promise<AgentState> {
    const { data, error } = await supabase
      .from('agent_states')
      .update({ status: 'failed', last_error: errorMsg })
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }
    return data;
  }

  /** Retrieve an agent state by its ID */
    /**
   * Retrieve an agent state by workflow ID
   */
  async getByWorkflowId(workflowId: string): Promise<AgentState | null> {
    const { data, error } = await supabase.from('agent_states').select('*').eq('workflow_id', workflowId).single();
    if (error) {
      throw error;
    }
    return data;
  }

  async getById(id: string): Promise<AgentState | null> {
    const { data, error } = await supabase
      .from('agent_states')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }
    return data;
  }
}
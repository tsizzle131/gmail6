/**
 * Agent state and status types for workflow management
 */
export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentState {
  id: string;
  agentName: string;
  workflowId: string;
  state: any;
  status: AgentStatus;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}
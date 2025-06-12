import { Router, Request, Response } from 'express';
import { orchestrator } from '../agents/orchestrator';
import { HumanMessage } from '@langchain/core/messages';
import { MessagesAnnotation } from '@langchain/langgraph';

const router = Router();

/**
 * @swagger
 * /leadgen:
 *   post:
 *     summary: Run Lead Generation Agent workflow
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               industry:
 *                 type: string
 *               location:
 *                 type: string
 *               filters:
 *                 type: string
 *             required:
 *               - industry
 *               - location
 *     responses:
 *       200:
 *         description: Agent run result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post('/leadgen', async (req: Request, res: Response) => {
  const { industry, location, filters } = req.body;
  try {
    const initialContent = `Industry: ${industry}; Location: ${location}; Filters: ${filters || ''}`;
    const initialMessage = new HumanMessage({ content: initialContent });
    // Run the orchestrator graph starting with the user message
    console.log('Orchestrator object:', orchestrator);
    console.log('Is orchestrator.run a function?', typeof orchestrator.run === 'function');
    const result = await orchestrator.invoke({ messages: [initialMessage] });
    console.log('Final result from orchestrator.invoke:', JSON.stringify(result, null, 2));

    // Extract relevant data for the API response
    const responseMessages = result.messages.map((msg: any) => ({
      type: msg.constructor.name, // Gets 'HumanMessage', 'AIMessage', etc.
      content: msg.content,
      tool_calls: msg.tool_calls || [],
      id: msg.id
    }));

    res.json({ messages: responseMessages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import config from './config';
import logger from './logger';
import { pgPool } from './db/postgresPool';
import { supabase } from './db/supabaseClient';
import { campaignScheduler } from './services/campaignScheduler';

import authRouter from './routes/auth';
import campaignsRouter from './routes/campaigns';
import contactsRouter from './routes/contacts';
import leadgenRouter from './routes/leadgen';
import emailCraftingRouter from './routes/emailCrafting';
import emailSendingRouter from './routes/emailSending';
import campaignManagerRouter from './routes/campaignManager';
import campaignDemoRouter from './routes/campaignDemo';
import companyKnowledgeRouter from './routes/companyKnowledge';
import knowledgeManagementRouter from './routes/knowledgeManagement';
import webhooksRouter from './routes/webhooks';
import responseHandlerRouter from './routes/responseHandler';
import gmailAuthRouter from './routes/gmail-auth';
import gmailSendingRouter from './routes/gmailSending';

const app = express();

// Middleware: security, CORS, JSON parsing
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Swagger setup
type SwaggerOptions = {
  swaggerDefinition: Record<string, any>;
  apis: string[];
};
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Email Agent API',
      version: '1.0.0',
      description: 'API documentation for the Email Agent backend'
    }
  },
  apis: ['./src/routes/*.ts'],
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    // check Redis via ioredis client in logger or import redisClient
    await pgPool.query('SELECT 1');
    res.status(200).json({
      status: 'ok'
    });
  } catch (err: any) {
    logger.error('Health check failed', { error: err.message });
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Routes
app.use('/auth', authRouter);
app.use('/gmail-auth', gmailAuthRouter);
app.use('/gmail-sending', gmailSendingRouter);
app.use('/campaigns', campaignsRouter);
app.use('/contacts', contactsRouter);
app.use('/email', emailCraftingRouter);
app.use('/email', emailSendingRouter);
app.use('/campaign-manager', campaignManagerRouter);
app.use('/demo', campaignDemoRouter);
app.use('/company', companyKnowledgeRouter);
app.use('/knowledge', knowledgeManagementRouter);
app.use('/webhooks', webhooksRouter);
app.use('/response-handler', responseHandlerRouter);
app.use('/', leadgenRouter);

// Test error route
app.get('/error', () => {
  throw new Error('Test error');
});

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
app.listen(config.port, () => {
  logger.info(`Server listening on port ${config.port}`);
  
  // Start campaign scheduler (disabled for demo - Redis not available)
  // campaignScheduler.start();
  logger.info('Campaign scheduler disabled (Redis not available)');
});

export default app;

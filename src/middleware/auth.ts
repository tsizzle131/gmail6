import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../logger';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        [key: string]: any;
      };
    }
  }
}

/**
 * Authentication middleware
 * For now, we'll use a simple approach - in production you'd use proper JWT validation
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    // For development/testing, we'll use a simple user ID
    // In production, you'd validate JWT tokens here
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      // For now, create a test user - replace with real auth in production
      req.user = {
        id: 'test-user-id-123',
        email: 'test@reignovertech.com'
      };
      
      logger.info('[auth] Using test user for development', { userId: req.user.id });
      return next();
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // For development, accept any token and create test user
    // In production, validate JWT here
    req.user = {
      id: 'test-user-id-123',
      email: 'test@reignovertech.com'
    };
    
    logger.info('[auth] User authenticated', { userId: req.user.id });
    next();

  } catch (error) {
    logger.error('[auth] Authentication failed', { error: (error as Error).message });
    res.status(401).json({ error: 'Invalid authentication' });
  }
};

/**
 * Optional authentication - doesn't require auth but adds user if present
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      // Try to authenticate, but don't fail if invalid
      const token = authHeader.replace('Bearer ', '');
      if (token) {
        req.user = {
          id: 'test-user-id-123',
          email: 'test@reignovertech.com'
        };
      }
    }
    
    next();
  } catch (error) {
    // Continue without auth
    next();
  }
};
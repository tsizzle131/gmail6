import { AnyZodObject } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const validate = (schema: AnyZodObject) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({ ...req.body, ...(req.params), ...(req.query) });
      next();
    } catch (err: any) {
      res.status(400).json({ errors: err.errors });
    }
  };
};
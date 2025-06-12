import { Router } from 'express';
import { supabaseAuth } from '../db/supabaseClient';
import { registerSchema, loginSchema } from '../schemas/auth';
import { validate } from '../middleware/validate';
import jwt from 'jsonwebtoken';
import config from '../config';

const router = Router();

// Register via Supabase Auth
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabaseAuth.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ user: data.user });
  } catch (err: any) {
    next(err);
  }
});

// Login via Supabase Auth
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error || !data.session) return res.status(401).json({ error: error?.message });
    // Sign a JWT using our service role key for API auth
    const token = jwt.sign({ userId: data.user.id }, config.supabaseServiceRoleKey, { expiresIn: '1h' });
    res.json({ token });
  } catch (err: any) {
    next(err);
  }
});

export default router;

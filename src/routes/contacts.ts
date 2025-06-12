import { Router } from 'express';
import { supabase } from '../db/supabaseClient';
import { contactSchema } from '../schemas/contact';
import { validate } from '../middleware/validate';

const router = Router();

// Create contact
router.post('/', validate(contactSchema), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('contacts').insert([req.body]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (err: any) {
    next(err);
  }
});

// Get all contacts
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabase.from('contacts').select('*');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    next(err);
  }
});

// Get contact by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('contacts').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Contact not found' });
    res.json(data);
  } catch (err: any) {
    next(err);
  }
});

// Update contact
router.put('/:id', validate(contactSchema), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('contacts').update(req.body).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    next(err);
  }
});

// Delete contact
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.from('contacts').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (err: any) {
    next(err);
  }
});

export default router;
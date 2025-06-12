import { Router } from 'express';
import { supabase } from '../db/supabaseClient';
import { campaignSchema } from '../schemas/campaign';
import { validate } from '../middleware/validate';

const router = Router();

// Create campaign
router.post('/', validate(campaignSchema), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('campaigns').insert([req.body]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (err: any) {
    next(err);
  }
});

// Get all campaigns
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabase.from('campaigns').select('*');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    next(err);
  }
});

// Get campaign by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('campaigns').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Campaign not found' });
    res.json(data);
  } catch (err: any) {
    next(err);
  }
});

// Update campaign
router.put('/:id', validate(campaignSchema), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('campaigns').update(req.body).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    next(err);
  }
});

// Delete campaign
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.from('campaigns').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (err: any) {
    next(err);
  }
});

export default router;

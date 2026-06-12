import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

authRouter.post('/register', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query<{ id: string }>(
      'INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase(), hash],
    );
    const userId = rows[0].id;
    res.status(201).json({ token: signToken(userId), userId });
  } catch (err: any) {
    if (err?.code === '23505') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    throw err;
  }
});

authRouter.post('/login', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
  const { rows } = await query<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  res.json({ token: signToken(rows[0].id), userId: rows[0].id });
});

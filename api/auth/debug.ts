import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    message: 'Debug endpoint',
    method: req.method,
    url: req.url,
    query: req.query,
    headers: req.headers,
    betterAuthUrl: process.env.BETTER_AUTH_URL,
    appUrl: process.env.VITE_APP_URL
  });
}

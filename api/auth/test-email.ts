/**
 * Endpoint temporário de diagnóstico para testar envio de email via Resend.
 * REMOVER após confirmar que o email funciona.
 *
 * GET /api/auth/test-email?to=seu@email.com
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  const to = req.query.to as string;
  if (!to) {
    return res.status(400).json({ error: 'Query param ?to=email@example.com required' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not set', envKeys: Object.keys(process.env).filter(k => k.includes('RESEND')) });
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: 'Gesttor <gesttor@gesttor.app>',
      to,
      subject: 'Teste de Email — Gesttor',
      html: '<h1>Teste</h1><p>Se você recebeu este email, o Resend está funcionando corretamente.</p>',
    });

    return res.status(200).json({
      success: !result.error,
      result: result.data ?? null,
      error: result.error ?? null,
      apiKeyPrefix: apiKey.substring(0, 10) + '...',
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 3),
    });
  }
}

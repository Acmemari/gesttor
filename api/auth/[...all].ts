/**
 * Vercel catch-all handler para rotas do Better Auth: /api/auth/*
 * Re-exporta catchAll.ts para funcionar com o file-based routing do Vercel.
 */
export { default, config } from './catchAll.js';

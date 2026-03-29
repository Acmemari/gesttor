import { db as dbClient, agentRegistry } from '../../../src/DB/index.js';
import { eq, and } from 'drizzle-orm';
import type { AgentManifest } from '../ai/types.js';
import { helloManifest } from './hello/manifest.js';
import { feedbackManifest } from './feedback/manifest.js';
import { damagesGenManifest } from './damages-gen/manifest.js';
import { ataGenManifest } from './ata-gen/manifest.js';
import { transcricaoProcManifest } from './transcricao-proc/manifest.js';

const manifestMap = new Map<string, AgentManifest>([
  [`${helloManifest.id}@${helloManifest.version}`, helloManifest],
  [`${feedbackManifest.id}@${feedbackManifest.version}`, feedbackManifest],
  [`${damagesGenManifest.id}@${damagesGenManifest.version}`, damagesGenManifest],
  [`${ataGenManifest.id}@${ataGenManifest.version}`, ataGenManifest],
  [`${transcricaoProcManifest.id}@${transcricaoProcManifest.version}`, transcricaoProcManifest],
]);

// A short-lived cache (TTL) for dynamic config to reduce DB load on concurrent executions.
const CACHE_TTL_MS = 15_000;
const dynamicConfigCache = new Map<string, { prompt: string; expiresAt: number }>();

export async function getAgentManifest(
  agentId: string,
  version?: string,
): Promise<AgentManifest | null> {
  let manifest: AgentManifest | null = null;

  if (version) {
    manifest = manifestMap.get(`${agentId}@${version}`) ?? null;
  } else {
    // Latest static version
    const candidates = Array.from(manifestMap.values()).filter(m => m.id === agentId);
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
      manifest = candidates[candidates.length - 1] ?? null;
    }
  }

  // Enrich with dynamic system_prompt from Neon/Drizzle
  if (manifest) {
    const cacheKey = `${manifest.id}@${manifest.version}`;
    const cached = dynamicConfigCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return { ...manifest, systemPrompt: cached.prompt };
    }

    try {
      const [data] = await dbClient
        .select({ system_prompt: agentRegistry.systemPrompt })
        .from(agentRegistry)
        .where(and(eq(agentRegistry.id, manifest.id), eq(agentRegistry.version, manifest.version)))
        .limit(1);

      if (data?.system_prompt) {
        dynamicConfigCache.set(cacheKey, {
          prompt: data.system_prompt,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return {
          ...manifest,
          systemPrompt: data.system_prompt,
        };
      }
    } catch (e) {
      console.error('Error fetching agent config from DB:', e);
    }
  }

  return manifest;
}

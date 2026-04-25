// api/noticias-pecuaria.ts
// Endpoint para scraping de notícias do mercado pecuário via Apify.
// Implementa o skill "agro-intel" (.skills/MktScrapping.md): 8 queries obrigatórias
// cobrindo mercado, exportação, grãos, geopolítica, M&A, clima e fontes oficiais,
// com categorização temática e boost de ranking para fontes prioritárias.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApifyClient } from 'apify-client';

type Category =
  | 'mercado'
  | 'exportacao'
  | 'graos'
  | 'empresas'
  | 'clima'
  | 'geopolitica'
  | 'ma'
  | 'outros';

interface NewsItem {
  id: string;
  title: string;
  source: 'web' | 'youtube' | 'instagram';
  sourceLabel: string;
  url: string;
  description: string;
  imageUrl?: string;
  publishedAt?: string;
  author?: string;
  category: Category;
  priorityScore: number;
}

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const CURRENT_YEAR = new Date().getFullYear();

// ─── Queries obrigatórias do skill agro-intel ────────────────────────────────
// Cada query vem com sua categoria primária; classificação por keywords
// pode sobrescrever quando a palavra-chave for mais específica.
const WEB_QUERIES: { query: string; category: Category }[] = [
  { query: `"boi gordo" preço arroba hoje ${CURRENT_YEAR}`, category: 'mercado' },
  { query: `"pecuária" mercado exportação carne bovina ${CURRENT_YEAR}`, category: 'exportacao' },
  { query: `soja milho cotação mercado ${CURRENT_YEAR}`, category: 'graos' },
  { query: `agronegócio geopolítica comércio exterior tarifas ${CURRENT_YEAR}`, category: 'geopolitica' },
  { query: `"fusões e aquisições" agronegócio frigorífico ${CURRENT_YEAR}`, category: 'ma' },
  { query: `clima agricultura previsão safra "El Niño" OR "La Niña" ${CURRENT_YEAR}`, category: 'clima' },
  { query: `USDA report cattle beef ${CURRENT_YEAR}`, category: 'mercado' },
  { query: `China Brazil beef imports exports ${CURRENT_YEAR}`, category: 'exportacao' },
];

// Múltiplas queries aumentam a cobertura e evitam retorno vazio quando uma
// delas não tem resultados recentes. Não incluir o ano no operador site:
// porque o Google filtra quase tudo fora.
const YOUTUBE_QUERIES: string[] = [
  'boi gordo análise mercado pecuária site:youtube.com',
  'preço arroba boi gordo hoje site:youtube.com',
  'soja milho cotação análise site:youtube.com',
];

// ─── Fontes prioritárias (boost de ranking) ──────────────────────────────────
// Score mais alto = aparece antes. Baseado na hierarquia do skill agro-intel.
const PRIORITY_DOMAINS: { pattern: RegExp; score: number }[] = [
  // Dados oficiais
  { pattern: /cepea\.org\.br|esalq\.usp\.br/i, score: 100 },
  { pattern: /conab\.gov\.br/i, score: 100 },
  { pattern: /usda\.gov/i, score: 100 },
  { pattern: /mapa\.gov\.br|agro\.gov\.br/i, score: 95 },
  { pattern: /ibge\.gov\.br/i, score: 90 },
  { pattern: /b3\.com\.br/i, score: 90 },
  // Portais especializados em agro
  { pattern: /canalrural\.com\.br/i, score: 85 },
  { pattern: /beefpoint\.com\.br/i, score: 85 },
  { pattern: /noticiasagricolas\.com\.br/i, score: 85 },
  { pattern: /agrolink\.com\.br/i, score: 80 },
  { pattern: /scotconsultoria\.com\.br/i, score: 80 },
  { pattern: /agropages|agrinvest/i, score: 75 },
  // Mídia financeira
  { pattern: /valor\.globo\.com|valoreconomico/i, score: 75 },
  { pattern: /reuters\.com/i, score: 75 },
  { pattern: /bloomberg\.com/i, score: 75 },
  { pattern: /infomoney\.com\.br/i, score: 70 },
  // Consultorias
  { pattern: /rabobank|stonex|safras|agrinvest/i, score: 70 },
  // Internacionais
  { pattern: /fao\.org|oecd\.org|mla\.com\.au/i, score: 70 },
];

function getDomainScore(url: string): number {
  for (const { pattern, score } of PRIORITY_DOMAINS) {
    if (pattern.test(url)) return score;
  }
  return 0;
}

// ─── Classificação por keywords (refinamento da categoria primária) ──────────
const KEYWORD_RULES: { keywords: RegExp; category: Category }[] = [
  { keywords: /\b(jbs|marfrig|minerva|brf|cargill|bunge|adm|friboi|swift)\b/i, category: 'empresas' },
  { keywords: /\b(fus[ãa]o|aquisi[çc][ãa]o|m&a|merger|acquisition|ipo)\b/i, category: 'ma' },
  { keywords: /\b(el ni[ñn]o|la ni[ñn]a|clima|chuva|seca|safra|plantio|colheita|temperatura)\b/i, category: 'clima' },
  { keywords: /\b(tarifa|sanç[ãa]o|embargo|acordo comercial|geopol[íi]tica|guerra|tariff|sanction)\b/i, category: 'geopolitica' },
  { keywords: /\b(soja|milho|trigo|gr[ãa]os|grain|corn|soybean|wheat)\b/i, category: 'graos' },
  { keywords: /\b(exporta[çc][ãa]o|import|china|embarque|cif|fob|porto)\b/i, category: 'exportacao' },
  { keywords: /\b(arroba|boi gordo|cepea|bezerro|abate|confinamento|pasto)\b/i, category: 'mercado' },
];

function classifyByKeywords(title: string, description: string, fallback: Category): Category {
  const text = `${title} ${description}`;
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.test(text)) return rule.category;
  }
  return fallback;
}

// ─── Web News: 8 queries obrigatórias em uma única chamada ao actor ──────────
async function scrapeWebNews(client: ApifyClient): Promise<NewsItem[]> {
  try {
    const run = await client.actor('apify/google-search-scraper').call(
      {
        queries: WEB_QUERIES.map(q => q.query).join('\n'),
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
        languageCode: 'pt',
        countryCode: 'br',
        mobileResults: false,
      },
      { waitSecs: 120 },
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 80 });

    const seen = new Set<string>();
    const collected: NewsItem[] = [];

    for (const item of items as any[]) {
      // Match the query back to its category. The scraper returns a searchQuery
      // field; fall back to the query string if the field is missing.
      const queryTerm: string = item.searchQuery?.term || item.searchQuery || '';
      const matchedQuery = WEB_QUERIES.find(q => q.query === queryTerm);
      const primaryCategory: Category = matchedQuery?.category || 'outros';

      const organic: any[] = Array.isArray(item.organicResults) ? item.organicResults : [];
      for (const r of organic) {
        if (!r.title || !r.url) continue;
        if (r.url.includes('youtube.com')) continue;
        if (seen.has(r.url)) continue;
        seen.add(r.url);

        const title: string = r.title;
        const description: string = r.description || r.snippet || '';
        const category = classifyByKeywords(title, description, primaryCategory);

        collected.push({
          id: `web-${seen.size}-${Date.now()}`,
          title,
          source: 'web',
          sourceLabel: 'Web',
          url: r.url,
          description,
          publishedAt: r.date || undefined,
          category,
          priorityScore: getDomainScore(r.url),
        });
      }
    }

    return collected;
  } catch (err) {
    console.error('[noticias] Web scrape error:', err);
    return [];
  }
}

// ─── YouTube ─────────────────────────────────────────────────────────────────
function isYouTubeUrl(url: string): boolean {
  return /(?:^|\/\/)(?:www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i.test(url);
}

async function scrapeYouTube(client: ApifyClient): Promise<NewsItem[]> {
  try {
    const run = await client.actor('apify/google-search-scraper').call(
      {
        queries: YOUTUBE_QUERIES.join('\n'),
        maxPagesPerQuery: 1,
        resultsPerPage: 15,
        languageCode: 'pt',
        countryCode: 'br',
        mobileResults: false,
      },
      { waitSecs: 90 },
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 50 });

    const seen = new Set<string>();
    const collected: NewsItem[] = [];

    for (const item of items as any[]) {
      const organic: any[] = Array.isArray(item.organicResults) ? item.organicResults : [];
      for (const r of organic) {
        if (!r.title || !r.url) continue;
        if (!isYouTubeUrl(r.url)) continue;
        // Only keep actual video pages, not channel/search pages
        if (!/\/watch\?|youtu\.be\//i.test(r.url)) continue;
        if (seen.has(r.url)) continue;
        seen.add(r.url);

        const title: string = r.title;
        const description: string = r.description || r.snippet || '';
        collected.push({
          id: `yt-${seen.size}-${Date.now()}`,
          title,
          source: 'youtube',
          sourceLabel: 'YouTube',
          url: r.url,
          description,
          imageUrl: undefined,
          publishedAt: r.date || undefined,
          author: undefined,
          category: classifyByKeywords(title, description, 'mercado'),
          priorityScore: 0,
        });
        if (collected.length >= 12) break;
      }
      if (collected.length >= 12) break;
    }

    return collected;
  } catch (err) {
    console.error('[noticias] YouTube scrape error:', err);
    return [];
  }
}

// ─── Instagram ───────────────────────────────────────────────────────────────
// Instagram não aceita hashtags com acento nem múltiplas palavras. Usar
// directUrls com páginas de tag individuais é a única forma confiável de
// retornar múltiplos posts por tag no apify/instagram-scraper.
const INSTAGRAM_HASHTAGS = ['pecuaria', 'boigordo', 'agronegocio', 'boi', 'fazenda'];

async function scrapeInstagram(client: ApifyClient): Promise<NewsItem[]> {
  try {
    const run = await client.actor('apify/instagram-scraper').call(
      {
        directUrls: INSTAGRAM_HASHTAGS.map(h => `https://www.instagram.com/explore/tags/${h}/`),
        resultsType: 'posts',
        resultsLimit: 6, // por hashtag → até ~30 posts no total
        addParentData: false,
      },
      { waitSecs: 120 },
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 60 });

    const seen = new Set<string>();
    const collected: NewsItem[] = [];

    for (const item of items as any[]) {
      if (!item.url && !item.shortCode && !item.id) continue;
      const key = item.shortCode || item.id || item.url;
      if (seen.has(key)) continue;
      seen.add(key);

      const caption: string = item.caption || item.alt || item.text || '';
      const title = caption.substring(0, 80) || `Post Instagram ${seen.size}`;
      const description = caption.substring(0, 250);
      collected.push({
        id: `ig-${seen.size}-${Date.now()}`,
        title,
        source: 'instagram',
        sourceLabel: 'Instagram',
        url: item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : `https://www.instagram.com`),
        description,
        imageUrl: item.displayUrl || item.thumbnailUrl || item.imageUrl || undefined,
        publishedAt: item.timestamp
          ? new Date(typeof item.timestamp === 'number' ? item.timestamp * 1000 : item.timestamp).toISOString()
          : undefined,
        author: item.ownerUsername || item.owner?.username || undefined,
        category: classifyByKeywords(title, description, 'mercado'),
        priorityScore: 0,
      });
      if (collected.length >= 12) break;
    }

    return collected;
  } catch (err) {
    console.error('[noticias] Instagram scrape error:', err);
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!APIFY_TOKEN) {
    return res.status(500).json({ ok: false, error: 'APIFY_TOKEN não configurado no servidor.' });
  }

  try {
    const client = new ApifyClient({ token: APIFY_TOKEN });
    const { sources = ['web', 'youtube', 'instagram'] } = req.body || {};

    const tasks: Promise<NewsItem[]>[] = [];
    const sourceLabels: string[] = [];

    if (sources.includes('web')) {
      tasks.push(scrapeWebNews(client));
      sourceLabels.push('Web');
    }
    if (sources.includes('youtube')) {
      tasks.push(scrapeYouTube(client));
      sourceLabels.push('YouTube');
    }
    if (sources.includes('instagram')) {
      tasks.push(scrapeInstagram(client));
      sourceLabels.push('Instagram');
    }

    const results = await Promise.allSettled(tasks);

    const allNews: NewsItem[] = [];
    const errors: string[] = [];

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        allNews.push(...r.value);
        if (r.value.length === 0) {
          errors.push(`${sourceLabels[i]}: nenhum resultado encontrado`);
        }
      } else {
        errors.push(`${sourceLabels[i]} falhou: ${r.reason?.message || 'erro desconhecido'}`);
      }
    });

    // Sort: priority domains first, then by date desc.
    allNews.sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      if (a.publishedAt && b.publishedAt) {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      if (a.publishedAt) return -1;
      if (b.publishedAt) return 1;
      return 0;
    });

    // Category breakdown for frontend badges
    const categoryCounts: Record<Category, number> = {
      mercado: 0, exportacao: 0, graos: 0, empresas: 0,
      clima: 0, geopolitica: 0, ma: 0, outros: 0,
    };
    for (const n of allNews) categoryCounts[n.category]++;

    return res.status(200).json({
      ok: true,
      data: {
        news: allNews,
        updatedAt: new Date().toISOString(),
        totalResults: allNews.length,
        categoryCounts,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (err: any) {
    console.error('[noticias-pecuaria] Error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Erro interno' });
  }
}

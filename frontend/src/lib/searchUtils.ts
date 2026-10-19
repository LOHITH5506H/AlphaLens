import { SearchSuggestion } from "@/types";

export interface CompanyEntry {
  symbol: string;
  name: string;
  aliases: string[];
  sector: string;
  exchange: string;
}

export const COMPANY_DIRECTORY: CompanyEntry[] = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    aliases: ["apple", "aapl", "iphone", "ipad", "macbook", "ios", "tim cook", "epp", "aple", "appl", "epple", "apll", "aplle"],
    sector: "Consumer Technology",
    exchange: "NASDAQ",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    aliases: ["nvidia", "nvda", "geforce", "rtx", "gpu", "ai chips", "jensen", "jensen huang", "nvdia", "nvida", "envidia"],
    sector: "Semiconductors & AI",
    exchange: "NASDAQ",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    aliases: ["microsoft", "msft", "windows", "azure", "office", "xbox", "satya", "satya nadella", "msf", "microsft", "mcrosoft"],
    sector: "Enterprise Software & Cloud",
    exchange: "NASDAQ",
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc. (Google)",
    aliases: ["google", "alphabet", "googl", "goog", "youtube", "android", "gemini", "sundar", "gogl", "goole", "gogle"],
    sector: "Internet & AI Infrastructure",
    exchange: "NASDAQ",
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    aliases: ["amazon", "amzn", "aws", "prime", "bezos", "ecommerce", "amazn", "amz", "amzon"],
    sector: "E-Commerce & Cloud",
    exchange: "NASDAQ",
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    aliases: ["tesla", "tsla", "cybertruck", "model 3", "elon", "musk", "ev", "tesl", "tsls"],
    sector: "Automotive & Clean Energy",
    exchange: "NASDAQ",
  },
  {
    symbol: "META",
    name: "Meta Platforms Inc.",
    aliases: ["meta", "facebook", "instagram", "whatsapp", "zuck", "oculus", "fb", "met"],
    sector: "Social Media & Spatial AI",
    exchange: "NASDAQ",
  },
  {
    symbol: "NFLX",
    name: "Netflix Inc.",
    aliases: ["netflix", "nflx", "streaming", "movies", "netflx", "netf", "netlfix"],
    sector: "Entertainment & Streaming",
    exchange: "NASDAQ",
  },
  {
    symbol: "AMD",
    name: "Advanced Micro Devices",
    aliases: ["amd", "radeon", "ryzen", "lisa su", "chips", "semiconductor"],
    sector: "Semiconductors",
    exchange: "NASDAQ",
  },
  {
    symbol: "INTC",
    name: "Intel Corporation",
    aliases: ["intel", "intc", "core", "foundry", "chips", "pat gelsinger"],
    sector: "Semiconductors",
    exchange: "NASDAQ",
  },
  {
    symbol: "TSM",
    name: "Taiwan Semiconductor (TSMC)",
    aliases: ["tsmc", "tsm", "taiwan semiconductor", "foundry", "chips", "wafer"],
    sector: "Semiconductors",
    exchange: "NYSE",
  },
  {
    symbol: "PLTR",
    name: "Palantir Technologies",
    aliases: ["palantir", "pltr", "alex karp", "gotham", "foundry", "plntr", "plantir"],
    sector: "Enterprise Software & AI",
    exchange: "NYSE",
  },
  {
    symbol: "AVGO",
    name: "Broadcom Inc.",
    aliases: ["broadcom", "avgo", "vmware", "semiconductor"],
    sector: "Semiconductors & Infrastructure",
    exchange: "NASDAQ",
  },
  {
    symbol: "QCOM",
    name: "Qualcomm Inc.",
    aliases: ["qualcomm", "qcom", "snapdragon", "mobile chips"],
    sector: "Semiconductors",
    exchange: "NASDAQ",
  },
  {
    symbol: "ARM",
    name: "Arm Holdings plc",
    aliases: ["arm", "arm holdings", "cortex", "architecture"],
    sector: "Semiconductors",
    exchange: "NASDAQ",
  },
  {
    symbol: "ORCL",
    name: "Oracle Corporation",
    aliases: ["oracle", "orcl", "larry ellison", "database", "cloud"],
    sector: "Enterprise Cloud & Database",
    exchange: "NYSE",
  },
  {
    symbol: "CRM",
    name: "Salesforce Inc.",
    aliases: ["salesforce", "crm", "benioff", "agentforce"],
    sector: "Enterprise Software",
    exchange: "NYSE",
  },
  {
    symbol: "ADBE",
    name: "Adobe Inc.",
    aliases: ["adobe", "adbe", "photoshop", "creative cloud", "firefly"],
    sector: "Creative & Enterprise Software",
    exchange: "NASDAQ",
  },
  {
    symbol: "UBER",
    name: "Uber Technologies Inc.",
    aliases: ["uber", "rideshare", "eats", "delivery"],
    sector: "Mobility & Logistics",
    exchange: "NYSE",
  },
  {
    symbol: "COIN",
    name: "Coinbase Global Inc.",
    aliases: ["coinbase", "coin", "crypto", "bitcoin", "ethereum"],
    sector: "Fintech & Digital Assets",
    exchange: "NASDAQ",
  },
  {
    symbol: "DIS",
    name: "The Walt Disney Company",
    aliases: ["disney", "dis", "marvel", "star wars", "pixar", "theme parks"],
    sector: "Entertainment & Media",
    exchange: "NYSE",
  },
  {
    symbol: "JPM",
    name: "JPMorgan Chase & Co.",
    aliases: ["jpmorgan", "chase", "jpm", "jamie dimon", "banking"],
    sector: "Financial Services",
    exchange: "NYSE",
  },
  {
    symbol: "RELIANCE.NS",
    name: "Reliance Industries",
    aliases: ["reliance", "jio", "mukesh ambani", "relianc", "relaince"],
    sector: "Energy & Telecom",
    exchange: "NSE",
  },
  {
    symbol: "TCS.NS",
    name: "Tata Consultancy Services",
    aliases: ["tata", "tcs", "tata consultancy"],
    sector: "IT Services",
    exchange: "NSE",
  },
  {
    symbol: "INFY.NS",
    name: "Infosys Limited",
    aliases: ["infosys", "infy"],
    sector: "IT Services",
    exchange: "NSE",
  },
];

/**
 * Standard Levenshtein Distance implementation.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Normalized sequence similarity ratio [0.0 - 1.0].
 */
export function sequenceSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshteinDistance(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

const KNOWN_TYPOS: Record<string, string> = {
  epp: "AAPL",
  aple: "AAPL",
  appl: "AAPL",
  epple: "AAPL",
  apll: "AAPL",
  aplle: "AAPL",
  nvdia: "NVDA",
  nvida: "NVDA",
  envidia: "NVDA",
  tesl: "TSLA",
  tsls: "TSLA",
  msf: "MSFT",
  microsft: "MSFT",
  mcrosoft: "MSFT",
  gogl: "GOOGL",
  goole: "GOOGL",
  amazn: "AMZN",
  amz: "AMZN",
  netflx: "NFLX",
  plntr: "PLTR",
  relianc: "RELIANCE.NS",
};

/**
 * Returns ranked, typo-tolerant suggestions for any query string.
 * Gracefully recognizes 'epp' -> Apple Inc. (AAPL), 'nvdia' -> NVIDIA, etc.
 */
export function getFuzzySuggestions(query: string, limit = 5): SearchSuggestion[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: SearchSuggestion[] = [];

  for (const comp of COMPANY_DIRECTORY) {
    const sym = comp.symbol;
    const name = comp.name;
    const aliases = comp.aliases;
    const sLow = sym.toLowerCase();
    const nLow = name.toLowerCase();
    const aLow = aliases.map((a) => a.toLowerCase());

    let score = 0.0;
    let matchReason: string | undefined = undefined;
    let isCorrection = false;

    // 1. Explicit known typo match (highest priority correction)
    if (KNOWN_TYPOS[q] === sym) {
      score = 0.99;
      isCorrection = true;
      matchReason = `Did you mean ${name.split(" ")[0]}? (Typo match for "${query}")`;
    }
    // 2. Exact ticker match
    else if (q === sLow) {
      score = 1.0;
      matchReason = `Exact ticker match (${sym})`;
    }
    // 3. Exact alias match
    else if (aLow.includes(q)) {
      score = 0.98;
      matchReason = `Matches alias "${q}"`;
      if (["epp", "aple", "appl", "nvdia", "tesl", "msf", "gogl", "amazn"].includes(q)) {
        isCorrection = true;
        matchReason = `Did you mean ${name.split(" ")[0]}? (Typo match for "${query}")`;
      }
    }
    // 4. Exact company name match
    else if (q === nLow) {
      score = 0.96;
      matchReason = "Exact company name";
    }
    // 5. Ticker starts with query
    else if (sLow.startsWith(q)) {
      score = 0.92;
      matchReason = `Ticker starts with "${query.toUpperCase()}"`;
    }
    // 6. Alias starts with query
    else if (aLow.some((a) => a.startsWith(q))) {
      const matched = aLow.find((a) => a.startsWith(q))!;
      score = 0.90;
      matchReason = `Matches "${matched.charAt(0).toUpperCase() + matched.slice(1)}"`;
    }
    // 7. Company name starts with query
    else if (nLow.startsWith(q)) {
      score = 0.88;
      matchReason = `Name starts with "${query}"`;
    }
    // 8. Substring in name or alias
    else if (nLow.includes(q) || aLow.some((a) => a.includes(q))) {
      score = 0.82;
      matchReason = `Contains "${query}"`;
    }
    // 9. Fuzzy edit distance / sequence similarity
    else {
      let bestSim = 0.0;
      let bestTarget = "";

      for (const t of [sLow, nLow, ...aLow]) {
        const simFull = sequenceSimilarity(q, t);
        // Prefix slice comparison (e.g. 'epp' vs first 3 chars of 'apple' -> 'app')
        const pLen = Math.min(t.length, Math.max(q.length, 3));
        const simPrefix = sequenceSimilarity(q, t.slice(0, pLen)) * 0.92;
        const currentBest = Math.max(simFull, simPrefix);

        if (currentBest > bestSim) {
          bestSim = currentBest;
          bestTarget = t;
        }
      }

      // Phonetic vowel substitution boost (e.g. epp <-> app)
      const vowelMap: Record<string, string> = { e: "a", a: "e", i: "e", o: "u", u: "o" };
      const qVowel = q.split("").map((c) => vowelMap[c] || c).join("");
      for (const t of aLow) {
        const pLen = Math.min(t.length, Math.max(q.length, 3));
        const simVowel = sequenceSimilarity(qVowel, t.slice(0, pLen)) * 0.90;
        if (simVowel > bestSim) {
          bestSim = simVowel;
          bestTarget = t;
        }
      }

      if (bestSim >= 0.45) {
        score = bestSim * 0.85;
        isCorrection = true;
        matchReason = `Did you mean ${name.split(" ")[0]}? (Typo match for "${query}")`;
      }
    }

    if (score >= 0.40) {
      results.push({
        symbol: sym,
        name: name,
        exchange: comp.exchange,
        sector: comp.sector,
        score: Math.round(score * 100) / 100,
        matchReason: matchReason || "Fuzzy match",
        isCorrection,
      });
    }
  }

  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  return results.slice(0, limit);
}

/**
 * Resolves a company query directly to the best ticker symbol.
 * Handles typos like 'epp' -> 'AAPL'.
 */
export function resolveCompanyQuery(query: string): {
  ticker: string;
  name?: string;
  isCorrection: boolean;
  reason?: string;
} {
  const clean = query.trim();
  if (!clean) return { ticker: "AAPL", isCorrection: false };

  // If query is an uppercase ticker (e.g. NVDA, MSFT)
  if (clean.length <= 5 && /^[A-Z]+$/.test(clean)) {
    return { ticker: clean, isCorrection: false };
  }

  const suggestions = getFuzzySuggestions(clean, 1);
  if (suggestions.length > 0 && (suggestions[0].score || 0) >= 0.45) {
    const top = suggestions[0];
    return {
      ticker: top.symbol,
      name: top.name,
      isCorrection: !!top.isCorrection,
      reason: top.matchReason,
    };
  }

  // Fallback uppercase
  return {
    ticker: clean.toUpperCase().slice(0, 5),
    isCorrection: false,
  };
}

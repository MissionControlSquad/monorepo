export interface LLMProvider {
  id: string;
  name: string;
  defaultModel: string;
  envVar: string;
  modelHint: string;
  models?: string[];
}

export const LLM_PROVIDERS: LLMProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    defaultModel: "claude-sonnet-4-6",
    envVar: "ANTHROPIC_API_KEY",
    modelHint: "claude-sonnet-4-6, claude-opus-4-6",
    models: [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-5-20250514",
      "claude-3-5-haiku-20241022",
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-4o",
    envVar: "OPENAI_API_KEY",
    modelHint: "gpt-4o, gpt-4o-mini, o3",
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "o3",
      "o3-mini",
      "o4-mini",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
    ],
  },
  {
    id: "google",
    name: "Google",
    defaultModel: "gemini-2.5-pro",
    envVar: "GOOGLE_API_KEY",
    modelHint: "gemini-2.5-pro, gemini-2.5-flash",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: "anthropic/claude-sonnet-4-6",
    envVar: "OPENROUTER_API_KEY",
    modelHint: "anthropic/claude-sonnet-4-6, openai/gpt-4o",
  },
  {
    id: "groq",
    name: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    envVar: "GROQ_API_KEY",
    modelHint: "llama-3.3-70b-versatile, mixtral-8x7b",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultModel: "deepseek-chat",
    envVar: "DEEPSEEK_API_KEY",
    modelHint: "deepseek-chat, deepseek-reasoner",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "minimax",
    name: "MiniMax",
    defaultModel: "MiniMax-Text-01",
    envVar: "MINIMAX_API_KEY",
    modelHint: "MiniMax-Text-01",
    models: ["MiniMax-Text-01"],
  },
  {
    id: "zai",
    name: "Z.AI",
    defaultModel: "grok-3",
    envVar: "XAI_API_KEY",
    modelHint: "grok-3, grok-3-mini",
    models: ["grok-3", "grok-3-mini", "grok-2"],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    defaultModel: "llama-3.3-70b",
    envVar: "CEREBRAS_API_KEY",
    modelHint: "llama-3.3-70b, llama-4-scout",
    models: ["llama-3.3-70b", "llama-4-scout", "llama-3.1-8b"],
  },
  {
    id: "kimi",
    name: "Kimi",
    defaultModel: "kimi-k2",
    envVar: "MOONSHOT_API_KEY",
    modelHint: "kimi-k2",
    models: ["kimi-k2"],
  },
];

export const LLM_PROVIDERS_MAP = Object.fromEntries(LLM_PROVIDERS.map((p) => [p.id, p]));

/** Static Tailwind class map — avoids purge issues with dynamic classes */
export const PROVIDER_COLORS: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  anthropic: {
    bg: "bg-purple-100",
    text: "text-purple-700",
    border: "border-purple-200",
    dot: "bg-purple-500",
  },
  openai: {
    bg: "bg-green-100",
    text: "text-green-700",
    border: "border-green-200",
    dot: "bg-green-500",
  },
  google: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  openrouter: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    border: "border-orange-200",
    dot: "bg-orange-500",
  },
  groq: { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-200", dot: "bg-cyan-500" },
  deepseek: { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-200", dot: "bg-sky-500" },
  minimax: {
    bg: "bg-violet-100",
    text: "text-violet-700",
    border: "border-violet-200",
    dot: "bg-violet-500",
  },
  zai: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  cerebras: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  kimi: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    border: "border-indigo-200",
    dot: "bg-indigo-500",
  },
};

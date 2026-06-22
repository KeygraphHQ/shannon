export interface ProgramConfig {
  name: string;
  platform: 'hackerone' | 'bugcrowd' | 'other';
  in_scope_domains: string[];
  out_of_scope_patterns: string[];
  focus_classes?: string[];
  active_campaign?: {
    asset?: string;
    multipliers?: Record<string, number>;
  };
  rules?: string;
}

export interface StoredProgram {
  slug: string;
  config: ProgramConfig;
  created_at: string;
  source_url?: string | undefined;
}

export interface BountyConfig {
  program: ProgramConfig;
  rules: {
    focus: { type: string; value: string; description: string }[];
    avoid: { type: string; value: string; description: string }[];
  };
}

export interface ProgramConfig {
  name: string;
  platform: 'hackerone' | 'bugcrowd';
  in_scope_domains: string[];
  out_of_scope_patterns: string[];
  focus_classes: string[];
  active_campaign?: {
    name: string;
    multipliers: Record<string, number>;
  };
  rules: string[];
}

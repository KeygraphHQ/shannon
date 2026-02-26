import { fs, path } from 'zx';
import yaml from 'js-yaml';

export interface BrandingConfig {
  product_name: string;
  company_name: string;
  report_footer: string;
}

const defaults: BrandingConfig = {
  product_name: 'PentestAI',
  company_name: 'Security Team',
  report_footer: 'Confidential Security Audit',
};

export async function loadBrandingConfig(): Promise<BrandingConfig> {
  const configPath = path.join(process.cwd(), 'config', 'branding.yaml');
  if (!(await fs.pathExists(configPath))) {
    return defaults;
  }
  const parsed = yaml.load(await fs.readFile(configPath, 'utf8')) as Partial<BrandingConfig>;
  return {
    product_name: parsed.product_name ?? defaults.product_name,
    company_name: parsed.company_name ?? defaults.company_name,
    report_footer: parsed.report_footer ?? defaults.report_footer,
  };
}

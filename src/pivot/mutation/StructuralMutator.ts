// Copyright (C) 2025 Keygraph, Inc.
// GNU Affero General Public License version 3

/**
 * PIVOT - Phase 3: Mutation Family Library
 * StructuralMutator - Structural mutations for WAF bypass and payload obfuscation
 */

export type StructuralVariant =
  | 'case_variation'
  | 'whitespace_injection'
  | 'comment_injection'
  | 'parameter_pollution'
  | 'http_verb_tampering'
  | 'content_type_switching'
  | 'chunked_encoding'
  | 'host_header_manipulation';

export interface StructuralMutation {
  name: StructuralVariant;
  apply: (payload: string, context?: any) => string;
  description: string;
  bypassTarget: string;
}

/**
 * StructuralMutator - Structural mutations for bypassing filters
 */
export class StructuralMutator {
  private variants: Map<StructuralVariant, StructuralMutation>;

  constructor() {
    this.variants = new Map();
    this.registerVariants();
  }

  /**
   * Apply a structural mutation to a payload
   */
  mutate(payload: string, variant: StructuralVariant, context?: any): string {
    const mutator = this.variants.get(variant);
    if (!mutator) throw new Error(`Unknown structural variant: ${variant}`);
    return mutator.apply(payload, context);
  }

  /**
   * Get all available variants
   */
  getVariants(): StructuralVariant[] {
    return Array.from(this.variants.keys());
  }

  /**
   * Get variant metadata
   */
  getVariantInfo(variant: StructuralVariant): StructuralMutation | undefined {
    return this.variants.get(variant);
  }

  private registerVariants(): void {
    // ─── Case Variation ───────────────────────────────────────────────────

    this.variants.set('case_variation', {
      name: 'case_variation',
      description: 'Case variations for keyword bypass',
      bypassTarget: 'Case-sensitive keyword filters',
      apply: (payload: string) => {
        const strategies = [
          // All uppercase
          payload.toUpperCase(),
          // All lowercase
          payload.toLowerCase(),
          // Mixed case (alternating)
          Array.from(payload).map((ch, i) => 
            i % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase()
          ).join(''),
          // Random case
          Array.from(payload).map(ch => 
            Math.random() > 0.5 ? ch.toUpperCase() : ch.toLowerCase()
          ).join(''),
          // First letter uppercase
          payload.charAt(0).toUpperCase() + payload.slice(1).toLowerCase(),
        ];
        const selected = strategies[Math.floor(Math.random() * strategies.length)];
        return selected || payload;
      }
    });

    // ─── Whitespace Injection ─────────────────────────────────────────────

    this.variants.set('whitespace_injection', {
      name: 'whitespace_injection',
      description: 'Inject whitespace characters to break tokenization',
      bypassTarget: 'Token-based filters, regex patterns',
      apply: (payload: string) => {
        const whitespaceChars = ['\t', '\n', '\r', '\f', '\v', '\u00A0', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200A', '\u200B', '\u200C', '\u200D', '\u200E', '\u200F', '\u2028', '\u2029', '\uFEFF'];
        
        // Inject whitespace between characters
        const result: string[] = [];
        for (let i = 0; i < payload.length; i++) {
          result.push(payload[i]);
          if (i < payload.length - 1 && Math.random() < 0.3) {
            const ws = whitespaceChars[Math.floor(Math.random() * whitespaceChars.length)];
            result.push(ws);
          }
        }
        
        return result.join('');
      }
    });

    // ─── Comment Injection ────────────────────────────────────────────────

    this.variants.set('comment_injection', {
      name: 'comment_injection',
      description: 'Inject language-specific comments to break parsing',
      bypassTarget: 'Parser-based filters, SQL/HTML/JS filters',
      apply: (payload: string, context?: { language?: string }) => {
        const lang = context?.language || 'sql';
        
        const commentStyles: Record<string, string[]> = {
          sql: ['/**/', '-- ', '# ', '/*!', '/*!50000'],
          html: ['<!--', '-->'],
          javascript: ['//', '/*', '*/'],
          css: ['/*', '*/'],
          xml: ['<!--', '-->'],
          php: ['//', '#', '/*', '*/'],
          python: ['#', '"""', "'''"],
        };

        const styles = commentStyles[lang] || commentStyles.sql;
        
        if (styles && styles.length >= 2) {
          // Wrap payload in comments
          return `${styles[0]}${payload}${styles[1]}`;
        } else if (styles && styles.length > 0) {
          // Prefix with comment
          return `${styles[0]} ${payload}`;
        }
        return payload;
      }
    });

    // ─── Parameter Pollution ──────────────────────────────────────────────

    this.variants.set('parameter_pollution', {
      name: 'parameter_pollution',
      description: 'Duplicate parameters with different values',
      bypassTarget: 'Parameter validation, WAF parameter parsing',
      apply: (payload: string, context?: { paramName?: string }) => {
        const paramName = context?.paramName || 'id';
        
        const pollutionStrategies = [
          // Duplicate parameter with same value
          `${paramName}=${payload}&${paramName}=${payload}`,
          // Duplicate with different encoding
          `${paramName}=${encodeURIComponent(payload)}&${paramName}=${payload}`,
          // Array notation
          `${paramName}[]=${payload}&${paramName}[]=${encodeURIComponent(payload)}`,
          // Mixed case parameter names
          `${paramName}=${payload}&${paramName.toUpperCase()}=${payload}`,
          // Null byte in parameter name
          `${paramName}%00=${payload}&${paramName}=${payload}`,
        ];
        
        const selected = pollutionStrategies[Math.floor(Math.random() * pollutionStrategies.length)];
        return selected || `${paramName}=${payload}`;
      }
    });

    // ─── HTTP Verb Tampering ──────────────────────────────────────────────

    this.variants.set('http_verb_tampering', {
      name: 'http_verb_tampering',
      description: 'Manipulate HTTP methods to bypass restrictions',
      bypassTarget: 'HTTP method validation, WAF rule sets',
      apply: (payload: string, context?: { originalMethod?: string }) => {
        const original = context?.originalMethod || 'GET';
        
        const verbStrategies = [
          // Override with X-HTTP-Method-Override header
          payload, // Payload stays the same, method changed via header
          // Use non-standard verbs
          payload,
          // Use lowercase/uppercase variants
          payload,
        ];
        
        return verbStrategies[0] || payload; // Payload unchanged, method handled elsewhere
      }
    });

    // ─── Content-Type Switching ───────────────────────────────────────────

    this.variants.set('content_type_switching', {
      name: 'content_type_switching',
      description: 'Switch content types to confuse parsers',
      bypassTarget: 'Content-type validation, parser logic',
      apply: (payload: string, context?: { originalType?: string }) => {
        const original = context?.originalType || 'application/x-www-form-urlencoded';
        
        const contentTypeStrategies: Record<string, string> = {
          'application/x-www-form-urlencoded': payload,
          'application/json': JSON.stringify({ data: payload }),
          'multipart/form-data': `--boundary\r\nContent-Disposition: form-data; name="data"\r\n\r\n${payload}\r\n--boundary--`,
          'text/plain': payload,
          'application/xml': `<data>${payload}</data>`,
          'text/xml': `<data>${payload}</data>`,
        };
        
        // Pick a different content type
        const types = Object.keys(contentTypeStrategies).filter(t => t !== original);
        const selectedType = types[Math.floor(Math.random() * types.length)];
        
        return contentTypeStrategies[selectedType];
      }
    });

    // ─── Chunked Encoding ─────────────────────────────────────────────────

    this.variants.set('chunked_encoding', {
      name: 'chunked_encoding',
      description: 'Use chunked transfer encoding to bypass filters',
      bypassTarget: 'Request body scanners, WAF body inspection',
      apply: (payload: string) => {
        // Split payload into chunks
        const chunkSize = Math.max(1, Math.floor(payload.length / 3));
        const chunks: string[] = [];
        
        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          const sizeHex = chunk.length.toString(16);
          chunks.push(`${sizeHex}\r\n${chunk}\r\n`);
        }
        
        chunks.push('0\r\n\r\n'); // End of chunks
        return chunks.join('');
      }
    });

    // ─── Host Header Manipulation ─────────────────────────────────────────

    this.variants.set('host_header_manipulation', {
      name: 'host_header_manipulation',
      description: 'Manipulate Host header for virtual host bypass',
      bypassTarget: 'Virtual host routing, host validation',
      apply: (payload: string, context?: { originalHost?: string }) => {
        const original = context?.originalHost || 'example.com';
        
        const hostStrategies = [
          // Add port
          `${original}:80`,
          `${original}:443`,
          `${original}:8080`,
          // Add www prefix
          `www.${original}`,
          // Remove www prefix
          original.replace('www.', ''),
          // Use IP address
          '127.0.0.1',
          'localhost',
          // Use encoded host
          encodeURIComponent(original),
          // Use null byte
          `${original}%00`,
          // Use line break
          `${original}\r\nX-Forwarded-Host: ${original}`,
        ];
        
        return hostStrategies[Math.floor(Math.random() * hostStrategies.length)];
      }
    });
  }

  /**
   * Generate multiple structural mutations for a payload
   */
  generateAllMutations(payload: string, context?: any): Map<StructuralVariant, string> {
    const results = new Map<StructuralVariant, string>();
    for (const [name, mutator] of this.variants.entries()) {
      try {
        results.set(name, mutator.apply(payload, context));
      } catch {
        // Skip failed mutations
      }
    }
    return results;
  }

  /**
   * Get variants recommended for a specific filter type
   */
  getVariantsForBypassTarget(target: string): StructuralVariant[] {
    const matching: StructuralVariant[] = [];
    for (const [name, mutator] of this.variants.entries()) {
      if (mutator.bypassTarget.toLowerCase().includes(target.toLowerCase())) {
        matching.push(name);
      }
    }
    return matching;
  }
}
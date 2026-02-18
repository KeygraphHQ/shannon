// Copyright (C) 2025 Keygraph, Inc.
// GNU Affero General Public License version 3

/**
 * PIVOT - Phase 3: Mutation Family Library
 * EncodingMutator - Simplified version without Buffer dependency
 */

export type EncodingVariant =
  | 'url_single'
  | 'url_double'
  | 'html_entity_named'
  | 'html_entity_decimal'
  | 'html_entity_hex'
  | 'unicode_escape'
  | 'unicode_fullwidth'
  | 'hex_escape'
  | 'null_byte_prefix'
  | 'null_byte_suffix'
  | 'overlong_utf8'
  | 'mixed_case'
  | 'html_entity_mixed';

export interface MutationVariant {
  name: EncodingVariant;
  encode: (input: string) => string;
  description: string;
  bypassTarget: string;
}

/**
 * EncodingMutator - Simplified implementation
 */
export class EncodingMutator {
  private variants: Map<EncodingVariant, MutationVariant>;

  constructor() {
    this.variants = new Map();
    this.registerVariants();
  }

  encode(payload: string, variant: EncodingVariant): string {
    const mutator = this.variants.get(variant);
    if (!mutator) throw new Error(`Unknown encoding variant: ${variant}`);
    return mutator.encode(payload);
  }

  getVariants(): EncodingVariant[] {
    return Array.from(this.variants.keys());
  }

  getVariantInfo(variant: EncodingVariant): MutationVariant | undefined {
    return this.variants.get(variant);
  }

  private registerVariants(): void {
    // URL Encoding
    this.variants.set('url_single', {
      name: 'url_single',
      description: 'Standard URL percent-encoding',
      bypassTarget: 'basic input filters',
      encode: (input: string) => {
        return Array.from(input).map(ch => {
          const code = ch.charCodeAt(0);
          if (/[a-zA-Z0-9]/.test(ch)) return ch;
          return '%' + code.toString(16).toUpperCase().padStart(2, '0');
        }).join('');
      }
    });

    this.variants.set('url_double', {
      name: 'url_double',
      description: 'Double URL encoding',
      bypassTarget: 'single-decode WAF filters',
      encode: (input: string) => {
        const single = Array.from(input).map(ch => {
          const code = ch.charCodeAt(0);
          if (/[a-zA-Z0-9]/.test(ch)) return ch;
          return '%' + code.toString(16).toUpperCase().padStart(2, '0');
        }).join('');
        return single.replace(/%/g, '%25');
      }
    });

    // HTML Entity Encoding
    const HTML_NAMED: Record<string, string> = {
      '<': '<',
      '>': '>',
      '"': '"',
      "'": '&#39;',
      '&': '&',
      '/': '&#47;',
      '=': '&#61;',
      ' ': '&nbsp;'
    };

    this.variants.set('html_entity_named', {
      name: 'html_entity_named',
      description: 'Named HTML entities',
      bypassTarget: 'HTML tag filters',
      encode: (input: string) => {
        return Array.from(input).map(ch => HTML_NAMED[ch] || ch).join('');
      }
    });

    this.variants.set('html_entity_decimal', {
      name: 'html_entity_decimal',
      description: 'Decimal HTML entities',
      bypassTarget: 'HTML char filters',
      encode: (input: string) => {
        return Array.from(input)
          .map(ch => `&#${ch.charCodeAt(0)};`)
          .join('');
      }
    });

    this.variants.set('html_entity_hex', {
      name: 'html_entity_hex',
      description: 'Hex HTML entities',
      bypassTarget: 'HTML char filters',
      encode: (input: string) => {
        return Array.from(input)
          .map(ch => `&#x${ch.charCodeAt(0).toString(16).toUpperCase()};`)
          .join('');
      }
    });

    this.variants.set('html_entity_mixed', {
      name: 'html_entity_mixed',
      description: 'Mix of decimal and hex entities',
      bypassTarget: 'Pattern-based WAF filters',
      encode: (input: string) => {
        return Array.from(input).map((ch, i) => {
          const code = ch.charCodeAt(0);
          return i % 2 === 0
            ? `&#${code};`
            : `&#x${code.toString(16)};`;
        }).join('');
      }
    });

    // Unicode Encoding
    this.variants.set('unicode_escape', {
      name: 'unicode_escape',
      description: 'JavaScript unicode escapes',
      bypassTarget: 'JS string filters',
      encode: (input: string) => {
        return Array.from(input)
          .map(ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
          .join('');
      }
    });

    this.variants.set('unicode_fullwidth', {
      name: 'unicode_fullwidth',
      description: 'Fullwidth Unicode variants',
      bypassTarget: 'Keyword-based filters',
      encode: (input: string) => {
        return Array.from(input).map(ch => {
          const code = ch.charCodeAt(0);
          if (code >= 0x21 && code <= 0x7E) {
            return String.fromCharCode(code + 0xFEE0);
          }
          return ch;
        }).join('');
      }
    });

    // Hex Encoding
    this.variants.set('hex_escape', {
      name: 'hex_escape',
      description: 'Hex escape sequences',
      bypassTarget: 'String literal filters',
      encode: (input: string) => {
        return Array.from(input)
          .map(ch => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
          .join('');
      }
    });

    // Null Byte Injection
    this.variants.set('null_byte_prefix', {
      name: 'null_byte_prefix',
      description: 'Null byte prefix',
      bypassTarget: 'C-string based filters',
      encode: (input: string) => `%00${input}`
    });

    this.variants.set('null_byte_suffix', {
      name: 'null_byte_suffix',
      description: 'Null byte suffix',
      bypassTarget: 'Path traversal filters',
      encode: (input: string) => `${input}%00`
    });

    // Overlong UTF-8
    this.variants.set('overlong_utf8', {
      name: 'overlong_utf8',
      description: 'Overlong UTF-8 sequences',
      bypassTarget: 'Simple UTF-8 char matching',
      encode: (input: string) => {
        return Array.from(input).map(ch => {
          const code = ch.charCodeAt(0);
          if (code < 0x80) {
            const b1 = 0xC0 | (code >> 6);
            const b2 = 0x80 | (code & 0x3F);
            return `%${b1.toString(16).toUpperCase()}%${b2.toString(16).toUpperCase()}`;
          }
          return encodeURIComponent(ch);
        }).join('');
      }
    });

    // Mixed Case
    this.variants.set('mixed_case', {
      name: 'mixed_case',
      description: 'Alternating case',
      bypassTarget: 'Case-sensitive keyword filters',
      encode: (input: string) => {
        return Array.from(input).map((ch, i) =>
          i % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase()
        ).join('');
      }
    });
  }
}
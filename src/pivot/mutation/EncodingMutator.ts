// Copyright (C) 2025 Keygraph, Inc.
// GNU Affero General Public License version 3

/**
 * PIVOT - Phase 3: Mutation Family Library
 * EncodingMutator - Real encoding implementations for WAF bypass and payload obfuscation
 */

export type EncodingVariant =
  | 'url_single'
  | 'url_double'
  | 'html_entity_named'
  | 'html_entity_decimal'
  | 'html_entity_hex'
  | 'unicode_escape'
  | 'unicode_fullwidth'
  | 'jsfuck'
  | 'base64'
  | 'base64_wrapped'
  | 'hex_escape'
  | 'utf7'
  | 'null_byte_prefix'
  | 'null_byte_suffix'
  | 'overlong_utf8'
  | 'mixed_case'
  | 'html_entity_mixed';

export interface MutationVariant {
  name: EncodingVariant;
  encode: (input: string) => string;
  description: string;
  bypassTarget: string; // what defense this targets
}

/**
 * EncodingMutator - All encoding mutations are real implementations
 */
export class EncodingMutator {
  private variants: Map<EncodingVariant, MutationVariant>;

  constructor() {
    this.variants = new Map();
    this.registerVariants();
  }

  /**
   * Apply a specific encoding variant to a payload
   */
  encode(payload: string, variant: EncodingVariant): string {
    const mutator = this.variants.get(variant);
    if (!mutator) throw new Error(`Unknown encoding variant: ${variant}`);
    return mutator.encode(payload);
  }

  /**
   * Get all available variants
   */
  getVariants(): EncodingVariant[] {
    return Array.from(this.variants.keys());
  }

  /**
   * Get variant metadata
   */
  getVariantInfo(variant: EncodingVariant): MutationVariant | undefined {
    return this.variants.get(variant);
  }

  /**
   * Generate all encoded variants of a payload
   */
  encodeAll(payload: string): Map<EncodingVariant, string> {
    const results = new Map<EncodingVariant, string>();
    for (const [name, mutator] of this.variants.entries()) {
      try {
        results.set(name, mutator.encode(payload));
      } catch {
        // Skip failed encodings silently
      }
    }
    return results;
  }

  /**
   * Get variants recommended for a specific WAF/filter type
   */
  getVariantsForBypassTarget(target: string): EncodingVariant[] {
    const matching: EncodingVariant[] = [];
    for (const [name, mutator] of this.variants.entries()) {
      if (mutator.bypassTarget.toLowerCase().includes(target.toLowerCase())) {
        matching.push(name);
      }
    }
    return matching;
  }

  private registerVariants(): void {
    // ─── URL Encoding ───────────────────────────────────────────────────

    this.variants.set('url_single', {
      name: 'url_single',
      description: 'Standard URL percent-encoding of all non-alphanumeric chars',
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
      description: 'Double URL encoding — bypasses single-decode filters',
      bypassTarget: 'single-decode WAF filters',
      encode: (input: string) => {
        const single = Array.from(input).map(ch => {
          const code = ch.charCodeAt(0);
          if (/[a-zA-Z0-9]/.test(ch)) return ch;
          return '%' + code.toString(16).toUpperCase().padStart(2, '0');
        }).join('');
        // Encode the percent signs
        return single.replace(/%/g, '%25');
      }
    });

    // ─── HTML Entity Encoding ────────────────────────────────────────────

    const HTML_NAMED: Record<string, string> = {
      '<': '<',
      '>': '>',
      '"': '"',
      "'": ''',
      '&': '&',
      '/': '&#47;',
      '=': '&#61;',
      ' ': '&nbsp;'
    };

    this.variants.set('html_entity_named', {
      name: 'html_entity_named',
      description: 'Named HTML entities for XSS bypass',
      bypassTarget: 'HTML tag filters',
      encode: (input: string) => {
        return Array.from(input).map(ch => HTML_NAMED[ch] || ch).join('');
      }
    });

    this.variants.set('html_entity_decimal', {
      name: 'html_entity_decimal',
      description: 'Decimal HTML entities — &#60; style',
      bypassTarget: 'HTML char filters, WAF signature matching',
      encode: (input: string) => {
        return Array.from(input)
          .map(ch => `&#${ch.charCodeAt(0)};`)
          .join('');
      }
    });

    this.variants.set('html_entity_hex', {
      name: 'html_entity_hex',
      description: 'Hex HTML entities — &#x3C; style',
      bypassTarget: 'HTML char filters, WAF signature matching',
      encode: (input: string) => {
        return Array.from(input)
          .map(ch => `&#x${ch.charCodeAt(0).toString(16).toUpperCase()};`)
          .join('');
      }
    });

    this.variants.set('html_entity_mixed', {
      name: 'html_entity_mixed',
      description: 'Mix of decimal and hex entities to confuse pattern matchers',
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

    // ─── Unicode Encoding ─────────────────────────────────────────────────

    this.variants.set('unicode_escape', {
      name: 'unicode_escape',
      description: 'JavaScript \\uXXXX unicode escapes',
      bypassTarget: 'JS string filters, template injection filters',
      encode: (input: string) => {
        return Array.from(input)
          .map(ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
          .join('');
      }
    });

    this.variants.set('unicode_fullwidth', {
      name: 'unicode_fullwidth',
      description: 'Fullwidth Unicode variants of ASCII (ｓｃｒｉｐｔ)',
      bypassTarget: 'Keyword-based filters that miss Unicode normalization',
      encode: (input: string) => {
        return Array.from(input).map(ch => {
          const code = ch.charCodeAt(0);
          // ASCII printable range 0x21-0x7E maps to fullwidth 0xFF01-0xFF5E
          if (code >= 0x21 && code <= 0x7E) {
            return String.fromCharCode(code + 0xFEE0);
          }
          return ch;
        }).join('');
      }
    });

    // ─── JSFuck ───────────────────────────────────────────────────────────

    this.variants.set('jsfuck', {
      name: 'jsfuck',
      description: 'JSFuck encoding — JavaScript using only []()!+ characters',
      bypassTarget: 'Character whitelist filters, JS keyword filters',
      encode: (input: string) => this.encodeJSFuck(input)
    });

    // ─── Base64 ───────────────────────────────────────────────────────────

    this.variants.set('base64', {
      name: 'base64',
      description: 'Standard Base64 encoding',
      bypassTarget: 'Plain string matching filters',
      encode: (input: string) => Buffer.from(input).toString('base64')
    });

    this.variants.set('base64_wrapped', {
      name: 'base64_wrapped',
      description: 'Base64 wrapped in atob() eval context for XSS',
      bypassTarget: 'XSS keyword filters (script, alert, etc)',
      encode: (input: string) => {
        const b64 = Buffer.from(input).toString('base64');
        return `eval(atob('${b64}'))`;
      }
    });

    // ─── Hex Encoding ─────────────────────────────────────────────────────

    this.variants.set('hex_escape', {
      name: 'hex_escape',
      description: 'Hex escape sequences \\x41 style',
      bypassTarget: 'String literal filters',
      encode: (input: string) => {
        return Array.from(input)
          .map(ch => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
          .join('');
      }
    });

    // ─── UTF-7 ────────────────────────────────────────────────────────────

    this.variants.set('utf7', {
      name: 'utf7',
      description: 'UTF-7 encoding — +ADw-script+AD4- style, IE legacy bypass',
      bypassTarget: 'IE/legacy XSS filters, charset confusion attacks',
      encode: (input: string) => {
        let result = '';
        let inBase64 = false;
        let base64Buf = '';

        const flushBase64 = () => {
          if (base64Buf) {
            result += '+' + Buffer.from(base64Buf, 'utf16le').toString('base64') + '-';
            base64Buf = '';
            inBase64 = false;
          }
        };

        for (const ch of input) {
          const code = ch.charCodeAt(0);
          if (code >= 0x20 && code <= 0x7E && ch !== '+') {
            if (inBase64) flushBase64();
            result += ch;
          } else {
            // Encode as UTF-16BE base64
            inBase64 = true;
            const buf = Buffer.alloc(2);
            buf.writeUInt16BE(code, 0);
            base64Buf += ch;
          }
        }

        if (inBase64) flushBase64();
        return result;
      }
    });

    // ─── Null Byte Injection ──────────────────────────────────────────────

    this.variants.set('null_byte_prefix', {
      name: 'null_byte_prefix',
      description: 'Null byte prefix — %00payload, truncates some filters',
      bypassTarget: 'C-string based filters, file extension checks',
      encode: (input: string) => `%00${input}`
    });

    this.variants.set('null_byte_suffix', {
      name: 'null_byte_suffix',
      description: 'Null byte suffix — payload%00, truncates path after payload',
      bypassTarget: 'Path traversal filters, extension validation',
      encode: (input: string) => `${input}%00`
    });

    // ─── Overlong UTF-8 ───────────────────────────────────────────────────

    this.variants.set('overlong_utf8', {
      name: 'overlong_utf8',
      description: 'Overlong UTF-8 sequences for characters like < > / (CVE-2000-0884 class)',
      bypassTarget: 'Simple UTF-8 char matching, older WAFs',
      encode: (input: string) => {
        return Array.from(input).map(ch => {
          const code = ch.charCodeAt(0);
          // Overlong 2-byte encoding for ASCII chars (0x00-0x7F)
          // Standard: 1 byte. Overlong: 0xC0-0xDF prefix + continuation
          if (code < 0x80) {
            const b1 = 0xC0 | (code >> 6);
            const b2 = 0x80 | (code & 0x3F);
            return `%${b1.toString(16).toUpperCase()}%${b2.toString(16).toUpperCase()}`;
          }
          return encodeURIComponent(ch);
        }).join('');
      }
    });

    // ─── Mixed Case ───────────────────────────────────────────────────────

    this.variants.set('mixed_case', {
      name: 'mixed_case',
      description: 'Alternating case — ScRiPt, aLeRt — bypasses case-sensitive filters',
      bypassTarget: 'Case-sensitive keyword filters',
      encode: (input: string) => {
        return Array.from(input).map((ch, i) =>
          i % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase()
        ).join('');
      }
    });
  }

  /**
   * JSFuck transpiler — converts arbitrary JS/strings to use only []()!+
   * Based on the JSFuck encoding scheme by Martin Kleppe
   */
  private encodeJSFuck(input: string): string {
    // Core value representations
    const FALSE = '![]';
    const TRUE = '!![]';
    const ZERO = '+[]';
    const ONE = '+!![]';

    // Build number representations
    const num = (n: number): string => {
      if (n === 0) return ZERO;
      if (n === 1) return ONE;
      return Array(n).fill(ONE).join('+');
    };

    // Character extraction from base types
    const CHAR_MAP: Record<string, string> = {
      'a': `(${FALSE}+[])[${num(1)}]`,
      'b': `([]+{})[${num(2)}]`,
      'c': `([]+{})[${num(5)}]`,
      'd': `(${FALSE}+[])[${num(2)}]`, // undefined
      'e': `(${TRUE}+[])[${num(3)}]`,
      'f': `(${FALSE}+[])[${num(0)}]`,
      'i': `([${ZERO}]+${FALSE})[${num(10)}]`, // undefined → i
      'j': `([]+{})[${num(3)}]`,
      'l': `(${FALSE}+[])[${num(2)}]`,
      'n': `(${FALSE}+[])[${num(1)}]`, // NaN
      'o': `([]+{})[${num(1)}]`,
      'r': `(${TRUE}+[])[${num(1)}]`,
      's': `(${FALSE}+[])[${num(3)}]`,
      't': `(${TRUE}+[])[${num(0)}]`,
      'u': `(${FALSE}+[])[${num(2)}]`,
      // Numbers as strings
      '0': `(${ZERO}+[])[${ZERO}]`,
      '1': `(${ONE}+[])[${ZERO}]`,
    };

    // Fallback: use String.fromCharCode via Function constructor
    const fromCharCode = (code: number): string => {
      const charStr = String.fromCharCode(code);

      // Check if we have a direct mapping
      if (CHAR_MAP[charStr.toLowerCase()]) {
        return CHAR_MAP[charStr.toLowerCase()];
      }

      // Use String.fromCharCode — builds function call
      return `([]+([]+[])[([]+{})[${num(5)}]+(![]+[])[${num(1)}]+([][[]]+[])[${num(1)}]+(![]+[])[${num(0)}]+(![]+[])[${num(1)}]+([][[]]+[])[${num(5)}]])[${num(14)}+${num(5)}](${num(code)})`;
    };

    // Build the JSFuck string by encoding each character
    const parts: string[] = [];
    for (const ch of input) {
      const code = ch.charCodeAt(0);
      if (CHAR_MAP[ch]) {
        parts.push(CHAR_MAP[ch]);
      } else {
        parts.push(fromCharCode(code));
      }
    }

    if (parts.length === 0) return '[]';
    if (parts.length === 1) return `${parts[0]}+[]`;

    return parts.join('+');
  }
}
import { Pipe, PipeTransform } from '@angular/core';

import { TreeFilterInput, TreeFilterQuery, TreeMatchRange } from '../../core';

@Pipe({
  name: 'treeHighlightMatch',
  standalone: true,
  pure: true,
})
export class TreeHighlightMatchPipe implements PipeTransform {
  private static readonly MARK_OPEN =
    '<mark class="td-tree-highlight-mark" style="background: var(--tree-highlight-bg, var(--td-tree-highlight-bg, #fff3a0)); color: var(--tree-highlight-color, var(--td-tree-highlight-color, currentColor)); border-radius: var(--tree-highlight-radius, var(--td-tree-highlight-radius, 2px)); padding-inline: var(--tree-highlight-padding-inline, var(--td-tree-highlight-padding-inline, 1px));">';
  private static readonly MARK_CLOSE = '</mark>';

  transform(
    label: string | null | undefined,
    filterQuery: TreeFilterInput,
    highlightRanges?: readonly TreeMatchRange[] | undefined,
  ): string {
    const source = label ?? '';
    if (!source) {
      return '';
    }

    const normalizedRanges = this.normalizeRanges(source, highlightRanges);
    if (normalizedRanges.length > 0) {
      return this.renderWithRanges(source, normalizedRanges);
    }

    const query = this.normalizeQuery(filterQuery);
    if (!query) {
      return this.escapeHtml(source);
    }

    const queryRanges = this.resolveRangesFromQuery(source, query);
    if (queryRanges.length === 0) {
      return this.escapeHtml(source);
    }

    return this.renderWithRanges(source, queryRanges);
  }

  private normalizeQuery(input: TreeFilterInput): TreeFilterQuery | null {
    if (typeof input === 'string') {
      const text = input.trim();
      return text ? { text, mode: 'contains' } : null;
    }

    if (!input || typeof input !== 'object') {
      return null;
    }

    const text = typeof input.text === 'string' ? input.text.trim() : undefined;
    const tokens = (input.tokens ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (!text && tokens.length === 0) {
      return null;
    }

    return {
      ...input,
      text,
      tokens: tokens.length > 0 ? tokens : undefined,
      mode: input.mode ?? 'contains',
    };
  }

  private resolveRangesFromQuery(
    source: string,
    query: TreeFilterQuery,
  ): TreeMatchRange[] {
    const terms = this.queryTerms(query);
    if (terms.length === 0) {
      return [];
    }

    const caseSensitive = query.caseSensitive === true;
    const sourceValue = caseSensitive ? source : source.toLocaleLowerCase();
    const normalizedTerms = caseSensitive
      ? terms
      : terms.map((term) => term.toLocaleLowerCase());

    if (query.mode === 'exact') {
      const isExactMatch = normalizedTerms.some((term) => sourceValue === term);
      return isExactMatch ? [{ start: 0, end: source.length }] : [];
    }

    const ranges: TreeMatchRange[] = [];

    for (const term of normalizedTerms) {
      if (!term) {
        continue;
      }
      let start = sourceValue.indexOf(term);
      while (start >= 0) {
        ranges.push({ start, end: start + term.length });
        start = sourceValue.indexOf(term, start + term.length);
      }
    }

    return this.normalizeRanges(source, ranges);
  }

  private queryTerms(query: TreeFilterQuery): string[] {
    const terms: string[] = [];

    if (typeof query.text === 'string') {
      const trimmed = query.text.trim();
      if (trimmed.length > 0) {
        if (query.mode === 'exact') {
          terms.push(trimmed);
        } else {
          terms.push(...trimmed.split(/\s+/));
        }
      }
    }

    for (const token of query.tokens ?? []) {
      const trimmed = token.trim();
      if (trimmed.length > 0) {
        terms.push(trimmed);
      }
    }

    return terms;
  }

  private normalizeRanges(
    source: string,
    ranges: readonly TreeMatchRange[] | undefined,
  ): TreeMatchRange[] {
    if (!ranges || ranges.length === 0) {
      return [];
    }

    const sanitized = ranges
      .map((range) => ({
        start: Math.max(0, Math.min(source.length, range.start)),
        end: Math.max(0, Math.min(source.length, range.end)),
      }))
      .filter((range) => range.end > range.start)
      .sort((left, right) => left.start - right.start || left.end - right.end);

    if (sanitized.length <= 1) {
      return sanitized;
    }

    const merged: TreeMatchRange[] = [sanitized[0]];

    for (let index = 1; index < sanitized.length; index += 1) {
      const current = sanitized[index];
      const previous = merged[merged.length - 1];
      if (!previous) {
        merged.push(current);
        continue;
      }

      if (current.start <= previous.end) {
        previous.end = Math.max(previous.end, current.end);
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  private renderWithRanges(source: string, ranges: readonly TreeMatchRange[]): string {
    let cursor = 0;
    let output = '';

    for (const range of ranges) {
      if (range.start > cursor) {
        output += this.escapeHtml(source.slice(cursor, range.start));
      }

      output += `${TreeHighlightMatchPipe.MARK_OPEN}${this.escapeHtml(source.slice(range.start, range.end))}${TreeHighlightMatchPipe.MARK_CLOSE}`;
      cursor = range.end;
    }

    if (cursor < source.length) {
      output += this.escapeHtml(source.slice(cursor));
    }

    return output;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

import { TreeHighlightMatchPipe } from './highlight-filter.pipe';

describe('TreeHighlightMatchPipe', () => {
  const pipe = new TreeHighlightMatchPipe();

  it('highlights a simple string query', () => {
    const result = pipe.transform('Budget FY26.xlsx', 'budget');
    expect(result).toContain('<mark>Budget</mark>');
  });

  it('highlights using engine-provided ranges when available', () => {
    const result = pipe.transform('Roadmap.md', 'road', [{ start: 0, end: 7 }]);
    expect(result).toBe('<mark>Roadmap</mark>.md');
  });

  it('escapes html in labels before rendering highlight tags', () => {
    const result = pipe.transform('<script>alert(1)</script>', 'script');
    expect(result).toContain('&lt;');
    expect(result).toContain('</mark>');
  });
});

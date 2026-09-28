import { describe, it, expect } from 'vitest';
import { latexLanguage, bibtexLanguage, getLanguageForFile } from '@/lib/latex-language';

describe('latexLanguage', () => {
  it('is defined as a StreamLanguage', () => {
    expect(latexLanguage).toBeDefined();
    expect(latexLanguage.name).toBeDefined();
  });
});

describe('bibtexLanguage', () => {
  it('is defined as a StreamLanguage', () => {
    expect(bibtexLanguage).toBeDefined();
    expect(bibtexLanguage.name).toBeDefined();
  });
});

describe('getLanguageForFile', () => {
  it('returns LaTeX for .tex files', () => {
    expect(getLanguageForFile('main.tex')).toBe(latexLanguage);
  });
  it('returns BibTeX for .bib files', () => {
    expect(getLanguageForFile('refs.bib')).toBe(bibtexLanguage);
  });
  it('returns BibTeX for .bst files', () => {
    expect(getLanguageForFile('style.bst')).toBe(bibtexLanguage);
  });
  it('defaults to LaTeX for unknown', () => {
    expect(getLanguageForFile('readme.txt')).toBe(latexLanguage);
  });
  it('handles nested paths', () => {
    expect(getLanguageForFile('refs/main.bib')).toBe(bibtexLanguage);
  });
});

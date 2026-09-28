import { describe, it, expect } from 'vitest';
import { latexCompletionSource } from '@/lib/latex-completions';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function complete(doc: string, pos: number) {
  return latexCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, false));
}

const FMT = ['\\textbf','\\textit','\\underline','\\emph','\\texttt','\\textsc'];
const STRUCT = ['\\documentclass','\\usepackage','\\title','\\author','\\date','\\maketitle'];
const REFS = ['\\label','\\ref','\\cite','\\bibliography','\\bibliographystyle','\\footnote'];
const SPACE = ['\\hspace','\\vspace','\\newpage','\\linebreak'];

describe('text formatting completions', () => {
  FMT.forEach(c => { it(`has ${c}`, () => { expect(complete(c.slice(0,5),5)!.options.some(o=>o.label===c)).toBe(true); }); });
});
describe('document structure completions', () => {
  STRUCT.forEach(c => { it(`has ${c}`, () => { expect(complete(c.slice(0,5),5)!.options.some(o=>o.label===c)).toBe(true); }); });
});
describe('reference completions', () => {
  REFS.forEach(c => { it(`has ${c}`, () => { expect(complete(c.slice(0,4),4)!.options.some(o=>o.label===c)).toBe(true); }); });
});
describe('spacing completions', () => {
  SPACE.forEach(c => { it(`has ${c}`, () => { expect(complete(c.slice(0,4),4)!.options.some(o=>o.label===c)).toBe(true); }); });
});

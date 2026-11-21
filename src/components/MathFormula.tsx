import React, { useMemo } from 'react';
import katex from 'katex';

interface MathFormulaProps {
  tex?: string;
  latex?: string;
  displayMode?: boolean;
  className?: string;
}

export const MathFormula: React.FC<MathFormulaProps> = ({
  tex,
  latex,
  displayMode = true,
  className = '',
}) => {
  const formulaSource = tex ?? latex ?? '';

  const html = useMemo(() => {
    if (!formulaSource) return '';
    try {
      return katex.renderToString(formulaSource, {
        displayMode,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return '';
    }
  }, [formulaSource, displayMode]);

  if (!html) {
    return (
      <code className={`font-mono text-sm text-cyan-700 dark:text-cyan-300 ${className}`}>
        {formulaSource}
      </code>
    );
  }

  return (
    <div
      className={`overflow-x-auto max-w-full py-1 text-slate-900 dark:text-white ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

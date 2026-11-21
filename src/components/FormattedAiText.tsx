import React from 'react';

interface FormattedAiTextProps {
  text: string;
}

function renderInlineFormatting(line: string): React.ReactNode[] {
  const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-sky-700 dark:text-sky-300 font-mono text-[13px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const FormattedAiText: React.FC<FormattedAiTextProps> = ({ text }) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        elements.push(
          <pre
            key={`code-${index}`}
            className="my-2.5 p-3 rounded-lg bg-slate-900 text-slate-100 border border-slate-700/80 overflow-x-auto font-mono text-xs leading-relaxed"
          >
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        );
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      return;
    }

    if (!trimmed) {
      elements.push(<div key={`sp-${index}`} className="h-2" />);
      return;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={index} className="text-sm font-semibold text-slate-900 dark:text-white mt-3 mb-1">
          {renderInlineFormatting(trimmed.slice(4))}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const content = trimmed.replace(/^#+\s+/, '');
      elements.push(
        <h3 key={index} className="text-base font-semibold text-slate-900 dark:text-white mt-3 mb-1">
          {renderInlineFormatting(content)}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={index} className="flex items-start gap-2 pl-1 my-1">
          <span className="text-sky-600 dark:text-sky-400 select-none mt-0.5" aria-hidden="true">
            •
          </span>
          <span className="flex-1 leading-relaxed">{renderInlineFormatting(trimmed.slice(2))}</span>
        </div>
      );
      return;
    }

    elements.push(
      <p key={index} className="leading-relaxed my-1">
        {renderInlineFormatting(rawLine)}
      </p>
    );
  });

  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(
      <pre
        key="code-tail"
        className="my-2.5 p-3 rounded-lg bg-slate-900 text-slate-100 border border-slate-700/80 overflow-x-auto font-mono text-xs leading-relaxed"
      >
        <code>{codeBuffer.join('\n')}</code>
      </pre>
    );
  }

  return <div className="text-sm text-slate-700 dark:text-slate-200 break-words">{elements}</div>;
};

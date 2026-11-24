import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { bi } from '../i18n/translations';
import type { LanguageMode } from '../types/study';

interface ViewErrorBoundaryProps {
  language: LanguageMode;
  viewKey: string;
  onResetHome?: () => void;
  children: React.ReactNode;
}

interface ViewErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ViewErrorBoundary extends React.Component<
  ViewErrorBoundaryProps,
  ViewErrorBoundaryState
> {
  constructor(props: ViewErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ViewErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error || 'Unexpected error');
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown): void {
    console.error('View render error:', error);
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps): void {
    if (prevProps.viewKey !== this.props.viewKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const { language, onResetHome } = this.props;
      return (
        <div className="max-w-xl mx-auto my-8 rounded-2xl bg-white dark:bg-[#111827] border border-red-500/30 p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-red-500/12 text-red-500 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {bi(
                language,
                'এই পেজটি লোড করতে সাময়িক সমস্যা হয়েছে',
                'This section encountered an unexpected error'
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {bi(
                language,
                'আপনার সংরক্ষিত ডেটা নিরাপদ আছে। নিচের বাটনে ক্লিক করে পেজটি আবার লোড করুন।',
                'Your saved study data is safe. Tap below to reload this view.'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleRetry}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{bi(language, 'পুনরায় চেষ্টা করুন', 'Reload View')}</span>
            </button>
            {onResetHome && (
              <button
                type="button"
                onClick={() => {
                  this.handleRetry();
                  onResetHome();
                }}
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span>{bi(language, 'ড্যাশবোর্ডে ফিরুন', 'Back to Dashboard')}</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f5edd6] p-8">
          <p className="text-[#3d2b1f] text-center">문제가 발생했어요. 페이지를 새로고침해 주세요.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#b5541e] text-white rounded-lg text-sm font-medium hover:bg-[#9a4419] transition-colors"
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  resetKey?: string; // route key — resets error state on navigation
}

interface State {
  hasError: boolean;
  resetKey?: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, resetKey: undefined };

  static getDerivedStateFromError(_: Error, ): Partial<State> {
    return { hasError: true };
  }

  // Reset when the route (resetKey) changes
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, resetKey: props.resetKey };
    }
    return null;
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f5edd6] p-8">
          <p className="text-[#3d2b1f] text-center font-semibold">앗, 문제가 생겼어요.</p>
          <p className="text-sm text-[#7a5c46] text-center">잠깐 오류가 발생했어요. 아래 버튼을 눌러주세요.</p>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.hash = '/dashboard'; }}
              className="w-full px-4 py-2.5 bg-[#b5541e] text-[#fdf6e8] rounded-lg text-sm font-bold hover:bg-[#9a4318] transition-colors border-2 border-[#9a4318]"
            >
              대시보드로 이동
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2.5 bg-[#fdf6e8] text-[#7a5c46] rounded-lg text-sm font-medium hover:bg-[#f5edd6] transition-colors border-2 border-[#b07840]"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

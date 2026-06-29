import { Component, type ReactNode } from 'react';
import './ErrorBoundary.css';

const INITIAL_HREF = window.location.href;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  handleReset = () => {
    window.location.href = INITIAL_HREF;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="err">
          <div className="err__scanlines" />
          <div className="err__noise" />
          <h1 className="err__title" data-text="SYSTEM FAILURE">
            SYSTEM FAILURE
          </h1>
          <div className="err__code">
            ERROR://{this.state.error?.message || 'UNKNOWN'}
          </div>
          <button className="err__btn" onClick={this.handleReset}>
            RETURN TO BASE
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

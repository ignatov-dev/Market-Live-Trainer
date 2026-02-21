import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';
import { AuthProvider } from './providers/AuthProvider';
import { WebsocketProvider } from './providers/WebsocketProvider';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <AuthProvider>
        <WebsocketProvider>
          <App />
        </WebsocketProvider>
      </AuthProvider>
    </Provider>
  </React.StrictMode>,
);

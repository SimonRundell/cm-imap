/**
 * @module main
 * @fileoverview Application entry point. Mounts the React 18 root inside
 * React.StrictMode and renders the top-level App component into #root.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

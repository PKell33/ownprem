import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import Apps from './pages/Apps';
import Settings from './pages/Settings';
import { useWebSocket } from './hooks/useWebSocket';

function App() {
  const { connect } = useWebSocket();

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="servers" element={<Servers />} />
        <Route path="apps" element={<Apps />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;

import { useState } from 'react';
import { Plus, Copy, Check } from 'lucide-react';
import { useServers, useDeployments } from '../hooks/useApi';
import { api } from '../api/client';
import ServerCard from '../components/ServerCard';
import Modal from '../components/Modal';

export default function Servers() {
  const { data: servers, isLoading, refetch } = useServers();
  const { data: deployments } = useDeployments();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bootstrapCommand, setBootstrapCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAddServer = async (name: string, host: string) => {
    try {
      const result = await api.addServer({ name, host });
      setBootstrapCommand(result.bootstrapCommand);
      refetch();
    } catch (err) {
      console.error('Failed to add server:', err);
    }
  };

  const copyToClipboard = () => {
    if (bootstrapCommand) {
      navigator.clipboard.writeText(bootstrapCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Servers</h1>
          <p className="text-gray-400">Manage your infrastructure</p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-bitcoin hover:bg-bitcoin/90 text-black font-medium rounded transition-colors"
        >
          <Plus size={20} />
          Add Server
        </button>
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers?.map((server) => {
            const serverDeployments = deployments?.filter((d) => d.serverId === server.id) || [];
            return (
              <ServerCard
                key={server.id}
                server={server}
                deploymentCount={serverDeployments.length}
              />
            );
          })}
        </div>
      )}

      {/* Add Server Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setBootstrapCommand(null);
        }}
        title="Add Server"
      >
        {bootstrapCommand ? (
          <div className="space-y-4">
            <p className="text-gray-400">
              Run this command on the new server to install the agent:
            </p>
            <div className="relative">
              <pre className="bg-gray-900 p-4 rounded-lg text-sm overflow-x-auto">
                {bootstrapCommand}
              </pre>
              <button
                onClick={copyToClipboard}
                className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
              >
                {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
            </div>
            <button
              onClick={() => {
                setAddModalOpen(false);
                setBootstrapCommand(null);
              }}
              className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <AddServerForm onSubmit={handleAddServer} />
        )}
      </Modal>
    </div>
  );
}

function AddServerForm({ onSubmit }: { onSubmit: (name: string, host: string) => void }) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && host) {
      onSubmit(name, host);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Server Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="server-1"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-bitcoin"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Host / IP Address</label>
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="192.168.1.100"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-bitcoin"
        />
      </div>
      <button
        type="submit"
        disabled={!name || !host}
        className="w-full px-4 py-2 bg-bitcoin hover:bg-bitcoin/90 disabled:bg-gray-700 disabled:text-gray-500 text-black font-medium rounded transition-colors"
      >
        Add Server
      </button>
    </form>
  );
}

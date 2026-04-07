import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, FileText, Users, GitCompareArrows, ArrowLeft, Loader2, Search, X, Check, Building2, Mail, Phone, MapPin, Calendar } from 'lucide-react';
import { getAuthHeaders } from '../lib/session';
import { useAuth } from '../contexts/AuthContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OrgItem {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  cnpj: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
  plan: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
  ownersCount: number;
  farmsCount: number;
}

async function orgApiCall<T>(
  path: string,
  options?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/organizations${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...((options?.headers as Record<string, string>) ?? {}) },
  });
  const json = await res.json().catch(() => ({ ok: false, error: 'Erro de parse' }));
  return json as { ok: true; data: T } | { ok: false; error: string };
}

// ─── Comparar Clientes ───────────────────────────────────────────────────────

interface CompararClientesProps {
  onBack: () => void;
}

const CompararClientes: React.FC<CompararClientesProps> = ({ onBack }) => {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgs, setSelectedOrgs] = useState<OrgItem[]>([]);

  const loadOrgs = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      const res = await orgApiCall<OrgItem[]>('?limit=100');
      if (res.ok) setOrgs(res.data || []);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return orgs;
    const term = searchTerm.toLowerCase();
    return orgs.filter(o =>
      o.name.toLowerCase().includes(term) ||
      o.cnpj?.toLowerCase().includes(term) ||
      o.city?.toLowerCase().includes(term) ||
      o.state?.toLowerCase().includes(term)
    );
  }, [orgs, searchTerm]);

  const toggleOrg = (org: OrgItem) => {
    setSelectedOrgs(prev =>
      prev.find(o => o.id === org.id)
        ? prev.filter(o => o.id !== org.id)
        : prev.length < 4 ? [...prev, org] : prev
    );
  };

  const isSelected = (id: string) => selectedOrgs.some(o => o.id === id);

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '—'; }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Comparar Clientes</h2>
          <p className="text-xs text-gray-500">Selecione até 4 organizações para comparar</p>
        </div>
      </div>

      {/* Seleção */}
      {selectedOrgs.length < 2 ? (
        <div className="flex-1 flex flex-col">
          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar organização..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Selected pills */}
          {selectedOrgs.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedOrgs.map(o => (
                <span key={o.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-full">
                  {o.name}
                  <button onClick={() => toggleOrg(o)} className="hover:text-gray-300"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 mb-3">
            {selectedOrgs.length === 0 ? 'Selecione pelo menos 2 organizações' : `${selectedOrgs.length}/4 selecionadas — selecione mais ${2 - selectedOrgs.length > 0 ? 2 - selectedOrgs.length : 0}`}
          </p>

          {/* Org list */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filtered.map(org => (
                <button
                  key={org.id}
                  onClick={() => toggleOrg(org)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    isSelected(org.id)
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 bg-white hover:border-gray-400'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected(org.id) ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                  }`}>
                    {isSelected(org.id) && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{org.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {[org.city, org.state].filter(Boolean).join(', ') || 'Sem localização'}
                      {org.cnpj ? ` · ${org.cnpj}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
                    <span>{org.farmsCount} fazenda{org.farmsCount !== 1 ? 's' : ''}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${org.ativo ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {org.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">Nenhuma organização encontrada</p>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Tabela de comparação */
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-wrap gap-2">
              {selectedOrgs.map(o => (
                <span key={o.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-full">
                  {o.name}
                  <button onClick={() => toggleOrg(o)} className="hover:text-gray-300"><X size={12} /></button>
                </span>
              ))}
            </div>
            {selectedOrgs.length < 4 && (
              <button
                onClick={() => setSelectedOrgs([])}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Alterar seleção
              </button>
            )}
          </div>

          {/* Comparison table */}
          <div className="flex-1 overflow-auto rounded-2xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Campo</th>
                  {selectedOrgs.map(o => (
                    <th key={o.id} className="text-left p-4 text-xs font-semibold text-gray-900 min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-gray-400" />
                        {o.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <CompareRow label="CNPJ" icon={<Building2 size={14} />} values={selectedOrgs.map(o => o.cnpj || '—')} />
                <CompareRow label="E-mail" icon={<Mail size={14} />} values={selectedOrgs.map(o => o.email || '—')} />
                <CompareRow label="Telefone" icon={<Phone size={14} />} values={selectedOrgs.map(o => o.phone || '—')} />
                <CompareRow label="Cidade" icon={<MapPin size={14} />} values={selectedOrgs.map(o => o.city || '—')} />
                <CompareRow label="Estado" icon={<MapPin size={14} />} values={selectedOrgs.map(o => o.state || '—')} />
                <CompareRow label="Endereço" icon={<MapPin size={14} />} values={selectedOrgs.map(o => o.address || '—')} />
                <CompareRow label="Plano" icon={<FileText size={14} />} values={selectedOrgs.map(o => o.plan || '—')} />
                <CompareRow label="Status" values={selectedOrgs.map(o => (
                  <span key={o.id} className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${o.ativo ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {o.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                ))} />
                <CompareRow label="Fazendas" values={selectedOrgs.map(o => (
                  <span key={o.id} className="text-sm font-semibold text-gray-900">{o.farmsCount}</span>
                ))} />
                <CompareRow label="Sócios" values={selectedOrgs.map(o => (
                  <span key={o.id} className="text-sm font-semibold text-gray-900">{o.ownersCount}</span>
                ))} />
                <CompareRow label="Criado em" icon={<Calendar size={14} />} values={selectedOrgs.map(o => formatDate(o.createdAt))} />
                <CompareRow label="Atualizado" icon={<Calendar size={14} />} values={selectedOrgs.map(o => formatDate(o.updatedAt))} />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const CompareRow: React.FC<{ label: string; icon?: React.ReactNode; values: React.ReactNode[] }> = ({ label, icon, values }) => (
  <tr className="hover:bg-gray-50/50 transition-colors">
    <td className="p-4 text-xs font-medium text-gray-500">
      <div className="flex items-center gap-2">
        {icon && <span className="text-gray-400">{icon}</span>}
        {label}
      </div>
    </td>
    {values.map((v, i) => (
      <td key={i} className="p-4 text-sm text-gray-800">{v}</td>
    ))}
  </tr>
);

// ─── Cards e componente principal ─────────────────────────────────────────────

const AreaCertificadosDesktop: React.FC = () => {
  const [activeView, setActiveView] = useState<string | null>(null);

  const cards = [
    {
      id: 'tabela-precificacao',
      title: 'Tabela de Precificação Sistema',
      description: 'Visualize e gerencie tabelas de precificação do sistema.',
      icon: <Table size={24} />,
    },
    {
      id: 'elaboracao-bpo',
      title: 'Elaboração proposta BPO',
      description: 'Elabore propostas de BPO para suas organizações.',
      icon: <FileText size={24} />,
    },
    {
      id: 'meus-clientes',
      title: 'Minhas Organizações',
      description: 'Acesse a lista de suas organizações.',
      icon: <Users size={24} />,
    },
    {
      id: 'comparar-clientes',
      title: 'Comparar Clientes',
      description: 'Compare dados de suas organizações lado a lado para análise rápida.',
      icon: <GitCompareArrows size={24} />,
      onClick: () => setActiveView('comparar-clientes'),
    },
  ];

  if (activeView === 'comparar-clientes') {
    return (
      <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto">
        <CompararClientes onBack={() => setActiveView(null)} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-8 md:p-12 max-w-7xl mx-auto">
      <header className="space-y-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Área Certificados</h1>
        <p className="text-sm text-gray-500 max-w-2xl">Ferramentas de certificação e precificação</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map(card => (
          <button
            key={card.id}
            type="button"
            onClick={card.onClick}
            disabled={!card.onClick}
            className={`group relative flex flex-col p-6 rounded-2xl border border-gray-200 bg-white text-left w-full transition-all duration-200 ${
              card.onClick
                ? 'hover:border-gray-800 hover:shadow-sm cursor-pointer'
                : 'opacity-90 cursor-default'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center justify-center text-gray-500">{card.icon}</div>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{card.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-5">{card.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AreaCertificadosDesktop;

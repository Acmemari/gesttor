import React, { useState, useEffect } from 'react';
import {
  Users,
  User,
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Mail,
  Phone,
  MapPin,
  Search,
} from 'lucide-react';
import { Client, Farm } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface AnalystManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface AnalystData {
  id: string;
  name: string;
  email: string;
  clients: ClientData[];
}

interface ClientData extends Client {
  farms: Farm[];
}

const AnalystManagement: React.FC<AnalystManagementProps> = ({ onToast }) => {
  const { user: currentUser } = useAuth();
  const [analysts, setAnalysts] = useState<AnalystData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAnalysts, setExpandedAnalysts] = useState<Set<string>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      loadData();
    } else if (currentUser) {
      setError('Acesso negado. Apenas administradores podem acessar esta página.');
      setIsLoading(false);
    }
  }, [currentUser]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 1. Buscar apenas usuários com qualification='analista' (não incluir administradores que não são analistas)
      const { data: analystsData, error: analystsError } = await supabase
        .from('user_profiles')
        .select('id, name, email')
        .eq('qualification', 'analista')
        .order('name', { ascending: true });

      if (analystsError) {
        console.error('[AnalystManagement] Error loading analysts:', analystsError);
        setError(`Erro ao carregar analistas: ${analystsError.message}`);
        return;
      }

      if (!analystsData || analystsData.length === 0) {
        setAnalysts([]);
        setIsLoading(false);
        return;
      }

      // 2. Para cada analista, buscar seus clientes
      const analystsWithClients = await Promise.all(
        analystsData.map(async analyst => {
          const { data: clientsData, error: clientsError } = await supabase
            .from('clients')
            .select('*')
            .eq('analyst_id', analyst.id)
            .order('name', { ascending: true });

          if (clientsError) {
            console.error(`[AnalystManagement] Error loading clients for analyst ${analyst.id}:`, clientsError);
            return {
              ...analyst,
              clients: [],
            };
          }

          // 3. Para cada cliente, buscar suas fazendas
          const clientsWithFarms = await Promise.all(
            (clientsData || []).map(async client => {
              // Buscar fazendas vinculadas ao cliente na tabela client_farms
              const { data: clientFarmsData, error: farmsError } = await supabase
                .from('client_farms')
                .select('farm_id')
                .eq('client_id', client.id);

              if (farmsError) {
                console.error(`[AnalystManagement] Error loading farms for client ${client.id}:`, farmsError);
                return {
                  ...client,
                  farms: [],
                };
              }

              // Buscar fazendas do localStorage usando os IDs
              const farmIds = clientFarmsData?.map(cf => cf.farm_id) || [];
              const farms: Farm[] = [];

              if (farmIds.length > 0) {
                try {
                  const storedFarms = localStorage.getItem('farms');
                  if (storedFarms) {
                    const allFarms: Farm[] = JSON.parse(storedFarms);
                    farms.push(...allFarms.filter(farm => farmIds.includes(farm.id)));
                  }
                } catch (err) {
                  console.error('[AnalystManagement] Error parsing farms from localStorage:', err);
                }
              }

              return {
                ...client,
                farms: farms,
              } as ClientData;
            }),
          );

          return {
            id: analyst.id,
            name: analyst.name,
            email: analyst.email,
            clients: clientsWithFarms,
          } as AnalystData;
        }),
      );

      setAnalysts(analystsWithClients);
    } catch (err: any) {
      console.error('[AnalystManagement] Unexpected error:', err);
      setError(`Erro inesperado: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAnalyst = (analystId: string) => {
    const newExpanded = new Set(expandedAnalysts);
    if (newExpanded.has(analystId)) {
      newExpanded.delete(analystId);
    } else {
      newExpanded.add(analystId);
    }
    setExpandedAnalysts(newExpanded);
  };

  const toggleClient = (clientId: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
    }
    setExpandedClients(newExpanded);
  };

  // Filtrar analistas baseado no termo de busca
  const filteredAnalysts = analysts.filter(analyst => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      analyst.name.toLowerCase().includes(searchLower) ||
      analyst.email.toLowerCase().includes(searchLower) ||
      analyst.clients.some(
        client =>
          client.name.toLowerCase().includes(searchLower) ||
          client.email.toLowerCase().includes(searchLower) ||
          client.farms.some(farm => farm.name.toLowerCase().includes(searchLower)),
      )
    );
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-ai-accent" />
          <p className="text-sm text-ai-subtext">Carregando dados...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center p-6">
          <AlertCircle size={32} className="text-red-500" />
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-6 overflow-hidden">
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-ai-text mb-1">Gerenciamento de Analistas</h1>
            <p className="text-sm text-ai-subtext">Visualize analistas, suas organizações e fazendas</p>
          </div>
        </div>

        {/* Barra de busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-ai-subtext" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por analista, organização ou fazenda..."
            className="w-full pl-10 pr-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
          />
        </div>
      </div>

      {/* Lista de Analistas */}
      <div className="flex-1 overflow-y-auto">
        {filteredAnalysts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <Users size={48} className="text-ai-subtext mb-3" />
            <p className="text-sm text-ai-subtext">
              {searchTerm ? 'Nenhum resultado encontrado' : 'Nenhum analista cadastrado'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAnalysts.map(analyst => {
              const isAnalystExpanded = expandedAnalysts.has(analyst.id);
              const clientsCount = analyst.clients.length;
              const totalFarms = analyst.clients.reduce((sum, client) => sum + client.farms.length, 0);

              return (
                <div key={analyst.id} className="bg-white rounded-lg border border-ai-border overflow-hidden">
                  {/* Cabeçalho do Analista */}
                  <button
                    onClick={() => toggleAnalyst(analyst.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-ai-surface/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {isAnalystExpanded ? (
                          <ChevronDown size={20} className="text-ai-subtext" />
                        ) : (
                          <ChevronRight size={20} className="text-ai-subtext" />
                        )}
                      </div>
                      <div className="w-10 h-10 rounded-full bg-ai-accent text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {analyst.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-ai-text truncate">{analyst.name}</h3>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Analista</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <div className="flex items-center gap-1 text-xs text-ai-subtext">
                            <Mail size={12} />
                            <span className="truncate">{analyst.email}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-ai-subtext">
                            <Users size={12} />
                            <span>
                              {clientsCount} {clientsCount === 1 ? 'organização' : 'organizações'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-ai-subtext">
                            <Building2 size={12} />
                            <span>
                              {totalFarms} {totalFarms === 1 ? 'fazenda' : 'fazendas'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Clientes do Analista */}
                  {isAnalystExpanded && (
                    <div className="border-t border-ai-border bg-gray-50">
                      {analyst.clients.length === 0 ? (
                        <div className="p-4 text-center text-sm text-ai-subtext">Nenhuma organização vinculada</div>
                      ) : (
                        <div className="divide-y divide-ai-border">
                          {analyst.clients.map(client => {
                            const isClientExpanded = expandedClients.has(client.id);

                            return (
                              <div key={client.id} className="bg-white">
                                {/* Cabeçalho do Cliente */}
                                <button
                                  onClick={() => toggleClient(client.id)}
                                  className="w-full flex items-center justify-between p-3 hover:bg-ai-surface/30 transition-colors"
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="flex-shrink-0 ml-4">
                                      {isClientExpanded ? (
                                        <ChevronDown size={16} className="text-ai-subtext" />
                                      ) : (
                                        <ChevronRight size={16} className="text-ai-subtext" />
                                      )}
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                      {client.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-sm font-medium text-ai-text truncate">{client.name}</h4>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                                          Organização
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3 mt-1">
                                        <div className="flex items-center gap-1 text-xs text-ai-subtext">
                                          <Mail size={10} />
                                          <span className="truncate">{client.email}</span>
                                        </div>
                                        {client.phone && (
                                          <div className="flex items-center gap-1 text-xs text-ai-subtext">
                                            <Phone size={10} />
                                            <span>{client.phone}</span>
                                          </div>
                                        )}
                                        <div className="flex items-center gap-1 text-xs text-ai-subtext">
                                          <Building2 size={10} />
                                          <span>
                                            {client.farms.length} {client.farms.length === 1 ? 'fazenda' : 'fazendas'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </button>

                                {/* Fazendas da Organização */}
                                {isClientExpanded && (
                                  <div className="border-t border-ai-border bg-gray-50">
                                    {client.farms.length === 0 ? (
                                      <div className="p-3 ml-8 text-center text-xs text-ai-subtext">
                                        Nenhuma fazenda vinculada
                                      </div>
                                    ) : (
                                      <div className="divide-y divide-ai-border">
                                        {client.farms.map(farm => (
                                          <div
                                            key={farm.id}
                                            className="p-3 ml-8 bg-white hover:bg-ai-surface/20 transition-colors"
                                          >
                                            <div className="flex items-start gap-3">
                                              <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                                                <Building2 size={10} />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <h5 className="text-xs font-medium text-ai-text mb-1">{farm.name}</h5>
                                                <div className="flex items-center gap-3 text-[10px] text-ai-subtext">
                                                  <div className="flex items-center gap-1">
                                                    <MapPin size={8} />
                                                    <span>
                                                      {farm.city}, {farm.state}
                                                    </span>
                                                  </div>
                                                  {farm.totalArea && <span>{farm.totalArea} ha</span>}
                                                  {farm.productionSystem && (
                                                    <span className="px-1.5 py-0.5 bg-gray-200 rounded text-[9px]">
                                                      {farm.productionSystem}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalystManagement;

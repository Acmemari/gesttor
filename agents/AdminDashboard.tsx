import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Shield,
  Users,
  Activity,
  Search,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Edit2,
  Save,
  X,
  Trash2,
} from 'lucide-react';
import { User as UserType } from '../types';
import { supabase } from '../lib/supabase';
import { mapUserProfile } from '../lib/auth/mapUserProfile';
import { useAuth } from '../contexts/AuthContext';

const AdminDashboard: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [clients, setClients] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
  });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingClientData, setEditingClientData] = useState<{
    name: string;
    email: string;
    qualification: 'visitante' | 'cliente' | 'analista';
    status: 'active' | 'inactive';
    organizationId?: string | null;
    clientId?: string | null;
  } | null>(null);
  const [clientsList, setClientsList] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingClientsList, setIsLoadingClientsList] = useState(false);
  const [clientsListError, setClientsListError] = useState<string | null>(null);
  const clientsListLoadedRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(false);
  const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    // Verify admin permission before loading
    if (currentUser?.role === 'admin') {
      loadClients();
      loadOrganizations();
      // clientsList é carregado sob demanda ao abrir edição de um usuário 'cliente'
    } else if (currentUser && (currentUser.role as string) !== 'admin') {
      setError('Acesso negado. Apenas administradores podem visualizar esta página.');
      setIsLoading(false);
    }
  }, [currentUser]);

  const loadOrganizations = async () => {
    setIsLoadingOrganizations(true);
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, status')
        .eq('status', 'active')
        .order('name', { ascending: true });

      if (error) throw error;

      // Remove duplicates by name (case-insensitive) - keep the first occurrence
      if (data && data.length > 0) {
        const uniqueOrgs = data.filter(
          (org, index, self) =>
            org &&
            org.name &&
            index === self.findIndex(o => o && o.name && o.name.toLowerCase() === org.name.toLowerCase()),
        );
        console.log('[AdminDashboard] Loaded organizations:', uniqueOrgs.length, 'unique organizations');
        setOrganizations(uniqueOrgs);
      } else {
        setOrganizations([]);
      }
    } catch (error: any) {
      console.error('[AdminDashboard] Error loading organizations:', error);
      // Não mostrar erro ao usuário, apenas log
    } finally {
      setIsLoadingOrganizations(false);
    }
  };

  const loadClientsList = async () => {
    // Só carrega uma vez por sessão — a lista de clientes raramente muda durante uso
    if (clientsListLoadedRef.current) return;
    if (currentUser?.role !== 'admin') return;

    setIsLoadingClientsList(true);
    setClientsListError(null);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name', { ascending: true })
        .limit(500);

      if (error) throw error;
      setClientsList(data || []);
      clientsListLoadedRef.current = true;
    } catch (error: any) {
      console.error('[AdminDashboard] Error loading clients list:', error);
      setClientsListError('Erro ao carregar organizações disponíveis.');
    } finally {
      setIsLoadingClientsList(false);
    }
  };

  const loadClients = async (retries = 3, delay = 1000) => {
    // Verify admin permission
    if (currentUser?.role !== 'admin') {
      setError('Acesso negado. Apenas administradores podem visualizar esta página.');
      setIsLoading(false);
      return;
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        setIsLoading(true);
        setError(null);

        console.log(`[AdminDashboard] Loading clients (attempt ${attempt + 1}/${retries})...`);

        const { data, error: queryError } = await supabase.rpc('get_users_for_admin', {
          p_offset: 0,
          p_limit: 500,
          p_search: null,
        });

        if (queryError) {
          console.error('[AdminDashboard] Error loading clients:', {
            code: queryError.code,
            message: queryError.message,
            details: queryError.details,
            hint: queryError.hint,
          });

          // If it's a permission/RLS error, don't retry
          if (
            queryError.code === 'PGRST301' ||
            queryError.message?.includes('permission') ||
            queryError.message?.includes('RLS')
          ) {
            setError(
              'Erro de permissão. Verifique se você tem permissão de administrador e se as políticas RLS estão configuradas corretamente.',
            );
            setIsLoading(false);
            return;
          }

          // Retry on other errors
          if (attempt < retries - 1) {
            console.log(`[AdminDashboard] Retrying after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          setError(`Erro ao carregar usuários: ${queryError.message || 'Erro desconhecido'}`);
          setIsLoading(false);
          return;
        }

        if (data) {
          console.log(`[AdminDashboard] Loaded ${data.length} client profiles from database`);

          // Log raw data para debug
          if (data.length > 0) {
            console.log('[AdminDashboard] Sample raw profile:', {
              id: data[0].id,
              name: data[0].name,
              qualification: data[0].qualification,
              qualificationType: typeof data[0].qualification,
            });
          }

          const mappedClients = data.map(mapUserProfile).filter(Boolean) as UserType[];
          console.log(`[AdminDashboard] Successfully mapped ${mappedClients.length} clients`);

          // Log mapped data para debug
          if (mappedClients.length > 0) {
            console.log('[AdminDashboard] Sample mapped client:', {
              id: mappedClients[0].id,
              name: mappedClients[0].name,
              qualification: mappedClients[0].qualification,
            });
          }

          setClients(mappedClients);

          // Calculate stats
          const active = mappedClients.filter(c => c.status === 'active').length;

          setStats({
            total: mappedClients.length,
            active,
          });

          setIsLoading(false);
          return; // Success, exit retry loop
        } else {
          console.log('[AdminDashboard] No data returned from query');
          setClients([]);
          setStats({ total: 0, active: 0 });
        }
      } catch (error: any) {
        console.error('[AdminDashboard] Exception loading clients:', error);

        if (attempt < retries - 1) {
          console.log(`[AdminDashboard] Retrying after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        setError(`Erro inesperado ao carregar usuários: ${error.message || 'Erro desconhecido'}`);
      } finally {
        if (attempt === retries - 1) {
          setIsLoading(false);
        }
      }
    }
  };

  const filteredClients = clients.filter(
    client =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const formatLastLogin = (lastLogin?: string) => {
    if (!lastLogin) return 'Nunca';
    const date = new Date(lastLogin);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `${diffDays} dias atrás`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`;
    return date.toLocaleDateString('pt-BR');
  };

  const getQualificationLabel = (qualification?: string) => {
    switch (qualification) {
      case 'cliente':
        return 'Cliente';
      case 'analista':
        return 'Analista';
      case 'visitante':
      default:
        return 'Visitante';
    }
  };

  const getQualificationColor = (qualification?: string) => {
    switch (qualification) {
      case 'cliente':
        return 'bg-blue-100 text-blue-700';
      case 'analista':
        return 'bg-purple-100 text-purple-700';
      case 'visitante':
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const handleSaveClient = async () => {
    if (!editingClientId || !editingClientData) return;

    setIsSaving(true);
    try {
      console.log('[AdminDashboard] Saving client:', {
        id: editingClientId,
        qualification: editingClientData.qualification,
        status: editingClientData.status,
      });

      const updatePayload: any = {
        qualification: editingClientData.qualification,
        status: editingClientData.status,
        updated_at: new Date().toISOString(),
      };

      // Se for visitante, remover vínculo com empresa e organização
      if (editingClientData.qualification === 'visitante') {
        updatePayload.organization_id = null;
        updatePayload.client_id = null;
      } else if (editingClientData.qualification === 'analista') {
        // Se for analista, incluir organization_id se fornecido e limpar client_id
        updatePayload.organization_id = editingClientData.organizationId || null;
        updatePayload.client_id = null;
      } else if (editingClientData.qualification === 'cliente') {
        // Para cliente, salvar o client_id selecionado
        updatePayload.client_id = editingClientData.clientId || null;
      }

      const { data: updateData, error } = await supabase
        .from('user_profiles')
        .update(updatePayload)
        .eq('id', editingClientId)
        .select('id, qualification, status, organization_id');

      if (error) {
        console.error('[AdminDashboard] Update error:', error);
        throw error;
      }

      console.log('[AdminDashboard] Update successful:', updateData);

      // Verificar se o update retornou dados
      if (updateData && updateData.length > 0) {
        console.log('[AdminDashboard] Updated qualification:', updateData[0].qualification);
        console.log('[AdminDashboard] Updated status:', updateData[0].status);
      }

      // Recarregar dados do banco para garantir sincronização
      await loadClients();

      // Fechar modal
      setEditingClientId(null);
      setEditingClientData(null);

      alert('Usuário atualizado com sucesso!');
    } catch (error: any) {
      console.error('[AdminDashboard] Error saving client:', error);
      alert('Erro ao salvar alterações: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsSaving(false);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuId && menuRefs.current[openMenuId]) {
        if (!menuRefs.current[openMenuId]?.contains(event.target as Node)) {
          setOpenMenuId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuId]);

  const handleDeleteUser = async (userId: string) => {
    setDeletingUserId(userId);
    setShowDeleteConfirm(null);
    setOpenMenuId(null);

    try {
      // Use the database function to delete user completely
      // This function deletes all related data including auth.users
      const { error } = await supabase.rpc('delete_user_completely', {
        user_id_to_delete: userId,
      });

      if (error) {
        // If RPC fails, try manual deletion as fallback
        console.warn('RPC delete_user_completely failed, trying manual deletion:', error);

        // Manual deletion fallback
        await supabase.from('cattle_scenarios').delete().eq('user_id', userId);
        await supabase.from('ai_token_usage').delete().eq('user_id', userId);
        await supabase.from('calculations').delete().eq('user_id', userId);
        await supabase.from('chat_messages').delete().eq('user_id', userId);
        await supabase.from('organizations').delete().eq('owner_id', userId);

        const { error: profileError } = await supabase.from('user_profiles').delete().eq('id', userId);

        if (profileError) throw profileError;
      }

      // Update local state
      setClients(prevClients => prevClients.filter(client => client.id !== userId));

      // Update stats
      setStats(prev => ({
        total: prev.total - 1,
        active: prev.active - (clients.find(c => c.id === userId)?.status === 'active' ? 1 : 0),
      }));

      alert('Usuário e todos os dados relacionados foram excluídos com sucesso!');
    } catch (error: any) {
      console.error('Error deleting user:', error);
      alert('Erro ao excluir usuário: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setDeletingUserId(null);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-ai-subtext" />
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md w-full">
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-900 mb-1">Erro ao carregar dados</h3>
              <p className="text-xs text-red-700 mb-4">{error}</p>
              <button
                onClick={() => loadClients()}
                className="text-xs px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6 p-2">
      {/* Edit Client Modal */}
      {editingClientId && editingClientData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ai-text">Editar Usuário</h3>
              <button
                onClick={() => {
                  setEditingClientId(null);
                  setEditingClientData(null);
                }}
                className="text-ai-subtext hover:text-ai-text"
                disabled={isSaving}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Nome e Email (readonly) */}
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">Nome</label>
                <input
                  type="text"
                  value={editingClientData.name || ''}
                  disabled
                  className="w-full px-3 py-2 border border-ai-border rounded-lg bg-gray-50 text-ai-text"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">Email</label>
                <input
                  type="email"
                  value={editingClientData.email || ''}
                  disabled
                  className="w-full px-3 py-2 border border-ai-border rounded-lg bg-gray-50 text-ai-text"
                />
              </div>

              {/* Qualificação */}
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">
                  Qualificação <span className="text-red-500">*</span>
                </label>
                <select
                  value={editingClientData.qualification || 'visitante'}
                  onChange={e => {
                    const newQualification = e.target.value as 'visitante' | 'cliente' | 'analista';
                    setEditingClientData(prev =>
                      prev
                        ? {
                            ...prev,
                            qualification: newQualification,
                            organizationId: newQualification === 'visitante' ? null : prev.organizationId,
                            clientId: newQualification === 'cliente' ? prev.clientId : null,
                          }
                        : null,
                    );
                    if (newQualification === 'cliente') {
                      void loadClientsList();
                    }
                  }}
                  className="w-full px-3 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                  disabled={isSaving}
                >
                  <option value="visitante">Visitante</option>
                  <option value="cliente">Cliente</option>
                  <option value="analista">Analista</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">Status</label>
                <select
                  value={editingClientData.status || 'active'}
                  onChange={e =>
                    setEditingClientData(prev =>
                      prev
                        ? {
                            ...prev,
                            status: e.target.value as 'active' | 'inactive',
                          }
                        : null,
                    )
                  }
                  className="w-full px-3 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                  disabled={isSaving}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>

              {/* Empresa (apenas para analistas) */}
              {editingClientData.qualification === 'analista' && (
                <div>
                  <label className="block text-sm font-medium text-ai-text mb-1">Empresa Vinculada</label>
                  <select
                    value={editingClientData.organizationId || ''}
                    onChange={e =>
                      setEditingClientData(prev =>
                        prev
                          ? {
                              ...prev,
                              organizationId: e.target.value || null,
                            }
                          : null,
                      )
                    }
                    className="w-full px-3 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                    disabled={isSaving || isLoadingOrganizations}
                  >
                    <option value="">Nenhuma empresa (sem vínculo)</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                  {isLoadingOrganizations && <p className="text-xs text-ai-subtext mt-1">Carregando empresas...</p>}
                  {!isLoadingOrganizations && organizations.length === 0 && (
                    <p className="text-xs text-ai-subtext mt-1">
                      Nenhuma empresa cadastrada. Cadastre empresas em Configurações → Cadastro de Empresa.
                    </p>
                  )}
                </div>
              )}

              {/* Mensagem informativa para visitantes */}
              {editingClientData.qualification === 'visitante' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800">
                    <strong>Visitantes</strong> não precisam ter vínculo com empresa ou analista. Quando convertido para{' '}
                    <strong>Cliente</strong> ou <strong>Analista</strong>, o vínculo será feito na tela de cadastro
                    correspondente.
                  </p>
                </div>
              )}

              {/* Seletor de organização (apenas para clientes) */}
              {editingClientData.qualification === 'cliente' && (
                <div>
                  <label className="block text-sm font-medium text-ai-text mb-1">
                    Organização Vinculada <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editingClientData.clientId || ''}
                    onChange={e =>
                      setEditingClientData(prev =>
                        prev ? { ...prev, clientId: e.target.value || null } : null,
                      )
                    }
                    className="w-full px-3 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                    disabled={isSaving || isLoadingClientsList}
                  >
                    <option value="">Nenhuma organização (sem vínculo)</option>
                    {clientsList.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {isLoadingClientsList && (
                    <p className="text-xs text-ai-subtext mt-1">Carregando organizações...</p>
                  )}
                  {clientsListError && (
                    <p className="text-xs text-red-600 mt-1">{clientsListError}</p>
                  )}
                  {!isLoadingClientsList && !clientsListError && clientsList.length === 0 && (
                    <p className="text-xs text-ai-subtext mt-1">
                      Nenhuma organização cadastrada. Cadastre em Cadastros → Organizações.
                    </p>
                  )}
                  <p className="text-xs text-amber-700 mt-1">
                    Após salvar, o usuário verá automaticamente as fazendas desta organização ao logar.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setEditingClientId(null);
                  setEditingClientData(null);
                }}
                className="flex-1 px-4 py-2 border border-ai-border text-ai-text rounded-lg font-medium hover:bg-ai-surface2 transition-colors"
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveClient}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Salvar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-600 mb-2">Confirmar Exclusão</h3>
            <p className="text-sm text-ai-subtext mb-4">
              Tem certeza que deseja excluir este usuário? Esta ação é permanente e não pode ser desfeita.
            </p>
            <p className="text-xs text-ai-subtext mb-6 bg-red-50 p-3 rounded border border-red-200">
              <strong>Atenção:</strong> Todos os dados relacionados serão excluídos, incluindo:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Perfil do usuário</li>
                <li>Mensagens de chat</li>
                <li>Cenários salvos</li>
                <li>Cálculos realizados</li>
                <li>Organizações (se for proprietário)</li>
                <li>Histórico de uso de tokens</li>
              </ul>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-ai-border text-ai-text rounded-lg font-medium hover:bg-ai-surface2 transition-colors"
                disabled={deletingUserId !== null}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteUser(showDeleteConfirm)}
                disabled={deletingUserId !== null}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deletingUserId ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Excluir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-ai-border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Users size={18} />
            </div>
            <span className="text-xs font-bold text-ai-subtext uppercase">Total Usuários</span>
          </div>
          <div className="text-2xl font-mono font-bold text-ai-text">{stats.total}</div>
          <div className="text-xs text-emerald-600 font-medium mt-1">Usuários cadastrados</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-ai-border shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Activity size={18} />
            </div>
            <span className="text-xs font-bold text-ai-subtext uppercase">Ativos</span>
          </div>
          <div className="text-2xl font-mono font-bold text-ai-text">{stats.active}</div>
          <div className="text-xs text-ai-subtext font-medium mt-1">Usuários ativos</div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 bg-white rounded-xl border border-ai-border shadow-sm flex flex-col overflow-hidden">
        {/* Table Header / Toolbar */}
        <div className="p-4 border-b border-ai-border flex justify-between items-center">
          <h2 className="text-sm font-bold text-ai-text">Base de Usuários</h2>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ai-subtext" />
            <input
              type="text"
              placeholder="Buscar usuário..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-ai-border rounded-md bg-ai-surface focus:outline-none focus:border-ai-text transition-colors"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-ai-surface sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-[10px] font-bold text-ai-subtext uppercase tracking-wider border-b border-ai-border">
                  Usuário
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-ai-subtext uppercase tracking-wider border-b border-ai-border">
                  Qualificação
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-ai-subtext uppercase tracking-wider border-b border-ai-border">
                  Status
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-ai-subtext uppercase tracking-wider border-b border-ai-border">
                  Último Acesso
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-ai-subtext uppercase tracking-wider border-b border-ai-border text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ai-border">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-ai-subtext">
                    {searchTerm ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
                  </td>
                </tr>
              ) : (
                filteredClients.map(client => (
                  <tr key={client.id} className="hover:bg-ai-surface/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-ai-text text-white flex items-center justify-center text-xs font-bold mr-3">
                          {client.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-ai-text">{client.name}</div>
                          <div className="text-xs text-ai-subtext">{client.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${getQualificationColor(client.qualification)}`}>
                        {getQualificationLabel(client.qualification)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {client.status === 'active' ? (
                          <CheckCircle2 size={14} className="text-emerald-500 mr-1.5" />
                        ) : (
                          <XCircle size={14} className="text-rose-500 mr-1.5" />
                        )}
                        <span
                          className={`text-xs ${client.status === 'active' ? 'text-emerald-700' : 'text-rose-700'}`}
                        >
                          {client.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-ai-subtext">{formatLastLogin(client.lastLogin)}</td>
                    <td className="px-6 py-4 text-right">
                      <div
                        className="relative inline-block"
                        ref={el => {
                          menuRefs.current[client.id] = el;
                        }}
                      >
                        <button
                          onClick={() => setOpenMenuId(openMenuId === client.id ? null : client.id)}
                          className="text-ai-subtext hover:text-ai-text p-1 rounded hover:bg-ai-border/50 transition-colors"
                          disabled={deletingUserId === client.id}
                        >
                          {deletingUserId === client.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <MoreHorizontal size={16} />
                          )}
                        </button>

                        {openMenuId === client.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg border border-ai-border shadow-lg z-50">
                            <div className="py-1">
                              <button
                                onClick={() => {
                                  setEditingClientId(client.id);
                                  setEditingClientData({
                                    name: client.name,
                                    email: client.email,
                                    qualification: client.qualification || 'visitante',
                                    status: client.status || 'active',
                                    organizationId: client.organizationId || null,
                                    clientId: client.clientId || null,
                                  });
                                  // Carrega a lista de organizações sob demanda
                                  if (client.qualification === 'cliente') {
                                    void loadClientsList();
                                  }
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-ai-text hover:bg-ai-surface2 flex items-center gap-2 transition-colors"
                              >
                                <Edit2 size={14} />
                                Editar
                              </button>
                              <button
                                onClick={() => {
                                  setShowDeleteConfirm(client.id);
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                              >
                                <Trash2 size={14} />
                                Excluir Usuário
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t border-ai-border bg-ai-surface/30 text-xs text-ai-subtext text-center">
          Mostrando {filteredClients.length} de {stats.total} usuários
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Save,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Building2,
  User,
  Mail,
  Phone,
  Users,
} from 'lucide-react';
import { Client, Farm } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useFarmOperations } from '../lib/hooks/useFarmOperations';
import { createPerson } from '../lib/people';

interface ClientManagementProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

type PhoneCountryOption = {
  iso: 'BR' | 'PY' | 'UY' | 'BO' | 'CO' | 'AR';
  code: string;
  label: string;
  localLengths: number[];
};

type OwnerFormRow = {
  name: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
};

const PHONE_COUNTRIES: PhoneCountryOption[] = [
  { iso: 'BR', code: '+55', label: 'BR +55', localLengths: [10, 11] },
  { iso: 'PY', code: '+595', label: 'PY +595', localLengths: [9] },
  { iso: 'UY', code: '+598', label: 'UY +598', localLengths: [8] },
  { iso: 'BO', code: '+591', label: 'BO +591', localLengths: [8] },
  { iso: 'CO', code: '+57', label: 'CO +57', localLengths: [10] },
  { iso: 'AR', code: '+54', label: 'AR +54', localLengths: [10] },
];

const DEFAULT_PHONE_COUNTRY_CODE = '+55';

const ClientManagement: React.FC<ClientManagementProps> = ({ onToast }) => {
  type OwnerFieldError = { email?: string; phone?: string };
  const { user: currentUser } = useAuth();
  const { getClientFarms, deleteFarm } = useFarmOperations();
  const clientFormReadOnly = currentUser?.role === 'admin' ? false : currentUser?.qualification !== 'analista';
  const [clients, setClients] = useState<Client[]>([]);
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'list' | 'form'>('list');

  // Notificar App.tsx sobre mudanças de view
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('clientViewChange', { detail: view }));
  }, [view]);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [owners, setOwners] = useState<OwnerFormRow[]>([]);
  const [ownerErrors, setOwnerErrors] = useState<OwnerFieldError[]>([]);
  const [editingClientFarms, setEditingClientFarms] = useState<Farm[]>([]);
  const [loadingEditingClientFarms, setLoadingEditingClientFarms] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    email: '',
    analystId: currentUser?.id || '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (currentUser && (currentUser.role === 'admin' || currentUser.qualification === 'analista')) {
      loadClients();
      loadAnalysts();
    } else if (currentUser) {
      setError('Acesso negado. Apenas analistas e administradores podem acessar esta página.');
      setIsLoading(false);
    }
  }, [currentUser]);

  const loadClients = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Construir query base
      let query = supabase.from('clients').select('*');

      // Filtrar por analista: se for analista, mostrar apenas seus clientes; se for admin, mostrar todos
      if (currentUser?.qualification === 'analista' && currentUser?.role !== 'admin') {
        query = query.eq('analyst_id', currentUser.id);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error: queryError } = await query;

      if (queryError) {
        console.error('[ClientManagement] Error loading clients:', queryError);
        setError(`Erro ao carregar clientes: ${queryError.message}`);
        return;
      }

      if (data) {
        const uniqueAnalystIds = [...new Set(data.map(c => c.analyst_id).filter(Boolean))];

        const { data: analystsData } = await supabase
          .from('user_profiles')
          .select('id, name, email')
          .in('id', uniqueAnalystIds);

        const analystsMap = new Map((analystsData || []).map(a => [a.id, a]));

        const mappedClients = data.map(client => ({
          id: client.id,
          name: client.name,
          phone: client.phone || '',
          email: client.email,
          analystId: client.analyst_id,
          createdAt: client.created_at,
          updatedAt: client.updated_at,
          analyst: analystsMap.get(client.analyst_id) || null,
        }));

        setClients(mappedClients as any);
      }
    } catch (err: any) {
      console.error('[ClientManagement] Unexpected error:', err);
      setError(`Erro inesperado: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  const loadAnalysts = async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('user_profiles')
        .select('id, name, email, qualification, role')
        .or('qualification.eq.analista,role.eq.admin')
        .order('name', { ascending: true });

      if (queryError) {
        console.error('[ClientManagement] Error loading analysts:', queryError);
        return;
      }

      if (data) {
        const uniqueAnalysts = Array.from(new Map(data.map(a => [a.id, a])).values());
        setAnalysts(uniqueAnalysts);
      }
    } catch (err: any) {
      console.error('[ClientManagement] Error loading analysts:', err);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Nome é obrigatório';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Email inválido';
    }

    if (!formData.analystId) {
      errors.analystId = 'Analista responsável é obrigatório';
    }

    if (formData.phone.trim()) {
      const country = getCountryByCode(formData.phoneCountryCode);
      const phoneDigits = normalizeLocalDigits(formData.phone, formData.phoneCountryCode);
      if (!country.localLengths.includes(phoneDigits.length)) {
        errors.phone = `Telefone inválido para ${country.label}`;
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getCountryByCode = (countryCode: string): PhoneCountryOption =>
    PHONE_COUNTRIES.find(country => country.code === countryCode) ||
    PHONE_COUNTRIES.find(country => country.code === DEFAULT_PHONE_COUNTRY_CODE)!;

  const normalizeLocalDigits = (value: string, countryCode: string): string => {
    const country = getCountryByCode(countryCode);
    const digitsOnly = value.replace(/\D/g, '');
    const countryDigits = countryCode.replace(/\D/g, '');
    const withoutCode = digitsOnly.startsWith(countryDigits) ? digitsOnly.slice(countryDigits.length) : digitsOnly;
    const maxLength = Math.max(...country.localLengths);
    return withoutCode.slice(0, maxLength);
  };

  const formatLocalPhoneByCountry = (countryCode: string, rawValue: string): string => {
    const country = getCountryByCode(countryCode);
    const digits = normalizeLocalDigits(rawValue, countryCode);

    if (country.iso === 'BR') {
      if (digits.length <= 2) return digits;
      if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }

    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const composePhoneWithCountry = (countryCode: string, localPhone: string): string | null => {
    const normalized = formatLocalPhoneByCountry(countryCode, localPhone);
    const localDigits = normalized.replace(/\D/g, '');
    if (!localDigits) return null;
    return `${countryCode} ${normalized}`;
  };

  const splitPhoneForForm = (rawPhone?: string | null): { countryCode: string; localPhone: string } => {
    if (!rawPhone?.trim()) {
      return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, localPhone: '' };
    }

    const normalized = rawPhone.trim();
    const byPrefix = PHONE_COUNTRIES.find(
      country => normalized.startsWith(`${country.code} `) || normalized.startsWith(country.code),
    );
    if (byPrefix) {
      const countryDigits = byPrefix.code.replace(/\D/g, '');
      const allDigits = normalized.replace(/\D/g, '');
      const localDigits = allDigits.startsWith(countryDigits) ? allDigits.slice(countryDigits.length) : allDigits;
      return {
        countryCode: byPrefix.code,
        localPhone: formatLocalPhoneByCountry(byPrefix.code, localDigits),
      };
    }

    return {
      countryCode: DEFAULT_PHONE_COUNTRY_CODE,
      localPhone: formatLocalPhoneByCountry(DEFAULT_PHONE_COUNTRY_CODE, normalized),
    };
  };

  const validateOwnerContacts = (): boolean => {
    const nextErrors: OwnerFieldError[] = owners.map(() => ({}));
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let hasError = false;

    owners.forEach((owner, idx) => {
      const email = owner.email.trim();
      const country = getCountryByCode(owner.phoneCountryCode);
      const phoneDigits = normalizeLocalDigits(owner.phone, owner.phoneCountryCode);
      const hasContent = owner.name.trim() || email || phoneDigits;

      if (!hasContent) return;

      if (email && !emailRegex.test(email)) {
        nextErrors[idx].email = 'Informe um e-mail válido';
        hasError = true;
      }

      if (phoneDigits && !country.localLengths.includes(phoneDigits.length)) {
        nextErrors[idx].phone = `Telefone inválido para ${country.label}`;
        hasError = true;
      }
    });

    setOwnerErrors(nextErrors);
    return !hasError;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      const freshErrors: string[] = [];
      if (!formData.name.trim()) freshErrors.push('Nome');
      if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) freshErrors.push('Email');
      if (!formData.analystId) freshErrors.push('Analista responsável');

      if (freshErrors.length > 0) {
        onToast?.(`Corrija os campos obrigatórios: ${freshErrors.join(', ')}`, 'error');
      }

      const firstErrorField = document.querySelector('[data-error="true"]');
      if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (!validateOwnerContacts()) {
      onToast?.('Corrija os contatos dos proprietários gestores (e-mail/telefone).', 'error');
      return;
    }

    setIsSaving(true);

    try {
      if (editingClient) {
        // Update existing client
        const { data, error: updateError } = await supabase
          .from('clients')
          .update({
            name: formData.name.trim(),
            phone: composePhoneWithCountry(formData.phoneCountryCode, formData.phone),
            email: formData.email.trim(),
            analyst_id: formData.analystId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingClient.id)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        await saveClientOwners(editingClient.id);
        try {
          await syncOwnersAsPeople(formData.analystId, editingClient.id);
        } catch (syncErr: any) {
          console.error('[ClientManagement] Error syncing owners as people:', syncErr);
          onToast?.('Organização atualizada, mas houve um problema ao sincronizar gestores na tela de Pessoas.', 'warning');
        }

        onToast?.('Organização atualizada com sucesso!', 'success');
      } else {
        // Create new client
        const { data, error: insertError } = await supabase
          .from('clients')
          .insert({
            name: formData.name.trim(),
            phone: composePhoneWithCountry(formData.phoneCountryCode, formData.phone),
            email: formData.email.trim(),
            analyst_id: formData.analystId,
          })
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        if (data) {
          await saveClientOwners(data.id);
          try {
            await syncOwnersAsPeople(formData.analystId, data.id);
          } catch (syncErr: any) {
            console.error('[ClientManagement] Error syncing owners as people:', syncErr);
            onToast?.(
              'Organização cadastrada, mas houve um problema ao sincronizar gestores na tela de Pessoas.',
              'warning',
            );
          }
        }

        onToast?.('Organização cadastrada com sucesso!', 'success');
      }

      // Reset form
      resetForm();
      setView('list');
      loadClients();

      // Disparar evento para atualizar o ClientSelector após um pequeno delay
      // para garantir que o banco de dados foi atualizado
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('clientAdded'));
        window.dispatchEvent(new CustomEvent('clientUpdated'));
      }, 500);
    } catch (err: any) {
      console.error('[ClientManagement] Error saving client:', err);
      onToast?.(`Erro ao salvar organização: ${err.message || 'Erro desconhecido'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const saveClientOwners = async (clientId: string) => {
    const { error: deleteError } = await supabase.from('client_owners').delete().eq('client_id', clientId);

    if (deleteError) {
      throw new Error(`Erro ao limpar gestores: ${deleteError.message}`);
    }

    const validOwners = owners.filter(o => o.name.trim());
    if (validOwners.length > 0) {
      const { error: insertError } = await supabase.from('client_owners').insert(
        validOwners.map((o, i) => ({
          client_id: clientId,
          name: o.name.trim(),
          email: o.email.trim().toLowerCase() || null,
          phone: composePhoneWithCountry(o.phoneCountryCode, o.phone),
          sort_order: i,
        })),
      );

      if (insertError) {
        throw new Error(`Erro ao salvar gestores: ${insertError.message}`);
      }
    }
  };

  const syncOwnersAsPeople = async (analystId: string, clientId: string) => {
    const normalizeName = (value: string) => value.trim().toLowerCase();
    const validOwners = owners.filter(o => o.name.trim());
    if (validOwners.length === 0) return;

    const { data: clientFarms, error: farmsError } = await supabase
      .from('farms')
      .select('id')
      .eq('client_id', clientId);

    if (farmsError) {
      throw new Error(`Erro ao buscar fazendas do cliente: ${farmsError.message}`);
    }

    const farmIds = (clientFarms || []).map(farm => farm.id);

    const { data: existingPeople } = await supabase
      .from('people')
      .select('id, full_name, farm_id')
      .eq('created_by', analystId)
      .eq('person_type', 'Proprietário');

    const existingRows = (existingPeople || []) as Array<{ id: string; full_name: string; farm_id: string | null }>;
    const existingPairs = new Set(
      existingRows.map(person => `${normalizeName(person.full_name)}::${person.farm_id || 'null'}`),
    );

    // Reaproveita registros antigos sem farm_id e vincula à primeira(s) fazenda(s) faltante(s).
    if (farmIds.length > 0) {
      const normalizedOwnerNames = Array.from(new Set(validOwners.map(owner => normalizeName(owner.name))));
      const orphanUpdates: Array<{ personId: string; farmId: string }> = [];

      normalizedOwnerNames.forEach(ownerName => {
        const matchingPeople = existingRows.filter(person => normalizeName(person.full_name) === ownerName);
        const matchingFarmIds = new Set(
          matchingPeople.map(person => person.farm_id).filter((farmId): farmId is string => Boolean(farmId)),
        );

        const orphanPeople = matchingPeople.filter(person => !person.farm_id);
        const missingFarmIds = farmIds.filter(farmId => !matchingFarmIds.has(farmId));

        orphanPeople.forEach((person, index) => {
          const targetFarmId = missingFarmIds[index];
          if (!targetFarmId) return;
          orphanUpdates.push({ personId: person.id, farmId: targetFarmId });
          matchingFarmIds.add(targetFarmId);
          existingPairs.add(`${ownerName}::${targetFarmId}`);
          existingPairs.delete(`${ownerName}::null`);
        });
      });

      if (orphanUpdates.length > 0) {
        const updateResults = await Promise.all(
          orphanUpdates.map(({ personId, farmId }) =>
            supabase.from('people').update({ farm_id: farmId }).eq('id', personId),
          ),
        );

        const failedUpdate = updateResults.find(result => result.error);
        if (failedUpdate?.error) {
          throw new Error(`Erro ao atualizar proprietários sem fazenda: ${failedUpdate.error.message}`);
        }
      }
    }

    const creationPayloads: Array<{
      full_name: string;
      person_type: 'Proprietário';
      email?: string;
      phone_whatsapp?: string;
      farm_id?: string | null;
    }> = [];

    validOwners.forEach(owner => {
      const normalizedOwnerName = normalizeName(owner.name);
      const targetFarmIds = farmIds.length > 0 ? farmIds : [null];

      targetFarmIds.forEach(farmId => {
        const key = `${normalizedOwnerName}::${farmId || 'null'}`;
        if (existingPairs.has(key)) return;
        existingPairs.add(key);
        creationPayloads.push({
          full_name: owner.name.trim(),
          person_type: 'Proprietário',
          email: owner.email.trim().toLowerCase() || undefined,
          phone_whatsapp: composePhoneWithCountry(owner.phoneCountryCode, owner.phone) || undefined,
          farm_id: farmId,
        });
      });
    });

    if (creationPayloads.length > 0) {
      await Promise.all(creationPayloads.map(payload => createPerson(analystId, payload)));
    }
  };

  const handleEdit = async (client: Client) => {
    const clientPhoneParts = splitPhoneForForm(client.phone || '');
    setEditingClient(client);
    setFormData({
      name: client.name,
      phone: clientPhoneParts.localPhone,
      phoneCountryCode: clientPhoneParts.countryCode,
      email: client.email,
      analystId: client.analystId,
    });
    setView('form');

    setLoadingEditingClientFarms(true);
    setEditingClientFarms([]);

    try {
      const [{ data: ownersResult }, farmsResult] = await Promise.all([
        supabase
          .from('client_owners')
          .select('name, email, phone, sort_order')
          .eq('client_id', client.id)
          .order('sort_order', { ascending: true }),
        getClientFarms(client.id),
      ]);

      setOwners(
        (ownersResult || []).map(o => ({
          name: o.name || '',
          email: o.email || '',
          phone: splitPhoneForForm(o.phone || '').localPhone,
          phoneCountryCode: splitPhoneForForm(o.phone || '').countryCode,
        })),
      );
      setOwnerErrors(Array((ownersResult || []).length).fill({}));
      setEditingClientFarms(farmsResult || []);
    } catch (err) {
      console.error('[ClientManagement] Error loading client details:', err);
      setOwners([]);
      setOwnerErrors([]);
      setEditingClientFarms([]);
    } finally {
      setLoadingEditingClientFarms(false);
    }
  };

  const handleDelete = useCallback(
    async (clientId: string) => {
      try {
        // 1. Buscar fazendas vinculadas ao cliente
        const clientFarms = await getClientFarms(clientId);

        // 2. Mostrar confirmação com detalhes
        const farmCount = clientFarms.length;
        const farmNames = clientFarms.map(f => f.name).join(', ');

        let confirmMessage = `Tem certeza que deseja excluir esta organização?\n\n`;

        if (farmCount > 0) {
          confirmMessage += `⚠️ ATENÇÃO: Esta ação irá excluir:\n`;
          confirmMessage += `• ${farmCount} fazenda${farmCount !== 1 ? 's' : ''}: ${farmNames}\n`;
          confirmMessage += `• Todos os vínculos e registros associados\n\n`;
          confirmMessage += `Esta ação NÃO pode ser desfeita!`;
        } else {
          confirmMessage += `A organização será removida do sistema.`;
        }

        if (!window.confirm(confirmMessage)) {
          return;
        }

        // Iniciar processo de exclusão
        setDeletingClientId(clientId);

        // 3. Se houver fazendas, excluí-las usando hook otimizado
        if (farmCount > 0) {
          await Promise.all(clientFarms.map(farm => deleteFarm(farm.id)));
        }

        // 4. Excluir o cliente (client_farms será excluído automaticamente por cascata)
        const { error } = await supabase.from('clients').delete().eq('id', clientId);

        if (error) {
          throw error;
        }

        // 5. Mensagem de sucesso
        if (farmCount > 0) {
          onToast?.(`Organização e ${farmCount} fazenda${farmCount !== 1 ? 's' : ''} excluídas com sucesso!`, 'success');
        } else {
          onToast?.('Organização excluída com sucesso!', 'success');
        }

        await loadClients();

        // Disparar eventos para atualizar seletores
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('clientDeleted'));
          window.dispatchEvent(new CustomEvent('farmUpdated'));
        }, 300);
      } catch (err: any) {
        console.error('[ClientManagement] Error deleting client:', err);
        onToast?.(`Erro ao excluir organização: ${err.message || 'Erro desconhecido'}`, 'error');
      } finally {
        setDeletingClientId(null);
      }
    },
    [getClientFarms, deleteFarm, onToast, loadClients],
  );

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
      email: '',
      analystId: currentUser?.id || '',
    });
    setFormErrors({});
    setEditingClient(null);
    setOwners([]);
    setOwnerErrors([]);
    setEditingClientFarms([]);
    setLoadingEditingClientFarms(false);
  };

  const handleCancel = () => {
    resetForm();
    setView('list');
    window.dispatchEvent(new CustomEvent('clientCancelForm'));
  };

  // Escutar evento de cancelamento da barra superior
  useEffect(() => {
    const handleCancelForm = () => {
      if (view === 'form') {
        resetForm();
        setView('list');
      }
    };

    window.addEventListener('clientCancelForm', handleCancelForm);
    return () => {
      window.removeEventListener('clientCancelForm', handleCancelForm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Escutar evento de novo cliente da barra superior
  useEffect(() => {
    const handleNewClient = () => {
      resetForm();
      setView('form');
    };

    window.addEventListener('clientNewClient', handleNewClient);
    return () => {
      window.removeEventListener('clientNewClient', handleNewClient);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoizar lista filtrada para melhorar performance
  const filteredClients = useMemo(() => {
    if (!searchTerm) return clients;

    const term = searchTerm.toLowerCase();
    return clients.filter(
      client =>
        client.name.toLowerCase().includes(term) ||
        client.email.toLowerCase().includes(term) ||
        (client.phone && client.phone.includes(term)),
    );
  }, [clients, searchTerm]);

  // Usar hook customizado otimizado ao invés da função local
  // const getClientFarms = useFarmOperations().getClientFarms;

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.qualification !== 'analista')) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-ai-error mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-ai-text mb-2">Acesso Negado</h2>
          <p className="text-ai-subtext">Apenas analistas e administradores podem acessar esta página.</p>
        </div>
      </div>
    );
  }

  if (view === 'form') {
    const isViewMode = clientFormReadOnly;
    return (
      <div className={`h-full overflow-y-auto ${isViewMode ? 'bg-ai-bg' : 'bg-white'}`}>
        <div className="max-w-4xl mx-auto p-6">
          <div
            className={`rounded-lg shadow-lg p-6 ${isViewMode ? 'bg-ai-surface' : 'bg-white border border-ai-border'}`}
          >
            <div className="flex items-center justify-end mb-6">
              <button
                onClick={handleCancel}
                className="p-2 hover:bg-ai-surface2 rounded-md transition-colors"
                title="Cancelar"
              >
                <X className="w-5 h-5 text-ai-subtext" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <fieldset disabled={clientFormReadOnly} className={clientFormReadOnly ? 'opacity-75' : ''}>
                {/* Nome da Organização / Grupo Econômico */}
                <div data-error={formErrors.name ? 'true' : undefined}>
                  <label className="block text-sm font-medium text-ai-text mb-2">
                    Nome da Organização / Grupo Econômico <span className="text-ai-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full px-4 py-2 bg-ai-surface2 border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent ${
                      formErrors.name ? 'border-ai-error' : 'border-ai-border'
                    }`}
                    placeholder="Digite o nome da organização"
                  />
                  <p className="mt-1 text-xs text-ai-subtext">Nome da Organização, Agropecuária ou Grupo Econômico</p>
                  {formErrors.name && <p className="mt-1 text-sm text-ai-error">{formErrors.name}</p>}
                </div>

                {/* Telefone do Contato Administrativo */}
                <div data-error={formErrors.phone ? 'true' : undefined}>
                  <label className="block text-sm font-medium text-ai-text mb-2">
                    Telefone do Contato Administrativo
                  </label>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <select
                      value={formData.phoneCountryCode}
                      onChange={e => {
                        const nextCode = e.target.value;
                        setFormData({
                          ...formData,
                          phoneCountryCode: nextCode,
                          phone: formatLocalPhoneByCountry(nextCode, formData.phone),
                        });
                      }}
                      className="w-full px-3 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent text-sm"
                    >
                      {PHONE_COUNTRIES.map(country => (
                        <option key={country.code} value={country.code}>
                          {country.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          phone: formatLocalPhoneByCountry(formData.phoneCountryCode, e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  {formErrors.phone && <p className="mt-1 text-sm text-ai-error">{formErrors.phone}</p>}
                </div>

                {/* E-mail do Contato Administrativo */}
                <div data-error={formErrors.email ? 'true' : undefined}>
                  <label className="block text-sm font-medium text-ai-text mb-2">
                    E-mail do Contato Administrativo <span className="text-ai-error">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full px-4 py-2 bg-ai-surface2 border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent ${
                      formErrors.email ? 'border-ai-error' : 'border-ai-border'
                    }`}
                    placeholder="organizacao@exemplo.com"
                  />
                  {formErrors.email && <p className="mt-1 text-sm text-ai-error">{formErrors.email}</p>}
                </div>

                {/* Proprietário(s) Gestores */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-ai-text">Proprietário(s) Gestores</label>
                    <button
                      type="button"
                      onClick={() => {
                        setOwners([
                          ...owners,
                          { name: '', email: '', phone: '', phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE },
                        ]);
                        setOwnerErrors([...ownerErrors, {}]);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-ai-border text-ai-subtext hover:text-ai-text text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar
                    </button>
                  </div>
                  <p className="text-xs text-ai-subtext mb-3">Nome dos sócios gestores relacionados com a operação</p>
                  {owners.length === 0 ? (
                    <div className="border border-dashed border-ai-border rounded-md p-4 text-center">
                      <p className="text-xs text-ai-subtext">Nenhum proprietário gestor cadastrado.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setOwners([{ name: '', email: '', phone: '', phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE }]);
                          setOwnerErrors([{}]);
                        }}
                        className="mt-2 text-xs text-ai-accent hover:underline"
                      >
                        Adicionar primeiro proprietário
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {owners.map((owner, idx) => (
                        <div key={`owner-${idx}`} className="rounded-lg border border-ai-border bg-ai-surface2 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-ai-subtext">Proprietário {idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setOwners(owners.filter((_, i) => i !== idx));
                                setOwnerErrors(ownerErrors.filter((_, i) => i !== idx));
                              }}
                              className="p-1 rounded text-red-500 hover:bg-red-50"
                              title="Remover proprietário"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={owner.name}
                              onChange={e => {
                                const next = [...owners];
                                next[idx] = { ...next[idx], name: e.target.value };
                                setOwners(next);
                              }}
                              className="w-full px-3 py-2 bg-ai-bg border border-ai-border rounded-md text-ai-text text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent"
                              placeholder="Nome"
                            />
                            <input
                              type="email"
                              value={owner.email}
                              onChange={e => {
                                const next = [...owners];
                                next[idx] = {
                                  ...next[idx],
                                  email: e.target.value.replace(/\s+/g, '').toLowerCase(),
                                };
                                setOwners(next);
                                const nextOwnerErrors = [...ownerErrors];
                                nextOwnerErrors[idx] = { ...nextOwnerErrors[idx], email: undefined };
                                setOwnerErrors(nextOwnerErrors);
                              }}
                              className="w-full px-3 py-2 bg-ai-bg border border-ai-border rounded-md text-ai-text text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent"
                              placeholder="nome@dominio.com"
                            />
                            {ownerErrors[idx]?.email && (
                              <p className="text-xs text-ai-error">{ownerErrors[idx]?.email}</p>
                            )}
                            <div className="grid grid-cols-[96px_1fr] gap-2">
                              <select
                                value={owner.phoneCountryCode}
                                onChange={e => {
                                  const next = [...owners];
                                  const nextCode = e.target.value;
                                  next[idx] = {
                                    ...next[idx],
                                    phoneCountryCode: nextCode,
                                    phone: formatLocalPhoneByCountry(nextCode, next[idx].phone),
                                  };
                                  setOwners(next);
                                  const nextOwnerErrors = [...ownerErrors];
                                  nextOwnerErrors[idx] = { ...nextOwnerErrors[idx], phone: undefined };
                                  setOwnerErrors(nextOwnerErrors);
                                }}
                                className="w-full px-2 py-2 bg-ai-bg border border-ai-border rounded-md text-ai-text text-xs focus:outline-none focus:ring-2 focus:ring-ai-accent"
                              >
                                {PHONE_COUNTRIES.map(country => (
                                  <option key={country.code} value={country.code}>
                                    {country.iso} {country.code}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="tel"
                                value={owner.phone}
                                onChange={e => {
                                  const next = [...owners];
                                  next[idx] = {
                                    ...next[idx],
                                    phone: formatLocalPhoneByCountry(next[idx].phoneCountryCode, e.target.value),
                                  };
                                  setOwners(next);
                                  const nextOwnerErrors = [...ownerErrors];
                                  nextOwnerErrors[idx] = { ...nextOwnerErrors[idx], phone: undefined };
                                  setOwnerErrors(nextOwnerErrors);
                                }}
                                className="w-full px-3 py-2 bg-ai-bg border border-ai-border rounded-md text-ai-text text-sm focus:outline-none focus:ring-2 focus:ring-ai-accent"
                                placeholder="(00) 00000-0000"
                              />
                            </div>
                            {ownerErrors[idx]?.phone && (
                              <p className="text-xs text-ai-error">{ownerErrors[idx]?.phone}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {editingClient && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-4 h-4 text-ai-subtext" />
                      <label className="block text-sm font-medium text-ai-text">
                        Fazendas cadastradas para esta organização
                      </label>
                    </div>
                    {loadingEditingClientFarms ? (
                      <div className="border border-ai-border rounded-md p-4 flex items-center gap-2 text-ai-subtext text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Carregando fazendas...</span>
                      </div>
                    ) : editingClientFarms.length === 0 ? (
                      <div className="border border-dashed border-ai-border rounded-md p-4 text-center">
                        <p className="text-xs text-ai-subtext">Nenhuma fazenda cadastrada para esta organização.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {editingClientFarms.map(farm => (
                          <div key={farm.id} className="rounded-md border border-ai-border bg-ai-surface2 px-3 py-2">
                            <p className="text-sm font-medium text-ai-text">{farm.name}</p>
                            <p className="text-xs text-ai-subtext">
                              {farm.city}, {farm.state || farm.country}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Analista Responsável */}
                <div
                  data-error={formErrors.analystId ? 'true' : undefined}
                  onClick={
                    currentUser.role !== 'admin'
                      ? () => onToast?.('Entre em contato com a Inttegra', 'warning')
                      : undefined
                  }
                  className={currentUser.role !== 'admin' ? 'cursor-pointer' : undefined}
                >
                  <label className="block text-sm font-medium text-ai-text mb-2">
                    Analista Responsável <span className="text-ai-error">*</span>
                  </label>
                  <select
                    value={formData.analystId}
                    onChange={e => setFormData({ ...formData, analystId: e.target.value })}
                    className={`w-full px-4 py-2 bg-ai-surface2 border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent ${
                      formErrors.analystId ? 'border-ai-error' : 'border-ai-border'
                    }`}
                    disabled={currentUser.role !== 'admin'} // Apenas admin pode escolher analista
                  >
                    <option value="">Selecione um analista</option>
                    {analysts.map(analyst => (
                      <option key={analyst.id} value={analyst.id}>
                        {analyst.name} {analyst.email ? `(${analyst.email})` : ''}
                      </option>
                    ))}
                  </select>
                  {formErrors.analystId && <p className="mt-1 text-sm text-ai-error">{formErrors.analystId}</p>}
                  {currentUser.role !== 'admin' && (
                    <p className="mt-1 text-xs text-ai-subtext">
                      Você será automaticamente vinculado como analista responsável
                    </p>
                  )}
                </div>
              </fieldset>
              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-ai-border">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-ai-text bg-ai-surface2 hover:bg-ai-surface3 rounded-md transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || clientFormReadOnly}
                  className="px-4 py-2 bg-ai-accent text-white rounded-md hover:bg-ai-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{editingClient ? 'Atualizar' : 'Cadastrar'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-ai-bg">
      <div className="max-w-7xl mx-auto p-6">
        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ai-subtext" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, email ou telefone..."
              className="w-full pl-10 pr-4 py-2 bg-ai-surface2 border border-ai-border rounded-md text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-ai-error/10 border border-ai-error rounded-md flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-ai-error" />
            <p className="text-ai-error">{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-ai-accent" />
          </div>
        ) : (
          /* Clients List */
          <div className="bg-ai-surface rounded-lg shadow-lg overflow-hidden">
            {filteredClients.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-16 h-16 text-ai-subtext mx-auto mb-4" />
                <p className="text-ai-subtext text-lg">
                  {searchTerm ? 'Nenhuma organização encontrada' : 'Nenhuma organização cadastrada'}
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => {
                      resetForm();
                      setView('form');
                    }}
                    className="mt-4 px-4 py-2 bg-ai-accent text-white rounded-md hover:bg-ai-accent/90 transition-colors"
                  >
                    Cadastrar Primeira Organização
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-ai-surface2">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">
                        Organização
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">
                        Contato
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">
                        Analista
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">
                        Gestores
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ai-subtext uppercase tracking-wider">
                        Fazendas
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-ai-subtext uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ai-border">
                    {filteredClients.map(client => (
                      <ClientRow
                        key={client.id}
                        client={client}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        deletingClientId={deletingClientId}
                        getClientFarms={getClientFarms}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface ClientRowProps {
  client: Client & { analyst?: { name: string; email: string } };
  onEdit: (client: Client) => void;
  onDelete: (clientId: string) => void;
  deletingClientId: string | null;
  getClientFarms: (clientId: string) => Promise<Farm[]>;
}

const ClientRow: React.FC<ClientRowProps> = ({ client, onEdit, onDelete, deletingClientId, getClientFarms }) => {
  const [farmsCount, setFarmsCount] = useState<number | null>(null);
  const [ownersCount, setOwnersCount] = useState<number | null>(null);
  const [loadingFarms, setLoadingFarms] = useState(false);
  const [showFarmsModal, setShowFarmsModal] = useState(false);
  const [clientFarmsList, setClientFarmsList] = useState<Farm[]>([]);
  const [loadingFarmsList, setLoadingFarmsList] = useState(false);

  useEffect(() => {
    loadFarmsCount();
    loadOwnersCount();
  }, [client.id]);

  const loadOwnersCount = async () => {
    try {
      const { count, error } = await supabase
        .from('client_owners')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id);
      if (!error) setOwnersCount(count ?? 0);
    } catch {
      setOwnersCount(0);
    }
  };

  const loadFarmsCount = async () => {
    setLoadingFarms(true);
    try {
      // Buscar diretamente da tabela client_farms para contar (mais eficiente)
      const { data, error, count } = await supabase
        .from('client_farms')
        .select('*', { count: 'exact', head: false })
        .eq('client_id', client.id);

      if (error) {
        console.error('[ClientRow] Error loading farms count:', error);
        // Fallback: usar getClientFarms
        const clientFarms = await getClientFarms(client.id);
        setFarmsCount(clientFarms.length);
      } else {
        // Usar count se disponível, senão usar o tamanho do array
        setFarmsCount(count !== null ? count : data?.length || 0);
      }
    } catch (err) {
      console.error('[ClientRow] Error loading farms:', err);
      // Fallback: usar getClientFarms
      try {
        const clientFarms = await getClientFarms(client.id);
        setFarmsCount(clientFarms.length);
      } catch (fallbackErr) {
        console.error('[ClientRow] Error in fallback:', fallbackErr);
        setFarmsCount(0);
      }
    } finally {
      setLoadingFarms(false);
    }
  };

  const handleViewFarms = async () => {
    if ((farmsCount ?? 0) === 0) {
      return; // Não abrir modal se não houver fazendas
    }

    setShowFarmsModal(true);
    setLoadingFarmsList(true);
    try {
      const farms = await getClientFarms(client.id);
      setClientFarmsList(farms);
    } catch (err) {
      console.error('[ClientRow] Error loading farms list:', err);
      setClientFarmsList([]);
    } finally {
      setLoadingFarmsList(false);
    }
  };

  return (
    <>
      <tr className="hover:bg-ai-surface2 transition-colors">
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-ai-accent/20 flex items-center justify-center mr-3">
              <User className="w-5 h-5 text-ai-accent" />
            </div>
            <div>
              <div className="text-sm font-medium text-ai-text">{client.name}</div>
            </div>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="text-sm text-ai-text space-y-1">
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4 text-ai-subtext" />
              <span>{client.email}</span>
            </div>
            {client.phone && (
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4 text-ai-subtext" />
                <span>{client.phone}</span>
              </div>
            )}
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="text-sm text-ai-text">{client.analyst?.name || 'N/A'}</div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center space-x-1 text-sm text-ai-text">
            <Users className="w-4 h-4 text-ai-subtext" />
            <span>{ownersCount ?? 0}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          {loadingFarms ? (
            <Loader2 className="w-4 h-4 animate-spin text-ai-accent" />
          ) : (
            <button
              onClick={handleViewFarms}
              disabled={(farmsCount ?? 0) === 0}
              className={`flex items-center space-x-1 text-sm text-ai-text ${
                (farmsCount ?? 0) > 0
                  ? 'hover:text-ai-accent hover:underline cursor-pointer transition-colors'
                  : 'cursor-not-allowed opacity-60'
              }`}
              title={(farmsCount ?? 0) > 0 ? 'Clique para ver as fazendas' : 'Nenhuma fazenda vinculada'}
            >
              <Building2 className="w-4 h-4 text-ai-subtext" />
              <span>
                {farmsCount ?? 0} fazenda{farmsCount !== 1 ? 's' : ''}
              </span>
            </button>
          )}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end space-x-2">
            <button
              onClick={() => onEdit(client)}
              className="p-2 text-ai-accent hover:bg-ai-surface2 rounded-md transition-colors"
              title="Editar"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(client.id)}
              disabled={deletingClientId === client.id}
              className="p-2 text-ai-error hover:bg-ai-error/10 rounded-md transition-colors disabled:opacity-50"
              title="Excluir organização"
            >
              {deletingClientId === client.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </td>
      </tr>

      {/* Modal de Fazendas */}
      {showFarmsModal && (
        <tr>
          <td colSpan={6} className="p-0">
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
              onClick={() => setShowFarmsModal(false)}
            >
              <div
                className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-6 border-b border-ai-border flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-ai-text">Fazendas de {client.name}</h3>
                    <p className="text-sm text-ai-subtext mt-1">
                      {clientFarmsList.length} fazenda{clientFarmsList.length !== 1 ? 's' : ''} cadastrada
                      {clientFarmsList.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowFarmsModal(false)}
                    className="p-2 hover:bg-ai-surface2 rounded-md transition-colors"
                    title="Fechar"
                  >
                    <X className="w-5 h-5 text-ai-subtext" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                  {loadingFarmsList ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-ai-accent" />
                    </div>
                  ) : clientFarmsList.length === 0 ? (
                    <div className="text-center py-12">
                      <Building2 className="w-12 h-12 text-ai-subtext mx-auto mb-4" />
                      <p className="text-ai-subtext">Nenhuma fazenda vinculada a esta organização</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {clientFarmsList.map(farm => (
                        <div
                          key={farm.id}
                          className="border border-ai-border rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-ai-accent/10 flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-5 h-5 text-ai-accent" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-ai-text truncate">{farm.name}</h4>
                              <p className="text-sm text-ai-subtext mt-1">
                                {farm.city}, {farm.state || farm.country}
                              </p>
                              {farm.productionSystem && (
                                <p className="text-xs text-ai-subtext mt-2">Sistema: {farm.productionSystem}</p>
                              )}
                              {farm.totalArea && (
                                <p className="text-xs text-ai-subtext">
                                  Área total: {farm.totalArea.toFixed(2).replace('.', ',')} ha
                                </p>
                              )}
                              {farm.propertyValue && (
                                <p className="text-xs text-ai-subtext">
                                  Valor: R$ {farm.propertyValue.toLocaleString('pt-BR')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-ai-border flex justify-end">
                  <button
                    onClick={() => setShowFarmsModal(false)}
                    className="px-4 py-2 bg-ai-accent text-white rounded-md hover:bg-ai-accent/90 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default ClientManagement;

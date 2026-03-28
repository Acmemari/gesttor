import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { User } from '../types';
import { TokenQuotaCard } from './shared/TokenQuotaCard';

interface Company {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  description?: string;
  plan?: 'essencial' | 'gestor' | 'pro';
  status?: 'active' | 'inactive' | 'pending';
}
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { getAuthHeaders } from '../lib/session';
import { authClient } from '../lib/auth/betterAuthClient';
import { getQuestions, createQuestion, updateQuestion, deleteQuestion } from '../lib/questions';
import { clearQuestionsCache } from '../hooks/useQuestions';
import {
  User as UserIcon,
  Lock,
  Building2,
  Palette,
  Shield,
  HelpCircle,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  Trash2,
  LogOut,
  Upload,
  Download,
  Globe,
  Moon,
  Sun,
  Monitor,
  Plus,
  Edit,
  Search,
  FileCheck,
} from 'lucide-react';

interface SettingsPageProps {
  user: User;
  onBack: () => void;
  onToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onLogout: () => void;
}

type TabId = 'profile' | 'account' | 'company' | 'appearance' | 'privacy' | 'support' | 'questionnaires' | 'system';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ user, onBack, onToast, onLogout }) => {
  const { refreshProfile } = useAuth();
  const { refreshSettings: refreshLocationSettings } = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Profile state
  const [profileData, setProfileData] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: '',
    avatar: user.avatar || user.name?.charAt(0).toUpperCase() || 'U',
  });

  // Account state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [emailVerified, setEmailVerified] = useState(false);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Company state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [companyForm, setCompanyForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    description: '',
    plan: 'essencial' as 'essencial' | 'gestor' | 'pro',
    status: 'active' as 'active' | 'inactive' | 'pending',
  });

  // Appearance state
  const [appearance, setAppearance] = useState({
    theme: 'system' as 'light' | 'dark' | 'system',
    language: 'pt-BR',
    dateFormat: 'DD/MM/YYYY',
    currency: 'BRL',
  });

  // Privacy state
  const [privacy, setPrivacy] = useState({
    profileVisibility: 'private',
    dataSharing: false,
  });

  // Questions state (apenas para admin)
  const [questions, setQuestions] = useState<any[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [questionsTableMissing, setQuestionsTableMissing] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [questionForm, setQuestionForm] = useState({
    category: '' as 'Gente' | 'Gestão' | 'Produção' | '',
    group: '',
    question: '',
    positiveAnswer: 'Sim' as 'Sim' | 'Não',
    applicableTypes: [] as ('Cria' | 'Recria e Engorda' | 'Ciclo Completo')[],
  });

  // Filtros na listagem de perguntas (apenas visualização; não altera ordem de preenchimento)
  const [filterQuestionCategory, setFilterQuestionCategory] = useState<string>('');
  const [filterQuestionGroup, setFilterQuestionGroup] = useState<string>('');

  // System settings (admin only)
  const [paraguayEnabled, setParaguayEnabled] = useState(false);
  const [isLoadingParaguaySetting, setIsLoadingParaguaySetting] = useState(false);

  // Estrutura de categorias e grupos
  const categoriesAndGroups = {
    Gente: ['Liderança', 'Valores', 'Autonomia', 'Domínio', 'Propósito'],
    Gestão: ['Projeto', 'Execução', 'Gerenciamento'],
    Produção: [
      'Cuidados com Solo',
      'Manejo de Pastagens',
      'Estratégia de Entressafra',
      'Layout',
      'Suplementação de Precisão',
      'Genética Melhoradora',
      'Reprodução',
      'Sanidade Forte',
      'Bem estar animal',
    ],
  };

  // Perguntas filtradas por categoria/grupo (só na gestão; preenchimento continua randomizado)
  const filteredQuestionsForList = useMemo(() => {
    return questions.filter(
      q =>
        (!filterQuestionCategory || q.category === filterQuestionCategory) &&
        (!filterQuestionGroup || q.group === filterQuestionGroup),
    );
  }, [questions, filterQuestionCategory, filterQuestionGroup]);

  const filterGroupOptions = useMemo(() => {
    const subset = filterQuestionCategory ? questions.filter(q => q.category === filterQuestionCategory) : questions;
    const groups = [...new Set(subset.map(q => q.group).filter(Boolean))].sort();
    return groups;
  }, [questions, filterQuestionCategory]);

  const tabs: Tab[] = [
    { id: 'profile', label: 'Perfil', icon: <UserIcon size={18} /> },
    { id: 'account', label: 'Conta', icon: <Lock size={18} /> },
    { id: 'company', label: 'Cadastro de Empresa', icon: <Building2 size={18} /> },
    { id: 'appearance', label: 'Aparência', icon: <Palette size={18} /> },
    { id: 'privacy', label: 'Privacidade', icon: <Shield size={18} /> },
    { id: 'support', label: 'Suporte', icon: <HelpCircle size={18} /> },
    ...(user.role === 'admin'
      ? [
          { id: 'questionnaires' as TabId, label: 'Questionários', icon: <FileCheck size={18} /> },
          { id: 'system' as TabId, label: 'Sistema', icon: <Globe size={18} /> },
        ]
      : []),
  ];

  useEffect(() => {
    setEmailVerified(true);

    // Load user profile data
    loadUserProfile();

    // Load companies if on company tab
    if (activeTab === 'company') {
      loadCompanies();
    }

    // Load questions if on questionnaires tab
    if (activeTab === 'questionnaires' && user.role === 'admin') {
      loadQuestions();
    }

    // Load system settings if on system tab
    if (activeTab === 'system' && user.role === 'admin') {
      loadParaguaySetting();
    }
  }, [activeTab]);

  const mapDbToApp = (row: any) => ({
    id: row.id,
    category: row.category,
    group: row.group,
    question: row.question,
    positiveAnswer: row.positive_answer,
    applicableTypes: row.applicable_types || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

  const loadQuestions = async () => {
    setIsLoadingQuestions(true);
    try {
      const data = await getQuestions();
      setQuestions(data as any[]);
      setQuestionsTableMissing(false);
    } catch {
      setQuestionsTableMissing(true);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const loadParaguaySetting = async () => {
    // app_settings table not in new schema — Paraguay always disabled
    setParaguayEnabled(false);
    setIsLoadingParaguaySetting(false);
  };

  const handleSaveParaguaySetting = async () => {
    onToast('Configuração não disponível nesta versão.', 'info');
  };

  const handleSaveQuestion = async () => {
    if (!questionForm.category || !questionForm.group || !questionForm.question) {
      onToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }

    if (questionForm.applicableTypes.length === 0) {
      onToast('Selecione pelo menos um tipo de questionário aplicável', 'error');
      return;
    }

    try {
      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, {
          category: questionForm.category,
          group: questionForm.group,
          question: questionForm.question,
          positiveAnswer: questionForm.positiveAnswer,
          applicableTypes: questionForm.applicableTypes,
        });
        onToast('Pergunta atualizada com sucesso!', 'success');
      } else {
        await createQuestion({
          category: questionForm.category,
          group: questionForm.group,
          question: questionForm.question,
          positiveAnswer: questionForm.positiveAnswer,
          applicableTypes: questionForm.applicableTypes,
        });
        onToast('Pergunta criada com sucesso!', 'success');
      }
      clearQuestionsCache();
      setShowQuestionForm(false);
      setEditingQuestion(null);
      setQuestionForm({ category: '', group: '', question: '', positiveAnswer: 'Sim', applicableTypes: [] });
      await loadQuestions();
    } catch (err: any) {
      onToast(err.message || 'Erro ao salvar pergunta', 'error');
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    try {
      await deleteQuestion(questionId);
      clearQuestionsCache();
      onToast('Pergunta excluída com sucesso!', 'success');
      await loadQuestions();
    } catch (err: any) {
      onToast(err.message || 'Erro ao excluir pergunta', 'error');
    }
  };

  const handleToggleApplicableType = (type: 'Cria' | 'Recria e Engorda' | 'Ciclo Completo') => {
    setQuestionForm(prev => ({
      ...prev,
      applicableTypes: prev.applicableTypes.includes(type)
        ? prev.applicableTypes.filter(t => t !== type)
        : [...prev.applicableTypes, type],
    }));
  };

  const loadUserProfile = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/auth', { headers });
      const json = await res.json() as { ok: boolean; data?: { name?: string; email?: string; phone?: string; avatar?: string } };
      if (json.ok && json.data) {
        const data = json.data;
        setProfileData({
          name: data.name || user.name || '',
          email: data.email || user.email || '',
          phone: data.phone || '',
          avatar: data.avatar || user.avatar || user.name?.charAt(0).toUpperCase() || 'U',
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleProfileChange = (field: string, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const trimmedName = profileData.name.trim();
      const trimmedEmail = profileData.email.trim();

      if (!trimmedName) throw new Error('O nome não pode ficar vazio');
      if (!trimmedEmail) throw new Error('O email não pode ficar vazio');

      const headers = await getAuthHeaders();
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ name: trimmedName, phone: profileData.phone || null }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao salvar perfil');

      if (trimmedEmail !== user.email) {
        onToast('Alteração de email não é suportada nesta versão.', 'info');
      }

      await refreshProfile();
      setProfileData(prev => ({ ...prev, name: trimmedName, email: trimmedEmail }));
      onToast('Perfil atualizado com sucesso!', 'success');
      setHasUnsavedChanges(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao salvar perfil';
      onToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      onToast('As senhas não coincidem', 'error');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      onToast('A senha deve ter pelo menos 6 caracteres', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
        revokeOtherSessions: false,
      });

      if (error) {
        onToast(error.message ?? 'Erro ao alterar senha', 'error');
        return;
      }

      onToast('Senha alterada com sucesso!', 'success');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao alterar senha', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/auth', { method: 'DELETE', headers });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao excluir conta. Por favor, entre em contato com o suporte.');

      onToast('Sua conta foi excluída com sucesso.', 'success');
      setTimeout(() => { onLogout(); }, 1500);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao excluir conta. Tente novamente ou entre em contato com o suporte.';
      onToast(msg, 'error');
      setIsSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDownloadData = async () => {
    try {
      const headers = await getAuthHeaders();
      const profileRes = await fetch('/api/auth', { headers });
      const profileJson = await profileRes.json() as { ok: boolean; data?: unknown };

      const exportData = {
        profile: profileJson.ok ? profileJson.data : null,
        messages: [],
        scenarios: [],
        exportedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gesttor-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onToast('Dados exportados com sucesso!', 'success');
    } catch (error: unknown) {
      void error;
      onToast('Erro ao exportar dados', 'error');
    }
  };

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-ai-text mb-4">Informações do Perfil</h3>

        {/* Avatar Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-ai-text mb-2">Foto do Perfil</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-ai-accent text-white flex items-center justify-center text-2xl font-bold">
              {profileData.avatar || profileData.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <button className="px-4 py-2 bg-ai-surface border border-ai-border rounded-lg text-sm text-ai-text hover:bg-ai-surface2 transition-colors flex items-center gap-2">
                <Upload size={16} />
                Alterar Foto
              </button>
              <p className="text-xs text-ai-subtext mt-1">JPG, PNG ou GIF. Máx. 2MB</p>
            </div>
          </div>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-ai-text mb-2">Nome Completo</label>
          <input
            type="text"
            value={profileData.name}
            onChange={e => handleProfileChange('name', e.target.value)}
            className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
            placeholder="Seu nome completo"
          />
        </div>

        {/* Email */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-ai-text mb-2">Email</label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={profileData.email}
              onChange={e => handleProfileChange('email', e.target.value)}
              className="flex-1 px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
              placeholder="seu@email.com"
            />
            {emailVerified && (
              <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded border border-green-200">
                <CheckCircle2 size={14} />
                Verificado
              </span>
            )}
          </div>
        </div>

        {/* Phone */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-ai-text mb-2">Telefone</label>
          <input
            type="tel"
            value={profileData.phone}
            onChange={e => handleProfileChange('phone', e.target.value)}
            className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
            placeholder="(00) 00000-0000"
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveProfile}
          disabled={isSaving || !hasUnsavedChanges}
          className="px-6 py-2.5 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Save size={16} />
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>
    </div>
  );

  const renderAccountTab = () => (
    <div className="space-y-6">
      {/* Change Password */}
      <div>
        <h3 className="text-lg font-semibold text-ai-text mb-4">Alterar Senha</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ai-text mb-2">Senha Atual</label>
            <div className="relative">
              <input
                type={showPasswords.current ? 'text' : 'password'}
                value={passwordData.currentPassword}
                onChange={e => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent pr-10"
                placeholder="Digite sua senha atual"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ai-subtext hover:text-ai-text"
              >
                {showPasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ai-text mb-2">Nova Senha</label>
            <div className="relative">
              <input
                type={showPasswords.new ? 'text' : 'password'}
                value={passwordData.newPassword}
                onChange={e => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent pr-10"
                placeholder="Digite sua nova senha"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ai-subtext hover:text-ai-text"
              >
                {showPasswords.new ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ai-text mb-2">Confirmar Nova Senha</label>
            <div className="relative">
              <input
                type={showPasswords.confirm ? 'text' : 'password'}
                value={passwordData.confirmPassword}
                onChange={e => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent pr-10"
                placeholder="Confirme sua nova senha"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ai-subtext hover:text-ai-text"
              >
                {showPasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button
            onClick={handlePasswordChange}
            disabled={isSaving || !passwordData.newPassword || !passwordData.confirmPassword}
            className="px-6 py-2.5 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Alterando...' : 'Alterar Senha'}
          </button>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="border-t border-ai-border pt-6">
        <h3 className="text-lg font-semibold text-ai-text mb-4">Sessões Ativas</h3>
        <div className="space-y-2">
          <div className="p-4 bg-ai-surface rounded-lg border border-ai-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ai-text">Sessão Atual</p>
                <p className="text-sm text-ai-subtext">Este dispositivo • {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
              <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded border border-green-200">
                Ativa
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Token Quota */}
      <div className="border-t border-ai-border pt-6">
        <h3 className="text-lg font-semibold text-ai-text mb-4">Uso de Inteligência Artificial</h3>
        <TokenQuotaCard />
      </div>

      {/* Delete Account */}
      <div className="border-t border-ai-border pt-6">
        <h3 className="text-lg font-semibold text-red-600 mb-4">Zona de Perigo</h3>
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <p className="text-sm text-red-800 mb-4">
            Ao excluir sua conta, todos os seus dados serão permanentemente removidos. Esta ação não pode ser desfeita.
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <Trash2 size={16} />
            Excluir Conta
          </button>
        </div>
      </div>
    </div>
  );

  const loadCompanies = async () => {
    setIsLoadingCompanies(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/organizations?limit=100', { headers });
      const json = await res.json() as { ok: boolean; data?: Array<{ id: string; name: string; phone?: string; address?: string; city?: string; state?: string; plan?: string; status?: string }> };
      if (!json.ok) throw new Error('Erro ao carregar organizações');
      const rows = json.data ?? [];
      // Remove duplicates by name (case-insensitive)
      const seen = new Set<string>();
      const unique = rows.filter(r => {
        const key = r.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setCompanies(unique.map(r => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        address: r.address,
        city: r.city,
        state: r.state,
        plan: r.plan as Company['plan'],
        status: r.status as Company['status'],
      })));
    } catch (error: unknown) {
      void error;
      onToast('Erro ao carregar empresas', 'error');
    } finally {
      setIsLoadingCompanies(false);
    }
  };

  const handleCompanyFormChange = (field: string, value: string) => {
    setCompanyForm(prev => ({ ...prev, [field]: value }));
  };

  const formatPhone = (phone: string): string => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 11) {
      return cleanPhone.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    } else if (cleanPhone.length === 10) {
      return cleanPhone.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    }
    return phone;
  };

  const formatCEP = (cep: string): string => {
    const cleanCEP = cep.replace(/\D/g, '');
    if (cleanCEP.length === 8) {
      return cleanCEP.replace(/^(\d{5})(\d{3})$/, '$1-$2');
    }
    return cep;
  };

  const handleSaveCompany = async () => {
    if (!companyForm.name.trim()) {
      onToast('Nome da empresa é obrigatório', 'error');
      return;
    }

    if (user.role !== 'admin') {
      onToast('Apenas administradores podem cadastrar empresas', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const companyName = companyForm.name.trim();
      const headers = await getAuthHeaders();

      const payload = {
        name: companyName,
        phone: companyForm.phone ? companyForm.phone.replace(/\D/g, '') : null,
        address: companyForm.address.trim() || null,
        city: companyForm.city.trim() || null,
        state: companyForm.state.trim().toUpperCase() || null,
        plan: companyForm.plan,
        status: companyForm.status,
      };

      if (editingCompany) {
        const res = await fetch('/api/organizations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ id: editingCompany.id, ...payload }),
        });
        const json = await res.json() as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? 'Erro ao atualizar empresa');
        onToast('Empresa atualizada com sucesso!', 'success');
      } else {
        const res = await fetch('/api/organizations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(payload),
        });
        const json = await res.json() as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? 'Erro ao criar empresa');
        onToast('Empresa cadastrada com sucesso!', 'success');
      }

      setShowCompanyForm(false);
      setEditingCompany(null);
      resetCompanyForm();
      await loadCompanies();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao salvar empresa';
      onToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCompany = (company: Company) => {
    // Only admins can edit companies
    if (user.role !== 'admin') {
      onToast('Apenas administradores podem editar empresas', 'error');
      return;
    }
    setEditingCompany(company);
    setCompanyForm({
      name: company.name || '',
      phone: company.phone ? formatPhone(company.phone) : '',
      address: company.address || '',
      city: company.city || '',
      state: company.state || '',
      zip_code: company.zip_code ? formatCEP(company.zip_code) : '',
      description: company.description || '',
      plan: company.plan || 'essencial',
      status: company.status || 'active',
    });
    setShowCompanyForm(true);
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (user.role !== 'admin') {
      onToast('Apenas administradores podem excluir empresas', 'error');
      return;
    }

    if (!confirm('Tem certeza que deseja excluir esta empresa? Esta ação não pode ser desfeita.')) {
      return;
    }

    setIsSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/organizations?id=${encodeURIComponent(companyId)}`, { method: 'DELETE', headers });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'Erro ao excluir empresa');
      onToast('Empresa excluída com sucesso!', 'success');
      await loadCompanies();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao excluir empresa';
      onToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const resetCompanyForm = () => {
    setCompanyForm({
      name: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip_code: '',
      description: '',
      plan: 'essencial',
      status: 'active',
    });
    setEditingCompany(null);
  };

  const filteredCompanies = companies.filter(company => company.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const renderCompanyTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-ai-text">Cadastro de Empresas</h3>
        {user.role === 'admin' && (
          <button
            onClick={() => {
              resetCompanyForm();
              setShowCompanyForm(true);
            }}
            className="px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            Nova Empresa
          </button>
        )}
      </div>

      {/* Company Form Modal */}
      {showCompanyForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ai-text">
                {editingCompany ? 'Editar Empresa' : 'Nova Empresa'}
              </h3>
              <button
                onClick={() => {
                  setShowCompanyForm(false);
                  resetCompanyForm();
                }}
                className="text-ai-subtext hover:text-ai-text"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-ai-text mb-2">
                  Nome da Empresa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={companyForm.name}
                  onChange={e => handleCompanyFormChange('name', e.target.value)}
                  className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                  placeholder="Nome da empresa"
                  required
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-ai-text mb-2">Telefone</label>
                <input
                  type="text"
                  value={companyForm.phone}
                  onChange={e => {
                    const formatted = formatPhone(e.target.value);
                    handleCompanyFormChange('phone', formatted);
                  }}
                  className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-ai-text mb-2">Endereço</label>
                <input
                  type="text"
                  value={companyForm.address}
                  onChange={e => handleCompanyFormChange('address', e.target.value)}
                  className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                  placeholder="Rua, número, complemento"
                />
              </div>

              {/* City, State, ZIP Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-ai-text mb-2">Cidade</label>
                  <input
                    type="text"
                    value={companyForm.city}
                    onChange={e => handleCompanyFormChange('city', e.target.value)}
                    className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                    placeholder="Cidade"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ai-text mb-2">UF</label>
                  <input
                    type="text"
                    value={companyForm.state}
                    onChange={e => handleCompanyFormChange('state', e.target.value.toUpperCase())}
                    className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                    placeholder="UF"
                    maxLength={2}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ai-text mb-2">CEP</label>
                <input
                  type="text"
                  value={companyForm.zip_code}
                  onChange={e => {
                    const formatted = formatCEP(e.target.value);
                    handleCompanyFormChange('zip_code', formatted);
                  }}
                  className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                  placeholder="00000-000"
                  maxLength={9}
                />
              </div>

              {/* Plan and Status Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ai-text mb-2">Plano</label>
                  <select
                    value={companyForm.plan}
                    onChange={e => handleCompanyFormChange('plan', e.target.value)}
                    className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                  >
                    <option value="essencial">Essencial</option>
                    <option value="gestor">Gestor</option>
                    <option value="pro">Pró</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ai-text mb-2">Status</label>
                  <select
                    value={companyForm.status}
                    onChange={e => handleCompanyFormChange('status', e.target.value)}
                    className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                    <option value="pending">Pendente</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-ai-text mb-2">Descrição</label>
                <textarea
                  value={companyForm.description}
                  onChange={e => handleCompanyFormChange('description', e.target.value)}
                  className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
                  placeholder="Descrição da empresa ou atividade principal"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCompanyForm(false);
                  resetCompanyForm();
                }}
                className="flex-1 px-4 py-2 border border-ai-border text-ai-text rounded-lg font-medium hover:bg-ai-surface2 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCompany}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {isSaving ? 'Salvando...' : editingCompany ? 'Atualizar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ai-subtext" size={18} />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
          placeholder="Buscar empresas por nome..."
        />
      </div>

      {/* Companies Table */}
      {isLoadingCompanies ? (
        <div className="text-center py-8 text-ai-subtext">Carregando empresas...</div>
      ) : filteredCompanies.length === 0 ? (
        <div className="text-center py-8 text-ai-subtext">
          {searchTerm
            ? 'Nenhuma empresa encontrada'
            : user.role === 'admin'
              ? 'Nenhuma empresa cadastrada. Clique em "Nova Empresa" para começar.'
              : 'Nenhuma empresa cadastrada.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-ai-surface border-b border-ai-border">
                <th className="px-4 py-3 text-left text-sm font-semibold text-ai-text">Nome</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ai-text">Plano</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ai-text">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ai-text">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map(company => (
                <tr key={company.id} className="border-b border-ai-border hover:bg-ai-surface/50">
                  <td className="px-4 py-3 text-sm text-ai-text">{company.name}</td>
                  <td className="px-4 py-3 text-sm text-ai-subtext">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        company.plan === 'pro'
                          ? 'bg-purple-100 text-purple-700'
                          : company.plan === 'gestor'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {company.plan === 'pro'
                        ? 'Pró'
                        : company.plan === 'gestor'
                          ? 'Gestor'
                          : 'Essencial'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-ai-subtext">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        company.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : company.status === 'inactive'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {company.status === 'active' ? 'Ativo' : company.status === 'inactive' ? 'Inativo' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {user.role === 'admin' && (
                        <>
                          <button
                            onClick={() => handleEditCompany(company)}
                            className="p-2 text-ai-accent hover:bg-ai-surface2 rounded transition-colors"
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteCompany(company.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderAppearanceTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-ai-text mb-4">Personalização</h3>

      {/* Theme */}
      <div>
        <label className="block text-sm font-medium text-ai-text mb-2">Tema</label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'light', label: 'Claro', icon: <Sun size={20} /> },
            { value: 'dark', label: 'Escuro', icon: <Moon size={20} /> },
            { value: 'system', label: 'Automático', icon: <Monitor size={20} /> },
          ].map(theme => (
            <button
              key={theme.value}
              onClick={() => setAppearance(prev => ({ ...prev, theme: theme.value as any }))}
              className={`p-4 border rounded-lg flex flex-col items-center gap-2 transition-colors ${
                appearance.theme === theme.value
                  ? 'border-ai-accent bg-ai-accent/10'
                  : 'border-ai-border bg-white hover:border-ai-subtext'
              }`}
            >
              {theme.icon}
              <span className="text-sm font-medium text-ai-text">{theme.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div>
        <label className="block text-sm font-medium text-ai-text mb-2">Idioma</label>
        <select
          value={appearance.language}
          onChange={e => setAppearance(prev => ({ ...prev, language: e.target.value }))}
          className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
        >
          <option value="pt-BR">Português (Brasil)</option>
          <option value="en-US">English (US)</option>
          <option value="es-ES">Español</option>
        </select>
      </div>

      {/* Date Format */}
      <div>
        <label className="block text-sm font-medium text-ai-text mb-2">Formato de Data</label>
        <select
          value={appearance.dateFormat}
          onChange={e => setAppearance(prev => ({ ...prev, dateFormat: e.target.value }))}
          className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
        >
          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
        </select>
      </div>

      {/* Currency */}
      <div>
        <label className="block text-sm font-medium text-ai-text mb-2">Moeda Padrão</label>
        <select
          value={appearance.currency}
          onChange={e => setAppearance(prev => ({ ...prev, currency: e.target.value }))}
          className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
        >
          <option value="BRL">R$ (Real Brasileiro)</option>
          <option value="USD">$ (Dólar Americano)</option>
          <option value="EUR">€ (Euro)</option>
        </select>
      </div>
    </div>
  );

  const renderPrivacyTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-ai-text mb-4">Configurações de Privacidade</h3>

      {/* Profile Visibility */}
      <div>
        <label className="block text-sm font-medium text-ai-text mb-2">Visibilidade do Perfil</label>
        <select
          value={privacy.profileVisibility}
          onChange={e => setPrivacy(prev => ({ ...prev, profileVisibility: e.target.value }))}
          className="w-full px-4 py-2 border border-ai-border rounded-lg bg-white text-ai-text focus:outline-none focus:ring-2 focus:ring-ai-accent"
        >
          <option value="private">Privado</option>
          <option value="public">Público</option>
          <option value="contacts">Apenas Contatos</option>
        </select>
      </div>

      {/* Data Sharing */}
      <div className="flex items-center justify-between p-4 bg-ai-surface rounded-lg border border-ai-border">
        <div>
          <p className="font-medium text-ai-text">Compartilhamento de Dados</p>
          <p className="text-sm text-ai-subtext mt-1">Permitir compartilhamento anônimo de dados para melhorias</p>
        </div>
        <button
          onClick={() => setPrivacy(prev => ({ ...prev, dataSharing: !prev.dataSharing }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            privacy.dataSharing ? 'bg-ai-accent' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              privacy.dataSharing ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Download Data */}
      <div className="border-t border-ai-border pt-6">
        <h3 className="text-lg font-semibold text-ai-text mb-4">LGPD - Seus Dados</h3>
        <div className="p-4 bg-ai-surface rounded-lg border border-ai-border">
          <p className="text-sm text-ai-subtext mb-4">
            Você tem o direito de baixar todos os seus dados pessoais armazenados em nossa plataforma.
          </p>
          <button
            onClick={handleDownloadData}
            className="px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors flex items-center gap-2"
          >
            <Download size={16} />
            Baixar Meus Dados
          </button>
        </div>
      </div>

      {/* Activity History */}
      <div className="border-t border-ai-border pt-6">
        <h3 className="text-lg font-semibold text-ai-text mb-4">Histórico de Atividades</h3>
        <div className="p-4 bg-ai-surface rounded-lg border border-ai-border">
          <p className="text-sm text-ai-subtext">
            Seu histórico de atividades está sendo registrado para melhorar sua experiência.
          </p>
          <button className="mt-4 px-4 py-2 border border-ai-border text-ai-text rounded-lg font-medium hover:bg-ai-surface2 transition-colors">
            Ver Histórico Completo
          </button>
        </div>
      </div>
    </div>
  );

  const renderSystemTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-ai-text mb-4">Configurações do Sistema</h3>

      {/* Versão Paraguai */}
      <div className="flex items-center justify-between p-4 bg-ai-surface rounded-lg border border-ai-border">
        <div>
          <p className="font-medium text-ai-text">Versão Paraguai</p>
          <p className="text-sm text-ai-subtext mt-1">
            Quando ativada, os usuários podem alternar para a versão em espanhol com moeda em Guaraní (G$) e unidades
            em kg de carcaça.
          </p>
        </div>
        {isLoadingParaguaySetting ? (
          <div className="text-ai-subtext text-sm">Carregando...</div>
        ) : (
          <button
            onClick={() => setParaguayEnabled(prev => !prev)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              paraguayEnabled ? 'bg-ai-accent' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                paraguayEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSaveParaguaySetting}
          disabled={isSaving || isLoadingParaguaySetting}
          className="px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Save size={16} />
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );

  const renderSupportTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-ai-text mb-4">Central de Ajuda</h3>

      <div className="grid md:grid-cols-2 gap-4">
        <a
          href="#"
          className="p-6 bg-ai-surface rounded-lg border border-ai-border hover:border-ai-subtext transition-colors"
        >
          <HelpCircle size={24} className="text-ai-accent mb-3" />
          <h4 className="font-medium text-ai-text mb-2">Central de Ajuda</h4>
          <p className="text-sm text-ai-subtext">Encontre respostas para suas dúvidas</p>
        </a>

        <button
          onClick={() => onToast('Funcionalidade em desenvolvimento', 'info')}
          className="p-6 bg-ai-surface rounded-lg border border-ai-border hover:border-ai-subtext transition-colors text-left"
        >
          <HelpCircle size={24} className="text-ai-accent mb-3" />
          <h4 className="font-medium text-ai-text mb-2">Reportar Problema</h4>
          <p className="text-sm text-ai-subtext">Envie um relatório de bug ou problema</p>
        </button>

        <button
          onClick={() => onToast('Funcionalidade em desenvolvimento', 'info')}
          className="p-6 bg-ai-surface rounded-lg border border-ai-border hover:border-ai-subtext transition-colors text-left"
        >
          <HelpCircle size={24} className="text-ai-accent mb-3" />
          <h4 className="font-medium text-ai-text mb-2">Enviar Feedback</h4>
          <p className="text-sm text-ai-subtext">Compartilhe suas sugestões e ideias</p>
        </button>

        <div className="p-6 bg-ai-surface rounded-lg border border-ai-border">
          <Globe size={24} className="text-ai-accent mb-3" />
          <h4 className="font-medium text-ai-text mb-2">Documentação Legal</h4>
          <div className="space-y-2 mt-3">
            <a href="#" className="text-sm text-ai-accent hover:underline block">
              Termos de Uso
            </a>
            <a href="#" className="text-sm text-ai-accent hover:underline block">
              Política de Privacidade
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Função para converter códigos de sistema para o formato aplicável
  const convertSystemCodes = (systemCode: string): ('Cria' | 'Recria e Engorda' | 'Ciclo Completo')[] => {
    const raw = systemCode.replace(/,/g, ';');
    const parts = raw.split(';').map(p => p.trim());
    const result: ('Cria' | 'Recria e Engorda' | 'Ciclo Completo')[] = [];
    const upper = (s: string) => s.toUpperCase();
    for (const p of parts) {
      const u = upper(p);
      if (u === 'CC' || u.startsWith('CC ') || u.startsWith('CC-') || u.startsWith('CICLO')) {
        if (!result.includes('Ciclo Completo')) result.push('Ciclo Completo');
      } else if (u === 'CR' || u.startsWith('CR ') || u.startsWith('CR-') || u === 'CRIA') {
        if (!result.includes('Cria')) result.push('Cria');
      } else if (u === 'RE' || u.startsWith('RE ') || u.startsWith('RE-') || u.startsWith('RECRIA')) {
        if (!result.includes('Recria e Engorda')) result.push('Recria e Engorda');
      }
    }
    return result;
  };

  const parseCsvLine = (line: string, delimiter: string): string[] => {
    const values: string[] = [];
    let current = '';
    let insideQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === delimiter && !insideQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));
    return values;
  };

  const detectDelimiter = (firstLine: string): string => {
    const colsWithComma = parseCsvLine(firstLine, ',').length;
    const colsWithSemicolon = parseCsvLine(firstLine, ';').length;
    return colsWithSemicolon >= colsWithComma && colsWithSemicolon >= 4 ? ';' : ',';
  };

  const normalizeCategory = (raw: string): string | null => {
    const s = raw.trim();
    const lower = s.toLowerCase();
    if (lower === 'gente') return 'Gente';
    if (lower === 'gestão' || lower === 'gestao') return 'Gestão';
    if (lower === 'produção' || lower === 'producao') return 'Produção';
    return null;
  };

  const normalizePositiveAnswer = (raw: string): 'Sim' | 'Não' | null => {
    const s = raw.trim().toLowerCase();
    if (['sim', 's', 'yes', 'y'].includes(s)) return 'Sim';
    if (['não', 'nao', 'n', 'no'].includes(s)) return 'Não';
    return null;
  };

  const parseRowsFromFile = async (file: File): Promise<string[][]> => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) return [];
      const sheet = wb.Sheets[firstSheet];
      const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
      return rawRows.map(row => (Array.isArray(row) ? row : []).map(cell => String(cell ?? '').trim()));
    }
    let text = await file.text();
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    const firstLine = lines[0].replace(/^\uFEFF/, '');
    const delimiter = detectDelimiter(firstLine);
    const rows: string[][] = [];
    for (let i = 0; i < lines.length; i++) rows.push(parseCsvLine(lines[i], delimiter));
    return rows;
  };

  const processRowsToQuestions = (rows: string[][]): any[] => {
    if (rows.length < 2) return [];
    const header = rows[0].map(h => h.trim());
    const pergIdx = header.findIndex(h => {
      const lower = h.toLowerCase().trim();
      return (
        lower === 'per' ||
        lower === 'per.' ||
        lower === 'perg' ||
        lower === 'perg.' ||
        (lower.startsWith('perg') && !lower.includes('pergunta'))
      );
    });
    const categoryIdx = header.findIndex(
      h => h.toLowerCase().includes('categoria') || h.toLowerCase().includes('category'),
    );
    const groupIdx = header.findIndex(h => h.toLowerCase().includes('grupo') || h.toLowerCase().includes('group'));
    const questionIdx = header.findIndex(
      h =>
        (h.toLowerCase().includes('pergunta') || h.toLowerCase().includes('question')) &&
        !/^per\.?$/i.test(h.trim()) &&
        !/^perg\.?$/i.test(h.trim()),
    );
    const positiveAnswerIdx = header.findIndex(
      h =>
        h.toLowerCase().includes('resposta') ||
        h.toLowerCase().includes('positive') ||
        h.toLowerCase().includes('resp'),
    );
    const systemIdx = header.findIndex(h => h.toLowerCase().includes('sistema') || h.toLowerCase().includes('system'));

    if (categoryIdx === -1 || groupIdx === -1 || questionIdx === -1 || positiveAnswerIdx === -1 || systemIdx === -1) {
      return [];
    }

    const importedQuestions: any[] = [];
    let idCounter = 1;
    const maxIdx = Math.max(categoryIdx, groupIdx, questionIdx, positiveAnswerIdx, systemIdx);

    for (let i = 1; i < rows.length; i++) {
      const values = rows[i];
      if (values.length <= maxIdx) continue;

      const categoryRaw = values[categoryIdx]?.trim() || '';
      const group = values[groupIdx]?.trim() || '';
      const question = values[questionIdx]?.trim() || '';
      const positiveAnswerRaw = values[positiveAnswerIdx]?.trim() || '';
      const systemCode = values[systemIdx]?.trim() || '';
      const pergNum = pergIdx >= 0 ? values[pergIdx]?.trim() || '' : '';

      if (!group || !question || !systemCode) continue;

      const category = normalizeCategory(categoryRaw);
      if (!category) continue;
      const positiveAnswer = normalizePositiveAnswer(positiveAnswerRaw);
      if (!positiveAnswer) continue;
      const applicableTypes = convertSystemCodes(systemCode);
      if (applicableTypes.length === 0) continue;

      const questionId = pergNum ? String(pergNum) : String(idCounter++);
      importedQuestions.push({
        id: questionId,
        category,
        group,
        question,
        positiveAnswer,
        applicableTypes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return importedQuestions;
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      onToast('Selecione um arquivo CSV ou Excel (.xlsx, .xls)', 'error');
      return;
    }

    try {
      const rows = await parseRowsFromFile(file);
      if (rows.length < 2) {
        onToast('O arquivo está vazio ou não possui dados suficientes.', 'error');
        return;
      }

      const importedQuestions = processRowsToQuestions(rows);
      if (importedQuestions.length === 0) {
        onToast(
          'Nenhuma pergunta válida. Colunas esperadas: Categoria, Grupo, Pergunta, Resposta positiva, Sistema. Categoria = Gente/Gestão/Produção; Resposta = Sim/Não; Sistema = CC, CR ou RE (ou CC;CR;RE).',
          'error',
        );
        return;
      }

      let created = 0;
      for (const q of importedQuestions) {
        await createQuestion({
          category: q.category,
          group: q.group,
          question: q.question,
          positiveAnswer: q.positiveAnswer,
          applicableTypes: q.applicableTypes,
        });
        created++;
      }
      clearQuestionsCache();
      await loadQuestions();
      onToast(`${created} pergunta(s) importada(s) com sucesso!`, 'success');
      event.target.value = '';
      return;
    } catch (error) {
      console.error('Erro ao importar:', error);
      onToast('Erro ao processar arquivo. Verifique se é CSV ou Excel (.xlsx) com as colunas corretas.', 'error');
    }
  };

  const renderQuestionnairesTab = () => {
    const availableGroups = questionForm.category ? categoriesAndGroups[questionForm.category] || [] : [];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-ai-text">Configurar Perguntas</h3>
            <p className="text-sm text-ai-subtext mt-1">Cadastre e gerencie as perguntas do banco de dados.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors cursor-pointer">
              <Upload size={18} />
              Importar CSV / Excel
              <input type="file" accept=".csv,.xlsx,.xls" onChange={handleImportFile} className="hidden" />
            </label>
            <button
              onClick={() => {
                setEditingQuestion(null);
                setQuestionForm({
                  category: '' as '' | 'Gente' | 'Gestão' | 'Produção',
                  group: '',
                  question: '',
                  positiveAnswer: 'Sim' as 'Sim' | 'Não',
                  applicableTypes: [],
                });
                setShowQuestionForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors"
            >
              <Plus size={18} />
              Adicionar Pergunta
            </button>
          </div>
        </div>

        {/* Filtros por categoria e grupo (só para localizar perguntas; não altera ordem no preenchimento) */}
        {questions.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-ai-surface/50 rounded-lg border border-ai-border">
            <span className="text-sm font-medium text-ai-text">Classificar / Filtrar:</span>
            <select
              value={filterQuestionCategory}
              onChange={e => {
                setFilterQuestionCategory(e.target.value);
                setFilterQuestionGroup('');
              }}
              className="px-3 py-2 text-sm border border-ai-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ai-accent"
            >
              <option value="">Todas as categorias</option>
              <option value="Gente">Gente</option>
              <option value="Gestão">Gestão</option>
              <option value="Produção">Produção</option>
            </select>
            <select
              value={filterQuestionGroup}
              onChange={e => setFilterQuestionGroup(e.target.value)}
              className="px-3 py-2 text-sm border border-ai-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ai-accent min-w-[180px]"
            >
              <option value="">Todos os grupos</option>
              {filterGroupOptions.map(g => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {(filterQuestionCategory || filterQuestionGroup) && (
              <button
                type="button"
                onClick={() => {
                  setFilterQuestionCategory('');
                  setFilterQuestionGroup('');
                }}
                className="px-3 py-2 text-sm border border-ai-border text-ai-text rounded-lg hover:bg-ai-surface2 transition-colors"
              >
                Limpar filtros
              </button>
            )}
            <span className="text-xs text-ai-subtext ml-auto">
              {filteredQuestionsForList.length} de {questions.length} pergunta{questions.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {questionsTableMissing && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">
            <p className="font-medium">Tabela de perguntas ainda não existe no banco.</p>
            <p className="mt-1">
              No Supabase: <strong>SQL Editor</strong> → New query → copie todo o conteúdo do arquivo{' '}
              <code className="bg-amber-100 px-1 rounded">lib/supabase/run_questionnaire_table.sql</code> → Run.
            </p>
            <p className="mt-1 text-amber-700">Depois recarregue esta página. O aviso some quando a tabela existir.</p>
          </div>
        )}

        {showQuestionForm && (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-ai-text">{editingQuestion ? 'Editar Pergunta' : 'Nova Pergunta'}</h4>
              <button
                onClick={() => {
                  setShowQuestionForm(false);
                  setEditingQuestion(null);
                }}
                className="text-ai-subtext hover:text-ai-text"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">
                  Categoria <span className="text-red-500">*</span>
                </label>
                <select
                  value={questionForm.category}
                  onChange={e => {
                    setQuestionForm({
                      ...questionForm,
                      category: e.target.value as 'Gente' | 'Gestão' | 'Produção',
                      group: '', // Reset group when category changes
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-green-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white"
                >
                  <option value="">Selecione a categoria</option>
                  <option value="Gente">Gente</option>
                  <option value="Gestão">Gestão</option>
                  <option value="Produção">Produção</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">
                  Grupo <span className="text-red-500">*</span>
                </label>
                <select
                  value={questionForm.group}
                  onChange={e => setQuestionForm({ ...questionForm, group: e.target.value })}
                  disabled={!questionForm.category}
                  className="w-full px-3 py-2 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Selecione o grupo</option>
                  {availableGroups.map(group => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ai-text mb-1">
                  Pergunta <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={questionForm.question}
                  onChange={e => setQuestionForm({ ...questionForm, question: e.target.value })}
                  placeholder="Descreva a pergunta de Sim ou Não..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-ai-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ai-accent bg-white resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ai-text mb-2">
                  Resposta Esperada (Positiva) <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setQuestionForm({ ...questionForm, positiveAnswer: 'Sim' })}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      questionForm.positiveAnswer === 'Sim'
                        ? 'bg-green-100 border-2 border-green-500 text-green-700'
                        : 'bg-gray-100 border-2 border-gray-300 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionForm({ ...questionForm, positiveAnswer: 'Não' })}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      questionForm.positiveAnswer === 'Não'
                        ? 'bg-green-100 border-2 border-green-500 text-green-700'
                        : 'bg-gray-100 border-2 border-gray-300 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Não
                  </button>
                </div>
                <p className="text-xs text-ai-subtext mt-2">
                  * A resposta selecionada acima será contabilizada como 100% de performance para o item.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-ai-text mb-2">
                  Tipos de Questionário Aplicáveis <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(['Cria', 'Recria e Engorda', 'Ciclo Completo'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleToggleApplicableType(type)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        questionForm.applicableTypes.includes(type)
                          ? 'bg-ai-accent text-white'
                          : 'bg-gray-100 border-2 border-gray-300 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveQuestion}
                  className="flex-1 px-4 py-2 bg-ai-accent text-white rounded-lg font-medium hover:bg-ai-accentHover transition-colors"
                >
                  Salvar
                </button>
                <button
                  onClick={() => {
                    setShowQuestionForm(false);
                    setEditingQuestion(null);
                  }}
                  className="px-4 py-2 border border-ai-border text-ai-text rounded-lg font-medium hover:bg-ai-surface2 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-ai-border overflow-hidden">
          {questions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ai-surface border-b border-ai-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ai-text uppercase">
                      Categoria / Grupo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ai-text uppercase">Pergunta</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ai-text uppercase">Resp. Positiva</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ai-text uppercase">Tipos</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ai-text uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ai-border">
                  {filteredQuestionsForList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-ai-subtext">
                        Nenhuma pergunta encontrada com esses filtros. Tente outra categoria ou grupo, ou limpe os
                        filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredQuestionsForList.map(question => (
                      <tr key={question.id} className="hover:bg-ai-surface/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-green-600">{question.category}</span>
                            <span className="text-xs text-ai-subtext">{question.group}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-ai-text max-w-md">{question.question}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            {question.positiveAnswer}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {question.applicableTypes.map((type: string) => (
                              <span
                                key={type}
                                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                              >
                                {type.toUpperCase()}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingQuestion(question);
                                setQuestionForm({
                                  category: question.category,
                                  group: question.group,
                                  question: question.question,
                                  positiveAnswer: question.positiveAnswer,
                                  applicableTypes: question.applicableTypes,
                                });
                                setShowQuestionForm(true);
                              }}
                              className="p-1.5 text-ai-subtext hover:text-ai-accent hover:bg-ai-surface2 rounded transition-colors"
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteQuestion(question.id)}
                              className="p-1.5 text-ai-subtext hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center">
              <FileCheck size={48} className="mx-auto text-ai-subtext/30 mb-3" />
              <p className="text-sm text-ai-subtext">Nenhuma pergunta cadastrada</p>
              <p className="text-xs text-ai-subtext mt-1">Clique em "Adicionar Pergunta" para começar</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return renderProfileTab();
      case 'account':
        return renderAccountTab();
      case 'company':
        return renderCompanyTab();
      case 'appearance':
        return renderAppearanceTab();
      case 'privacy':
        return renderPrivacyTab();
      case 'support':
        return renderSupportTab();
      case 'questionnaires':
        return renderQuestionnairesTab();
      case 'system':
        return renderSystemTab();
      default:
        return null;
    }
  };

  return (
    <div className="h-full w-full max-w-6xl mx-auto py-6 px-4 animate-in fade-in duration-500 overflow-y-auto">
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-600 mb-2">Confirmar Exclusão</h3>
            <p className="text-sm text-ai-subtext mb-6">
              Tem certeza que deseja excluir sua conta? Esta ação é permanente e não pode ser desfeita. Todos os seus
              dados serão perdidos.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-ai-border text-ai-text rounded-lg font-medium hover:bg-ai-surface2 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Excluindo...' : 'Excluir Conta'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Navigation */}
        <div className="w-full md:w-64 shrink-0">
          <div className="bg-white rounded-lg border border-ai-border p-2 sticky top-4">
            <nav className="space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id ? 'bg-ai-accent text-white' : 'text-ai-text hover:bg-ai-surface2'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-h-0">
          <div className="bg-white rounded-lg border border-ai-border p-6 h-full overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

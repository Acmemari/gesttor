import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
} from 'react-native';
import { supabase } from '../api/supabase';
import { getAllRecords, getUnsyncedRecords, clearAllLocalRecords, CollectionRecord } from '../database/db';
import { syncLocalData } from '../database/sync';
import { subscribeToConnectivity } from '../utils/connectivity';
import {
  Plus,
  RefreshCw,
  LogOut,
  Wifi,
  WifiOff,
  CheckCircle,
  Clock,
  Trash2,
  Scale,
} from 'lucide-react-native';

interface HomeScreenProps {
  onNavigateToCollect: () => void;
  onLogout: () => void;
}

export default function HomeScreen({ onNavigateToCollect, onLogout }: HomeScreenProps) {
  const [userEmail, setUserEmail] = useState<string>('');
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [unsyncedCount, setUnsyncedCount] = useState<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Carrega informações iniciais
  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
      }

      const allRecords = await getAllRecords();
      setRecords(allRecords);

      const unsynced = await getUnsyncedRecords();
      setUnsyncedCount(unsynced.length);
    } catch (err) {
      console.error('Error loading home data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Monitorar conectividade
    const unsubscribeConn = subscribeToConnectivity((connected) => {
      setIsOnline(connected);
    });

    return () => {
      unsubscribeConn();
    };
  }, []);

  const handleSync = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Você precisa de conexão com a internet para sincronizar.');
      return;
    }

    setSyncing(true);
    try {
      const result = await syncLocalData();
      await loadData(); // recarrega lista e contadores

      if (result.successCount > 0) {
        Alert.alert(
          'Sincronização Concluída',
          `${result.successCount} coletas enviadas com sucesso!`
        );
      } else if (result.failedCount > 0) {
        Alert.alert(
          'Alerta',
          `Falha ao sincronizar ${result.failedCount} registros. Tente novamente.`
        );
      } else {
        Alert.alert('Sincronização', 'Todos os dados já estão atualizados na nuvem.');
      }
    } catch (err) {
      Alert.alert('Erro', 'Ocorreu um erro inesperado durante a sincronização.');
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Sair', 'Deseja realmente sair do aplicativo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          onLogout();
        },
      },
    ]);
  };

  const handleClearLocalDB = () => {
    Alert.alert(
      'Atenção',
      'Isso apagará permanentemente todo o histórico local. Deseja prosseguir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar tudo',
          style: 'destructive',
          onPress: async () => {
            await clearAllLocalRecords();
            await loadData();
            Alert.alert('Sucesso', 'Banco de dados local limpo.');
          },
        },
      ]
    );
  };

  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('pt-BR') + ' às ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const renderItem = ({ item }: { item: CollectionRecord }) => (
    <View style={styles.recordItem}>
      <View style={styles.recordMain}>
        <View style={styles.animalBadge}>
          <Text style={styles.animalBadgeText}>{item.animal_id}</Text>
        </View>
        <View style={styles.recordDetails}>
          <View style={styles.weightRow}>
            <Scale size={16} color="#4caf50" style={{ marginRight: 6 }} />
            <Text style={styles.weightText}>{item.weight} kg</Text>
          </View>
          <Text style={styles.dateText}>{formatDateTime(item.created_at)}</Text>
          {item.vaccination ? (
            <Text style={styles.vaccineText}>Vacina: {item.vaccination}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.recordStatus}>
        {item.synced === 1 ? (
          <CheckCircle size={22} color="#4caf50" />
        ) : (
          <Clock size={22} color="#ff9800" />
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4caf50" />
        <Text style={styles.loadingText}>Carregando dados...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logoText}>Gesttor Campo</Text>
          <Text style={styles.userText}>{userEmail || 'Acesso Técnico'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <LogOut size={20} color="#e53935" />
        </TouchableOpacity>
      </View>

      {/* Connectivity & Sync Status Bar */}
      <View style={[styles.statusBar, isOnline ? styles.statusOnline : styles.statusOffline]}>
        <View style={styles.statusInfo}>
          {isOnline ? (
            <>
              <Wifi size={18} color="#4caf50" />
              <Text style={[styles.statusText, { color: '#4caf50' }]}>Conectado à Internet</Text>
            </>
          ) : (
            <>
              <WifiOff size={18} color="#f44336" />
              <Text style={[styles.statusText, { color: '#f44336' }]}>Modo Offline Ativo</Text>
            </>
          )}
        </View>
        {unsyncedCount > 0 && isOnline && (
          <TouchableOpacity
            style={styles.syncBtnSmall}
            onPress={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <RefreshCw size={14} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.syncBtnSmallText}>Sincronizar</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{unsyncedCount}</Text>
          <Text style={styles.summaryLabel}>Pendentes de Envio</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{records.length}</Text>
          <Text style={styles.summaryLabel}>Coletas Locais</Text>
        </View>
      </View>

      {/* Action Button */}
      <View style={styles.actionContainer}>
        <TouchableOpacity style={styles.collectButton} onPress={onNavigateToCollect}>
          <Plus size={24} color="#ffffff" style={{ marginRight: 8 }} />
          <Text style={styles.collectButtonText}>Nova Coleta no Campo</Text>
        </TouchableOpacity>
      </View>

      {/* Recent History List */}
      <View style={styles.historyContainer}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Coletas Recentes</Text>
          {records.length > 0 && (
            <TouchableOpacity onPress={handleClearLocalDB} style={styles.clearBtn}>
              <Trash2 size={16} color="#606062" />
              <Text style={styles.clearBtnText}>Limpar Histórico</Text>
            </TouchableOpacity>
          )}
        </View>

        {records.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhuma coleta registrada localmente.</Text>
            <Text style={styles.emptySubtext}>Clique no botão acima para iniciar.</Text>
          </View>
        ) : (
          <FlatList
            data={records}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121214',
  },
  centered: {
    flex: 1,
    backgroundColor: '#121214',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#a0a0a2',
    marginTop: 12,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e24',
    backgroundColor: '#1e1e24',
  },
  logoText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  userText: {
    fontSize: 14,
    color: '#a0a0a2',
    marginTop: 2,
  },
  logoutButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#1e1e24',
    borderWidth: 1,
    borderColor: '#3a3a40',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  statusOnline: {
    backgroundColor: 'rgba(76, 175, 80, 0.05)',
    borderBottomColor: 'rgba(76, 175, 80, 0.1)',
  },
  statusOffline: {
    backgroundColor: 'rgba(244, 67, 54, 0.05)',
    borderBottomColor: 'rgba(244, 67, 54, 0.1)',
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  syncBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2e7d32',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  syncBtnSmallText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 20,
  },
  summaryCard: {
    flex: 0.48,
    backgroundColor: '#1e1e24',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a30',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#a0a0a2',
    marginTop: 4,
    textAlign: 'center',
  },
  actionContainer: {
    paddingHorizontal: 24,
    marginTop: 20,
  },
  collectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2e7d32',
    height: 56,
    borderRadius: 12,
    shadowColor: '#2e7d32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  collectButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyContainer: {
    flex: 1,
    paddingHorizontal: 24,
    marginTop: 24,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearBtnText: {
    fontSize: 13,
    color: '#606062',
    marginLeft: 4,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emptyText: {
    color: '#a0a0a2',
    fontSize: 16,
    fontWeight: '500',
  },
  emptySubtext: {
    color: '#606062',
    fontSize: 14,
    marginTop: 4,
  },
  listContent: {
    paddingBottom: 24,
  },
  recordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e1e24',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a30',
  },
  recordMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 0.9,
  },
  animalBadge: {
    backgroundColor: '#2a2a30',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#3a3a40',
    marginRight: 12,
  },
  animalBadgeText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  recordDetails: {
    justifyContent: 'center',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weightText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  dateText: {
    color: '#606062',
    fontSize: 12,
    marginTop: 2,
  },
  vaccineText: {
    color: '#a0a0a2',
    fontSize: 13,
    marginTop: 4,
  },
  recordStatus: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

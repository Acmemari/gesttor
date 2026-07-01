import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from './src/api/supabase';
import { initDatabase } from './src/database/db';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import CollectScreen from './src/screens/CollectScreen';

type Screen = 'loading' | 'login' | 'home' | 'collect';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');

  useEffect(() => {
    async function setupApp() {
      try {
        // 1. Inicializar o banco de dados SQLite local
        await initDatabase();

        // 2. Verificar se existe uma sessão ativa
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setScreen('home');
        } else {
          setScreen('login');
        }
      } catch (error) {
        console.error('Error setting up the application:', error);
        setScreen('login');
      }
    }

    setupApp();

    // Ouvir mudanças de status de autenticação (ex: tokens expirados, deslogar remoto)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setScreen('home');
      } else {
        setScreen('login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const renderScreen = () => {
    switch (screen) {
      case 'loading':
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#4caf50" />
            <Text style={styles.loadingText}>Inicializando Coletor...</Text>
          </View>
        );
      case 'login':
        return <LoginScreen onLoginSuccess={() => setScreen('home')} />;
      case 'home':
        return (
          <HomeScreen
            onNavigateToCollect={() => setScreen('collect')}
            onLogout={() => setScreen('login')}
          />
        );
      case 'collect':
        return (
          <CollectScreen
            onBack={() => setScreen('home')}
            onSaveSuccess={() => {
              // Quando salva, volta para home e recarrega dados automaticamente
              setScreen('home');
            }}
          />
        );
      default:
        return <LoginScreen onLoginSuccess={() => setScreen('home')} />;
    }
  };

  return (
    <View style={styles.container}>
      {renderScreen()}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121214',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121214',
  },
  loadingText: {
    color: '#a0a0a2',
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
});

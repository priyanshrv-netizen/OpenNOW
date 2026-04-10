/**
 * OpenNOW Mobile - Home Screen
 * Main game catalog and library browser
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { GameInfo } from '../types/index';
import { getGamesService, getAuthService, getSettingsService } from '../api/index';
import { GameCard } from '../components/index';

interface HomeScreenProps {
  onLogout: () => void;
  onLaunchGame: (game: GameInfo) => void;
}

type TabType = 'catalog' | 'library' | 'favorites';

const { width } = Dimensions.get('window');
const NUM_COLUMNS = width > 600 ? 3 : 2;

export const HomeScreen: React.FC<HomeScreenProps> = ({ onLogout, onLaunchGame }) => {
  const [activeTab, setActiveTab] = useState<TabType>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [games, setGames] = useState<GameInfo[]>([]);
  const [filteredGames, setFilteredGames] = useState<GameInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  
  const gamesService = getGamesService();
  const authService = getAuthService();
  const settingsService = getSettingsService();

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    filterGames();
  }, [games, searchQuery, activeTab]);

  const loadInitialData = async () => {
    try {
      const session = authService.getSession();
      if (session) {
        setUserName(session.user.displayName);
      }
      await loadGames();
    } finally {
      setLoading(false);
    }
  };

  const loadGames = async () => {
    try {
      let loadedGames: GameInfo[] = [];

      switch (activeTab) {
        case 'catalog':
          loadedGames = await gamesService.fetchMainGames();
          break;
        case 'library':
          loadedGames = await gamesService.fetchLibraryGames();
          break;
        case 'favorites':
          const allGames = await gamesService.fetchMainGames();
          const favorites = settingsService.get('favoriteGameIds');
          loadedGames = allGames.filter((g) => favorites.includes(g.id));
          break;
      }

      setGames(loadedGames);
    } catch (error) {
      console.error('Failed to load games:', error);
    }
  };

  const filterGames = () => {
    let filtered = games;

    // Apply search filter
    if (searchQuery) {
      filtered = gamesService.searchGames(filtered, searchQuery);
    }

    // Sort favorites first
    const favorites = settingsService.get('favoriteGameIds');
    filtered.sort((a, b) => {
      const aFav = favorites.includes(a.id) ? 1 : 0;
      const bFav = favorites.includes(b.id) ? 1 : 0;
      return bFav - aFav;
    });

    setFilteredGames(filtered);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGames();
    setRefreshing(false);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setLoading(true);
    loadGames().finally(() => setLoading(false));
  };

  const handleToggleFavorite = async (gameId: string) => {
    const isFavorite = await settingsService.toggleFavoriteGame(gameId);
    filterGames(); // Re-sort
  };

  const renderGameCard = useCallback(({ item }: { item: GameInfo }) => {
    const isFavorite = settingsService.isFavorite(item.id);
    
    return (
      <GameCard
        game={item}
        size={NUM_COLUMNS === 2 ? 'medium' : 'small'}
        isFavorite={isFavorite}
        onPress={() => onLaunchGame(item)}
      />
    );
  }, []);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🎮</Text>
      <Text style={styles.emptyTitle}>
        {activeTab === 'library' ? 'Your Library is Empty' : 'No Games Found'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'library'
          ? 'Games you own will appear here'
          : searchQuery
          ? 'Try a different search'
          : 'Unable to load games'}
      </Text>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#76B900" />
          <Text style={styles.loadingText}>Loading games...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.userName}>{userName}</Text>
          </View>
          <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search games..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {(['catalog', 'library', 'favorites'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => handleTabChange(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Game Grid */}
      <FlatList
        data={filteredGames}
        renderItem={renderGameCard}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={styles.gridContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#76B900" />
        }
        ListEmptyComponent={renderEmptyState}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: {
    color: '#888',
    fontSize: 14,
  },
  userName: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: 8,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  logoutText: {
    color: '#FFF',
    fontSize: 14,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
    paddingVertical: 4,
  },
  clearIcon: {
    color: '#888',
    fontSize: 16,
    padding: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#333',
  },
  tabText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#76B900',
  },
  gridContent: {
    padding: 8,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
    marginTop: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
});

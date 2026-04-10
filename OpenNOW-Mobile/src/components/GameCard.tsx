/**
 * OpenNOW Mobile - Game Card Component
 * Displays game information in a grid layout
 */

import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { GameInfo } from '../types/gfn';

interface GameCardProps {
  game: GameInfo;
  onPress: (game: GameInfo) => void;
  isFavorite?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const { width: screenWidth } = Dimensions.get('window');

const CARD_WIDTHS = {
  small: screenWidth / 3 - 12,
  medium: screenWidth / 2 - 16,
  large: screenWidth - 32,
};

const CARD_HEIGHTS = {
  small: (CARD_WIDTHS.small * 4) / 3,
  medium: (CARD_WIDTHS.medium * 4) / 3,
  large: (CARD_WIDTHS.large * 9) / 16,
};

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onPress,
  isFavorite = false,
  size = 'medium',
}) => {
  const cardWidth = CARD_WIDTHS[size];
  const cardHeight = CARD_HEIGHTS[size];

  // Get store icon
  const getStoreIcon = (store: string): string => {
    const icons: Record<string, string> = {
      STEAM: '🎲',
      EPIC: '⛰️',
      UPLAY: '🇺',
      EA: '🇪',
      GOG: '🌟',
      XBOX: '🎯',
      BATTLE_NET: '⚔️',
      NVIDIA: '🎮',
    };
    return icons[store] || '🎮';
  };

  // Get membership badge color
  const getTierColor = (tier?: string): string => {
    if (!tier) return '#76B900';
    const tierLower = tier.toLowerCase();
    if (tierLower.includes('priority') || tierLower.includes('performance')) return '#FFD700';
    if (tierLower.includes('ultimate') || tierLower.includes('rtx')) return '#FF6B00';
    return '#76B900';
  };

  return (
    <TouchableOpacity
      style={[styles.container, { width: cardWidth, height: cardHeight }]}
      onPress={() => onPress(game)}
      activeOpacity={0.7}
    >
      {/* Game Cover */}
      <View style={styles.imageContainer}>
        {game.imageUrl ? (
          <Image
            source={{ uri: game.imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.image, styles.placeholderImage]}>
            <Text style={styles.placeholderText}>🎮</Text>
          </View>
        )}
        
        {/* Gradient overlay */}
        <View style={styles.overlay} />
        
        {/* Favorite badge */}
        {isFavorite && (
          <View style={styles.favoriteBadge}>
            <Text style={styles.favoriteIcon}>⭐</Text>
          </View>
        )}
        
        {/* Membership tier badge */}
        {game.membershipTierLabel && (
          <View style={[styles.tierBadge, { backgroundColor: getTierColor(game.membershipTierLabel) }]}>
            <Text style={styles.tierText} numberOfLines={1}>
              {game.membershipTierLabel}
            </Text>
          </View>
        )}
        
        {/* Store icons */}
        <View style={styles.storeContainer}>
          {game.variants.slice(0, 3).map((variant) => (
            <Text key={variant.id} style={styles.storeIcon}>
              {getStoreIcon(variant.store)}
            </Text>
          ))}
          {game.variants.length > 3 && (
            <Text style={styles.moreStores}>+{game.variants.length - 3}</Text>
          )}
        </View>
      </View>
      
      {/* Game Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {game.title}
        </Text>
        
        {game.genres && game.genres.length > 0 && (
          <Text style={styles.genres} numberOfLines={1}>
            {game.genres.slice(0, 2).join(', ')}
          </Text>
        )}
        
        {/* Feature labels */}
        <View style={styles.featuresContainer}>
          {game.featureLabels?.slice(0, 2).map((label, index) => (
            <View key={index} style={styles.featureBadge}>
              <Text style={styles.featureText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 6,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 40,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  favoriteBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: 4,
  },
  favoriteIcon: {
    fontSize: 14,
  },
  tierBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tierText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  storeContainer: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  storeIcon: {
    fontSize: 12,
    marginLeft: 2,
  },
  moreStores: {
    color: '#888',
    fontSize: 10,
    marginLeft: 4,
  },
  infoContainer: {
    padding: 10,
    backgroundColor: '#1A1A1A',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  genres: {
    color: '#888888',
    fontSize: 12,
    marginBottom: 6,
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  featureBadge: {
    backgroundColor: '#333333',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  featureText: {
    color: '#AAAAAA',
    fontSize: 10,
  },
});

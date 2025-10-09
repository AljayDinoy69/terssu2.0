import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Report } from '../utils/auth';
import { useTheme } from './ThemeProvider';

interface ReportCardProps {
  item: Report;
  index: number;
  nameMap?: Record<string, string>;
  onPress?: () => void;
  onImagePress?: (uri: string) => void;
}

export const ReportCard: React.FC<ReportCardProps> = ({ item, index, nameMap, onPress, onImagePress }) => {
  const { colors } = useTheme();
  const themed = useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: colors.background,
      borderColor: colors.text + '22',
    },
    title: { color: colors.text },
    desc: { color: colors.text + 'bb' },
    meta: { color: colors.text + '99' },
    viewBtn: { borderColor: colors.text + '22' },
    viewBtnText: { color: colors.text },
    thumbBorder: { borderColor: colors.text + '22', backgroundColor: colors.background },
    detailsBorder: { borderTopColor: colors.text + '22' },
  }), [colors]);

  return (
    <TouchableOpacity
      style={[styles.card, themed.card]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, themed.title]}>{item.type}</Text>
        <View style={[styles.statusBadge, {
          backgroundColor: item.status === 'Pending' ? '#ff9800' :
                          item.status === 'In-progress' ? '#2196f3' :
                          item.status === 'Resolved' ? '#4caf50' : '#999'
        }]}>
          <Text style={styles.statusText}>
            {item.status === 'Pending' ? '' :
             item.status === 'In-progress' ? '' :
             item.status === 'Resolved' ? '' : ''} {item.status?.toUpperCase() || 'UNKNOWN'}
          </Text>
        </View>
      </View>

      {!!item.chiefComplaint && (
        <Text style={[styles.cardDesc, themed.desc]} numberOfLines={2} ellipsizeMode="tail">
         Chief Complaint: {item.chiefComplaint}
        </Text>
      )}
      {!!item.description && (
        <Text style={[styles.cardDesc, themed.desc]} numberOfLines={3} ellipsizeMode="tail">
          Description: {item.description}
        </Text>
      )}

      {/* Display multiple images (collage) if available, else fallback to single image */}
      {Array.isArray((item as any).photoUrls) && (item as any).photoUrls.length > 0 ? (
        <View style={styles.collageGrid}>
          {((item as any).photoUrls as string[]).slice(0, 4).map((uri, idx) => (
            <TouchableOpacity
              key={`${uri}-${idx}`}
              activeOpacity={0.9}
              onPress={() => onImagePress && onImagePress(uri)}
              style={styles.collageItem}
            >
              <Image source={{ uri }} style={[styles.collageImage, themed.thumbBorder]} resizeMode="cover" />
              {idx === 3 && (item as any).photoUrls.length > 4 && (
                <View style={styles.collageOverlay}>
                  <Text style={styles.collageOverlayText}>+{(item as any).photoUrls.length - 4}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        (item.photoUrl || item.photoUri) ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onImagePress && onImagePress(item.photoUrl || item.photoUri || '')}
          >
            <Image
              source={{ uri: item.photoUrl || item.photoUri }}
              style={[styles.thumbnail, themed.thumbBorder]}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : null
      )}

      <View style={[styles.reportDetails, themed.detailsBorder]}>
        {!!item.fullName && (
          <Text style={[styles.meta, themed.meta]} numberOfLines={1} ellipsizeMode="tail">
            Full Name: {item.fullName}
          </Text>
        )}
        {!!item.contactNo && (
          <Text style={[styles.meta, themed.meta]} numberOfLines={1} ellipsizeMode="tail">
            Contact: {item.contactNo}
          </Text>
        )}
        {!!item.personsInvolved && (
          <Text style={[styles.meta, themed.meta]} numberOfLines={1} ellipsizeMode="tail">
            Persons Involved: {item.personsInvolved}
          </Text>
        )}
        <Text style={[styles.meta, themed.meta]} numberOfLines={1} ellipsizeMode="tail">
          Responder: {nameMap?.[item.responderId || ''] || 'Unassigned'}
        </Text>
        <Text style={[styles.meta, themed.meta]} numberOfLines={1} ellipsizeMode="middle">
          From: {item.fullName || (item.userId ? (nameMap?.[item.userId] || 'Anonymous') : 'Anonymous')}
        </Text>
        <Text style={[styles.meta, themed.meta]}>
          Created: {new Date(item.createdAt).toLocaleString()}
        </Text>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.viewBtn, themed.viewBtn]}
          onPress={onPress}
          activeOpacity={0.85}
        >
          <Text style={[styles.viewBtnText, themed.viewBtnText]}>View Details</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 18,
    color: '#fff',
    flex: 1,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  cardDesc: {
    marginBottom: 12,
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  thumbnail: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
  },
  reportDetails: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
    marginBottom: 12,
    gap: 4,
  },
  meta: {
    color: '#999',
    fontSize: 12,
  },
  cardActions: {
    alignItems: 'flex-end',
  },
  viewBtn: {
    backgroundColor: '#2b2f4a',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b3f5a',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexShrink: 1,
  },
  viewBtnText: {
    color: '#ffd166',
    fontWeight: '700',
    fontSize: 14,
  },
  collageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 0,
  },
  collageItem: {
    width: '49%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  collageImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
  },
  collageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collageOverlayText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 20,
  },
});

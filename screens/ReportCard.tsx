import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Report } from '../utils/auth';

interface ReportCardProps {
  item: Report;
  index: number;
  nameMap?: Record<string, string>;
  onPress?: () => void;
}

export const ReportCard: React.FC<ReportCardProps> = ({ item, index, nameMap, onPress }) => {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.type}</Text>
        <View style={[styles.statusBadge, {
          backgroundColor: item.status === 'Pending' ? '#ff9800' :
                          item.status === 'In-progress' ? '#2196f3' :
                          item.status === 'Resolved' ? '#4caf50' : '#999'
        }]}>
          <Text style={styles.statusText}>
            {item.status === 'Pending' ? '⏳' :
             item.status === 'In-progress' ? '🚀' :
             item.status === 'Resolved' ? '✅' : '❓'} {item.status?.toUpperCase() || 'UNKNOWN'}
          </Text>
        </View>
      </View>

      {!!item.chiefComplaint && (
        <Text style={styles.cardDesc} numberOfLines={2} ellipsizeMode="tail">
          🆘 Chief Complaint: {item.chiefComplaint}
        </Text>
      )}
      {!!item.description && (
        <Text style={styles.cardDesc} numberOfLines={3} ellipsizeMode="tail">
          📝 {item.description}
        </Text>
      )}

      {/* Display image if available */}
      {(item.photoUrl || item.photoUri) ? (
        <Image
          source={{ uri: item.photoUrl || item.photoUri }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : null}

      <View style={styles.reportDetails}>
        {!!item.fullName && (
          <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
            🙋 Full Name: {item.fullName}
          </Text>
        )}
        {!!item.contactNo && (
          <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
            📞 Contact: {item.contactNo}
          </Text>
        )}
        {!!item.personsInvolved && (
          <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
            👥 Persons Involved: {item.personsInvolved}
          </Text>
        )}
        <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
          👨‍🚒 Responder: {item.responderId}
        </Text>
        <Text style={styles.meta} numberOfLines={1} ellipsizeMode="middle">
          👤 From: {item.fullName || (item.userId ? (nameMap?.[item.userId] || 'Reporter') : 'Anonymous')}
        </Text>
        <Text style={styles.meta}>
          📅 Created: {new Date(item.createdAt).toLocaleString()}
        </Text>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.viewBtn}
          onPress={onPress}
          activeOpacity={0.85}
        >
          <Text style={styles.viewBtnText}>👁️ View Details</Text>
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
});

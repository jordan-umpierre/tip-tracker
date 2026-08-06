import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { accountStyles as styles } from './styles';

// Everything the app is willing to say about sync: one status line, the
// records it cannot send, and the manual trigger. D26 deliberately keeps this
// to operational truth -- no progress bars over work that is one request at a
// time, and no automatic retry the user did not ask for.
export default function SyncStatusPanel() {
  const account = useAuth();

  return (
    <View style={styles.syncStatus} accessibilityLiveRegion="polite">
      <Text style={styles.syncTitle}>Sync status</Text>
      <Text style={account.syncPhase === 'blocked' ? styles.error : styles.note}>
        {syncStatusCopy(account.syncPhase)}
      </Text>

      {account.blockedMutations.length > 0 ? (
        <View style={styles.conflicts}>
          <Text style={styles.note}>
            Sync stops at the first record it cannot send, so these are resolved oldest
            first. Discarding keeps the cloud copy and drops this device&apos;s change to
            that record; you can make the edit again afterward.
          </Text>
          {account.blockedMutations.map((mutation) => (
            <View key={mutation.local_sequence} style={styles.conflict}>
              <Text style={styles.conflictTitle}>
                {entityLabel(mutation.entity_type)} · {mutation.operation}
              </Text>
              <Text style={styles.note}>
                {mutation.blocked_kind === 'conflict'
                  ? 'Changed somewhere else first'
                  : 'The server refused this change'}
                {' ('}{mutation.blocked_code}{')'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Discard this device's change to ${entityLabel(mutation.entity_type)}`}
                style={styles.destructiveOutlineButton}
                onPress={() => { void account.discardBlocked(mutation.local_sequence); }}
              >
                <Text style={styles.destructiveLinkText}>Discard my change</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: account.syncPhase === 'syncing' }}
        disabled={account.syncPhase === 'syncing'}
        style={[
          styles.primaryButton,
          account.syncPhase === 'syncing' ? styles.disabledButton : null,
        ]}
        onPress={() => { void account.syncNow(); }}
      >
        <Text style={styles.primaryButtonText}>Sync now</Text>
      </Pressable>
    </View>
  );
}

// The stored entity type is a database word. This is the one the user's own
// screens use for the same thing.
function entityLabel(entityType: string) {
  if (entityType === 'job') return 'Job';
  if (entityType === 'shift') return 'Shift';
  return 'Withholding setting';
}

function syncStatusCopy(phase: ReturnType<typeof useAuth>['syncPhase']) {
  if (phase === 'syncing') return 'Syncing...';
  if (phase === 'up_to_date') return 'Up to date as of the last completed sync.';
  if (phase === 'pending_offline') return 'Changes are pending. The cloud service is unavailable.';
  if (phase === 'blocked') return 'Review needed before sync can continue.';
  // Separate from 'blocked' on purpose: this one is not about a record the
  // server refused, so it must not send anyone looking for a conflict.
  if (phase === 'failed') return 'The last sync did not finish. Try again.';
  if (phase === 'sign_in_again') return 'Sign in again before sync can continue.';
  if (phase === 'mismatch') return 'This local database belongs to another account.';
  return 'Ready to sync.';
}

import { StyleSheet } from 'react-native';

// One stylesheet for every piece of the cloud account UI.
//
// The panel used to be a single 400-line component, so these lived beside it.
// Splitting it by account state moved the markup into focused files, and
// duplicating a button style into each one is how four files drift into four
// slightly different blues. The look is a property of the panel, not of any
// one section, so it stays in one place.
export const accountStyles = StyleSheet.create({
  panel: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    padding: 16,
    gap: 10,
  },
  title: { color: '#111827', fontSize: 16, fontWeight: '700' },
  identity: { color: '#111827', fontWeight: '600' },
  copy: { color: '#374151', lineHeight: 20 },
  note: { color: '#6b7280', fontSize: 13, lineHeight: 18 },
  syncStatus: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  syncTitle: { color: '#111827', fontWeight: '600' },
  error: { color: '#b91c1c', lineHeight: 20 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#111827',
  },
  actions: { gap: 10 },
  primaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  disabledButton: { opacity: 0.6 },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonText: { color: '#2563eb', fontWeight: '600' },
  // A text-only affordance, still 44pt tall so it meets the touch target
  // minimum the rest of the panel's controls keep.
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#2563eb', fontWeight: '600' },
  conflicts: { gap: 10 },
  conflict: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  conflictTitle: { color: '#111827', fontWeight: '600' },
  // Red, bordered, and set apart from the rest of the panel, so the one
  // irreversible control on this screen never reads as another blue button.
  deleteBox: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  deleteTitle: { color: '#991b1b', fontWeight: '700' },
  destructiveButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#b91c1c',
    paddingHorizontal: 16,
  },
  destructiveButtonText: { color: '#fff', fontWeight: '600' },
  destructiveOutlineButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#b91c1c',
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  destructiveLinkText: { color: '#b91c1c', fontWeight: '600' },
});

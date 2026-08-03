import { File } from 'expo-file-system';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Job } from '../data/jobs';
import { importShifts } from '../data/shifts';
import type { Shift } from '../data/shifts';
import { formatCents, formatHours } from '../lib/format';
import {
  inspectShiftImportConflicts,
  parseShiftImportCsv,
} from '../lib/shiftImportCsv';
import type { ShiftImportConflicts, ShiftImportParseResult } from '../lib/shiftImportCsv';

const MAX_FILE_BYTES = 1_000_000;

type Props = {
  jobs: Job[];
  existingShifts: Shift[];
  onImported: () => Promise<void>;
};

type Preview = {
  fileName: string;
  parsed: ShiftImportParseResult;
};

type ImportStatus = 'idle' | 'reading' | 'importing';

const EMPTY_CONFLICTS: ShiftImportConflicts = { existingDates: [], possibleDuplicates: 0 };

export default function ImportCsvForm({ jobs, existingShifts, onImported }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(jobs.length === 1 ? jobs[0].id : '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const selectedJob = jobs.find((job) => job.id === selectedJobId);
  const busy = status !== 'idle';
  const conflicts = importConflicts(preview, selectedJob, existingShifts);

  async function handleChooseFile() {
    setError(null);

    try {
      // File providers do not agree on a CSV MIME type or expose the original
      // name consistently. Let the system show documents, then validate the
      // size, exact headers, and every row instead of trusting an extension.
      // File's picker keeps Android's read permission attached to its result.
      const result = await File.pickFileAsync();

      if (result.canceled) return;

      const selectedFile = result.result;
      setPreview(null);
      const validationError = selectedFileError(selectedFile.size);
      if (validationError) {
        setError(validationError);
        return;
      }

      setStatus('reading');
      const parsed = parseShiftImportCsv(await selectedFile.text());
      setPreview({ fileName: selectedFileName(selectedFile.name), parsed });
    } catch (cause) {
      console.error('Could not read the selected CSV.', cause);
      setError('That CSV could not be read. Nothing was imported.');
    } finally {
      setStatus('idle');
    }
  }

  function handleConfirmImport(
    currentPreview: Preview,
    job: Job,
    currentConflicts: ShiftImportConflicts
  ) {
    const count = currentPreview.parsed.rows.length;

    Alert.alert(
      `Import ${shiftCountText(count)} to ${job.name}?`,
      `Rows will be added; existing shifts will not change.${overlapMessage(currentConflicts.existingDates.length)}${exactDuplicateMessage(currentConflicts.possibleDuplicates)} Importing the same file again can create duplicates.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Import ${count}`,
          onPress: () => void handleImport(job, currentPreview.parsed.rows),
        },
      ]
    );
  }

  async function handleImport(job: Job, rows: ShiftImportParseResult['rows']) {
    setStatus('importing');
    setError(null);
    let importedCount: number;
    try {
      importedCount = await importShifts(job.id, rows);
    } catch (cause) {
      console.error('Could not import the selected CSV.', cause);
      setError('The import failed and was rolled back. Nothing was imported.');
      setStatus('idle');
      return;
    }

    let refreshWarning = '';
    try {
      await onImported();
    } catch (cause) {
      console.error('The CSV imported, but the Log screen did not refresh.', cause);
      refreshWarning = ' Reopen the Log tab to refresh the list.';
    }

    setPreview(null);
    setExpanded(false);
    setStatus('idle');
    Alert.alert('Import complete', `${importSuccessText(importedCount, job.name)}${refreshWarning}`);
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded, disabled: busy }}
        disabled={busy}
        style={styles.toggleButton}
        onPress={() => setExpanded((current) => !current)}
      >
        <Text style={styles.toggleText}>
          {expanded ? 'Close CSV import' : 'Import shifts from CSV'}
        </Text>
      </Pressable>

      {expanded ? (
        <ImportPanel
          jobs={jobs}
          selectedJobId={selectedJobId}
          selectedJob={selectedJob}
          preview={preview}
          conflicts={conflicts}
          status={status}
          error={error}
          onSelectJob={setSelectedJobId}
          onChooseFile={() => void handleChooseFile()}
          onConfirm={handleConfirmImport}
        />
      ) : null}
    </View>
  );
}

function ImportPanel({
  jobs,
  selectedJobId,
  selectedJob,
  preview,
  conflicts,
  status,
  error,
  onSelectJob,
  onChooseFile,
  onConfirm,
}: {
  jobs: Job[];
  selectedJobId: string;
  selectedJob?: Job;
  preview: Preview | null;
  conflicts: ShiftImportConflicts;
  status: ImportStatus;
  error: string | null;
  onSelectJob: (jobId: string) => void;
  onChooseFile: () => void;
  onConfirm: (preview: Preview, job: Job, conflicts: ShiftImportConflicts) => void;
}) {
  const busy = status !== 'idle';

  return (
    <View style={styles.content}>
      <Text style={styles.title}>Import CSV</Text>
      <Text style={styles.explanation}>
        Supports Date, Wage, Cash Tips, Credit Tips, Hours, Note, Daily Income,
        Start Time, and End Time. Cash and credit tips are combined. Daily Income
        and “no data” times are checked but not stored.
      </Text>
      <JobChoices
        jobs={jobs}
        selectedJobId={selectedJobId}
        disabled={busy}
        onSelect={onSelectJob}
      />
      <FileChoiceButton
        hasSelectedJob={selectedJob != null}
        status={status}
        onPress={onChooseFile}
      />
      <ImportFeedback error={error} status={status} />
      {preview && selectedJob ? (
        <ImportPreview
          preview={preview}
          job={selectedJob}
          conflicts={conflicts}
          importing={status === 'importing'}
          onConfirm={() => onConfirm(preview, selectedJob, conflicts)}
        />
      ) : null}
    </View>
  );
}

function JobChoices({
  jobs,
  selectedJobId,
  disabled,
  onSelect,
}: {
  jobs: Job[];
  selectedJobId: string;
  disabled: boolean;
  onSelect: (jobId: string) => void;
}) {
  return (
    <>
      <Text style={styles.label}>Add every row to</Text>
      <View style={styles.jobRow}>
        {jobs.map((job) => {
          const selected = job.id === selectedJobId;
          return (
            <Pressable
              key={job.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              style={[styles.jobChip, selected && styles.jobChipSelected]}
              onPress={() => onSelect(job.id)}
            >
              <Text style={[styles.jobChipText, selected && styles.jobChipTextSelected]}>
                {selected ? `Selected: ${job.name}` : job.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function FileChoiceButton({
  hasSelectedJob,
  status,
  onPress,
}: {
  hasSelectedJob: boolean;
  status: ImportStatus;
  onPress: () => void;
}) {
  const disabled = status !== 'idle' || !hasSelectedJob;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={[styles.fileButton, disabledButtonStyle(disabled)]}
        onPress={onPress}
      >
        <Text style={styles.fileButtonText}>
          {fileButtonText(status)}
        </Text>
      </Pressable>
      {!hasSelectedJob ? <Text style={styles.hint}>Choose a destination job first.</Text> : null}
    </>
  );
}

function ImportFeedback({ error, status }: { error: string | null; status: ImportStatus }) {
  if (error) {
    return (
      <Text selectable accessibilityRole="alert" style={styles.errorText}>
        {error}
      </Text>
    );
  }
  if (status === 'idle') return null;

  return (
    <Text accessibilityLiveRegion="polite" style={styles.statusText}>
      {status === 'reading' ? 'Reading and validating the CSV…' : 'Importing every row…'}
    </Text>
  );
}

function ImportPreview({
  preview,
  job,
  conflicts,
  importing,
  onConfirm,
}: {
  preview: Preview;
  job: Job;
  conflicts: ShiftImportConflicts;
  importing: boolean;
  onConfirm: () => void;
}) {
  const { parsed } = preview;

  if (parsed.errors.length > 0) {
    return <InvalidImportPreview preview={preview} />;
  }

  const warnings = previewWarnings(parsed, conflicts, job.name);

  return (
    <View style={styles.preview}>
      <Text selectable style={styles.previewTitle}>{preview.fileName}</Text>
      <Text
        selectable
        accessibilityLiveRegion="polite"
        accessibilityLabel={`CSV ready. ${shiftCountText(parsed.summary.acceptedRows)}. ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'} to review.`}
        style={styles.previewText}
      >
        {shiftCountText(parsed.summary.acceptedRows)}
        {' · '}{parsed.summary.dateFrom} to {parsed.summary.dateTo}
      </Text>
      <Text selectable style={styles.previewText}>
        {formatHours(parsed.summary.totalDurationSeconds)} · {formatCents(parsed.summary.totalTipsCents)} tips
      </Text>
      <Text style={styles.previewText}>Destination: {job.name}. No data has been saved yet.</Text>
      <PreviewRows rows={parsed.rows} />
      <PreviewWarnings warnings={warnings} />
      <ImportButton count={parsed.rows.length} importing={importing} onPress={onConfirm} />
    </View>
  );
}

function InvalidImportPreview({ preview }: { preview: Preview }) {
  const errors = preview.parsed.errors;
  return (
    <View style={styles.preview}>
      <Text selectable style={styles.previewTitle}>{preview.fileName}</Text>
      <Text selectable accessibilityRole="alert" style={styles.errorText}>
        Fix the CSV and choose it again. No data has been saved.
      </Text>
      {errors.slice(0, 3).map((issue, index) => (
        <Text selectable key={`${issue.sourceRow ?? 'file'}-${index}`} style={styles.issueText}>
          {issue.sourceRow ? `Row ${issue.sourceRow}: ` : ''}{issue.message}
        </Text>
      ))}
      {errors.length > 3 ? (
        <Text style={styles.issueText}>And {errors.length - 3} more errors.</Text>
      ) : null}
    </View>
  );
}

function PreviewRows({ rows }: { rows: ShiftImportParseResult['rows'] }) {
  return (
    <>
      <Text style={styles.label}>First {Math.min(5, rows.length)} rows</Text>
      {rows.slice(0, 5).map((row) => (
        <Text selectable key={row.sourceRow} style={styles.rowPreview}>
          {row.shiftDate} · {formatHours(row.durationSeconds)} · {formatCents(row.tipsCents)} tips · {formatCents(row.hourlyRateCents)}/hr
        </Text>
      ))}
      {rows.length > 5 ? <Text style={styles.hint}>And {rows.length - 5} more rows.</Text> : null}
    </>
  );
}

function PreviewWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <>
      <Text style={styles.label}>Review before importing</Text>
      {warnings.slice(0, 4).map((warning, index) => (
        <Text selectable key={index} style={styles.warningText}>• {warning}</Text>
      ))}
      {warnings.length > 4 ? (
        <Text style={styles.warningText}>And {warnings.length - 4} more warnings.</Text>
      ) : null}
    </>
  );
}

function ImportButton({
  count,
  importing,
  onPress,
}: {
  count: number;
  importing: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: importing }}
      disabled={importing}
      style={[styles.importButton, disabledButtonStyle(importing)]}
      onPress={onPress}
    >
      <Text style={styles.importButtonText}>
        {importing ? 'Importing…' : `Review and import ${count}`}
      </Text>
    </Pressable>
  );
}

function selectedFileError(size: number | null): string | null {
  if (size == null) {
    return 'This file provider did not report a size. Save the CSV on this device and try again.';
  }
  if (size > MAX_FILE_BYTES) {
    return 'Choose a CSV no larger than 1 MB.';
  }
  return null;
}

function selectedFileName(providerName: string): string {
  const decodedName = decodeURIComponent(providerName).split('/').pop();
  return decodedName?.toLowerCase().endsWith('.csv') ? decodedName : 'Selected document';
}

function importConflicts(
  preview: Preview | null,
  job: Job | undefined,
  existingShifts: Shift[]
): ShiftImportConflicts {
  if (!preview || !job) return EMPTY_CONFLICTS;
  return inspectShiftImportConflicts(preview.parsed.rows, existingShifts, job.id);
}

function previewWarnings(
  parsed: ShiftImportParseResult,
  conflicts: ShiftImportConflicts,
  jobName: string
): string[] {
  const warnings: string[] = [];
  const dateWarning = existingDateWarning(conflicts.existingDates, jobName);
  const duplicateWarning = possibleDuplicateWarning(conflicts.possibleDuplicates);
  if (dateWarning) warnings.push(dateWarning);
  if (duplicateWarning) warnings.push(duplicateWarning);
  warnings.push(...parsed.warnings.map(issueText));
  return warnings;
}

function issueText(issue: ShiftImportParseResult['warnings'][number]): string {
  return `${issue.sourceRow ? `Row ${issue.sourceRow}: ` : ''}${issue.message}`;
}

function existingDateWarning(dates: string[], jobName: string): string | null {
  if (dates.length === 0) return null;
  const sample = dates.slice(0, 3).join(', ');
  const label = dates.length === 1 ? 'date already contains' : 'dates already contain';
  return `${dates.length} ${label} shifts for ${jobName}: ${sample}${dates.length > 3 ? ', …' : ''}. New rows will be added separately.`;
}

function possibleDuplicateWarning(count: number): string | null {
  if (count === 0) return null;
  return `${count} ${count === 1 ? 'row matches' : 'rows match'} an existing shift exactly. Confirming still adds every row.`;
}

function fileButtonText(status: ImportStatus): string {
  return status === 'reading' ? 'Reading…' : 'Choose CSV file';
}

function disabledButtonStyle(disabled: boolean) {
  return disabled ? styles.buttonDisabled : undefined;
}

function shiftCountText(count: number): string {
  return `${count} ${count === 1 ? 'shift' : 'shifts'}`;
}

function overlapMessage(dateCount: number): string {
  if (dateCount === 0) return '';
  return ` ${dateCount} ${dateCount === 1 ? 'date already has' : 'dates already have'} shifts for this job.`;
}

function exactDuplicateMessage(count: number): string {
  if (count === 0) return '';
  return ` ${shiftCountText(count)} ${count === 1 ? 'matches' : 'match'} existing data exactly.`;
}

function importSuccessText(count: number, jobName: string): string {
  return `${shiftCountText(count)} ${count === 1 ? 'was' : 'were'} added to ${jobName}.`;
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    padding: 16,
  },
  toggleButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  toggleText: { color: '#2563eb', fontWeight: '600' },
  content: { gap: 12, borderRadius: 12, backgroundColor: '#f8fafc', marginTop: 12, padding: 16 },
  title: { color: '#111827', fontSize: 18, fontWeight: '700' },
  explanation: { color: '#4b5563', lineHeight: 20 },
  label: { color: '#374151', fontWeight: '600' },
  jobRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  jobChip: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 22,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
  },
  jobChipSelected: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  jobChipText: { color: '#374151', fontWeight: '600' },
  jobChipTextSelected: { color: '#fff' },
  fileButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 16,
  },
  fileButtonText: { color: '#1d4ed8', fontWeight: '700' },
  importButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
  },
  importButtonText: { color: '#fff', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  hint: { color: '#6b7280', fontSize: 13 },
  statusText: { color: '#374151', fontWeight: '600' },
  errorText: { color: '#b91c1c', fontWeight: '600', lineHeight: 20 },
  preview: { gap: 8, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, backgroundColor: '#fff', padding: 12 },
  previewTitle: { color: '#111827', fontSize: 16, fontWeight: '700' },
  previewText: { color: '#374151' },
  rowPreview: { color: '#374151', fontSize: 13, fontVariant: ['tabular-nums'] },
  issueText: { color: '#991b1b', lineHeight: 19 },
  warningText: { color: '#92400e', lineHeight: 19 },
});

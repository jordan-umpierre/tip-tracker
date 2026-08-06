import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import CalendarPicker from './CalendarPicker';
import {
  createFederalWithholdingSettings,
  DuplicateFederalWithholdingSettingsError,
  getFederalWithholdingSettingsForPayDate,
} from '../data/federalWithholdingSettings';
import type { FederalWithholdingSettings } from '../data/federalWithholdingSettings';
import type { Job } from '../data/jobs';
import { localDateString, parseCalendarDate } from '../lib/dates';
import {
  calculateSavedFederalWithholding,
  FEDERAL_WITHHOLDING_DISCLOSURE,
  isSupportedPayDateYear,
  parseMoneyToCents,
} from '../lib/federalWithholdingForm';
import type { FederalWithholdingSettingValues } from '../lib/federalWithholdingForm';
import { SUPPORTED_TAX_YEAR } from '../lib/federalWithholding2026';
import type { FederalFilingStatus } from '../lib/federalWithholding2026';
import { formatCents } from '../lib/format';

type Props = { jobs: Job[] };
type DateTarget = 'effective' | 'paycheck' | null;
type Result = {
  settings: FederalWithholdingSettings;
  payDate: string;
  taxableWagesCents: number;
  withholdingCents: number;
};

const FILING_STATUSES: { value: FederalFilingStatus; label: string }[] = [
  { value: 'single-or-married-filing-separately', label: 'Single or married filing separately' },
  { value: 'married-filing-jointly', label: 'Married filing jointly' },
  { value: 'head-of-household', label: 'Head of household' },
];

const PAY_PERIODS = [
  { value: 52, label: 'Weekly' },
  { value: 26, label: 'Biweekly' },
  { value: 24, label: 'Semimonthly' },
  { value: 12, label: 'Monthly' },
  { value: 4, label: 'Quarterly' },
  { value: 2, label: 'Semiannual' },
  { value: 260, label: 'Daily' },
] as const;

const FILING_STATUS_LABELS = Object.fromEntries(
  FILING_STATUSES.map((item) => [item.value, item.label])
) as Record<FederalFilingStatus, string>;
const PAY_PERIOD_LABELS = Object.fromEntries(
  PAY_PERIODS.map((item) => [item.value, item.label])
) as Record<number, string>;

export default function FederalWithholdingForm({ jobs }: Props) {
  const today = localDateString(new Date());
  const [enabled, setEnabled] = useState(false);
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [filingStatus, setFilingStatus] = useState<FederalFilingStatus>(
    'single-or-married-filing-separately'
  );
  const [payPeriods, setPayPeriods] = useState(26);
  const [step2, setStep2] = useState(false);
  const [step3, setStep3] = useState('');
  const [step4a, setStep4a] = useState('');
  const [step4b, setStep4b] = useState('');
  const [step4c, setStep4c] = useState('');
  const [exempt, setExempt] = useState(false);
  const [payDate, setPayDate] = useState(today);
  const [taxableWages, setTaxableWages] = useState('');
  const [dateTarget, setDateTarget] = useState<DateTarget>(null);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const job = jobs.find((candidate) => candidate.id === jobId) ?? jobs[0];

  // The shipped tables cover one year. Once the calendar rolls past it the pay
  // date defaults to a day the calculator cannot answer for, so say that where
  // the user is about to type instead of letting them fill the whole form and
  // collect an alert. Saving W-4 settings is unaffected: those rows are
  // effective-dated and outlive any one year's tables.
  const payDateSupported = isSupportedPayDateYear(payDate);

  function chooseJob(nextJobId: string) {
    setJobId(nextJobId);
    setSavedNote(null);
    setResult(null);
  }

  function chooseExempt(value: boolean) {
    setExempt(value);
    if (value) {
      setStep2(false);
      setStep3('');
      setStep4a('');
      setStep4b('');
      setStep4c('');
    }
  }

  function settingValues(): FederalWithholdingSettingValues {
    return {
      filing_status: filingStatus,
      pay_periods_per_year: payPeriods,
      step2_checked: step2 ? 1 : 0,
      step3_credits_cents: parseMoneyToCents(step3, false),
      step4a_other_income_cents: parseMoneyToCents(step4a, false),
      step4b_deductions_cents: parseMoneyToCents(step4b, false),
      step4c_extra_withholding_cents: parseMoneyToCents(step4c, false),
      exempt: exempt ? 1 : 0,
    };
  }

  async function handleSave() {
    if (!job) return;
    if (!parseCalendarDate(effectiveFrom)) {
      Alert.alert('Check the effective pay date', 'Enter a real date as YYYY-MM-DD.');
      return;
    }

    let values: FederalWithholdingSettingValues;
    try {
      values = settingValues();
    } catch (cause) {
      Alert.alert('Check W-4 amounts', cause instanceof Error ? cause.message : 'Enter valid amounts.');
      return;
    }

    setSaving(true);
    try {
      await createFederalWithholdingSettings(job.id, effectiveFrom, values);
      setSavedNote(`Saved for ${job.name}, starting with the ${effectiveFrom} paycheck.`);
      setResult(null);
    } catch (cause) {
      if (cause instanceof DuplicateFederalWithholdingSettingsError) {
        Alert.alert(
          'Settings already exist for that pay date',
          'Nothing was overwritten. Choose the first pay date for a different W-4 change.'
        );
      } else {
        console.error('Could not save federal withholding settings.', cause);
        Alert.alert('Settings not saved', 'Nothing changed. Try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCalculate() {
    if (!job) return;
    const parsedPayDate = parseCalendarDate(payDate);
    if (!parsedPayDate) {
      Alert.alert('Check the paycheck pay date', 'Enter a real date as YYYY-MM-DD.');
      return;
    }
    // The button below is already disabled for an unsupported year, so this is
    // the second line rather than the first. It stays because the year rule
    // belongs to the calculation, not to whether a control happens to be
    // pressable.
    if (!isSupportedPayDateYear(payDate)) {
      Alert.alert(
        'Tax year not supported',
        `Only ${SUPPORTED_TAX_YEAR} federal withholding is supported.`
      );
      return;
    }

    let taxableWagesCents: number;
    try {
      taxableWagesCents = parseMoneyToCents(taxableWages, true);
    } catch (cause) {
      Alert.alert('Check federal taxable wages', cause instanceof Error ? cause.message : 'Enter a valid amount.');
      return;
    }

    setCalculating(true);
    try {
      const saved = await getFederalWithholdingSettingsForPayDate(job.id, payDate);
      if (!saved) {
        setResult(null);
        Alert.alert(
          'No settings apply yet',
          `Save ${job.name}'s W-4 settings with a first paycheck pay date on or before ${payDate}.`
        );
        return;
      }
      const calculated = calculateSavedFederalWithholding(payDate, taxableWagesCents, saved);
      setResult({
        settings: saved,
        payDate,
        taxableWagesCents,
        withholdingCents: calculated.withholdingCents,
      });
    } catch (cause) {
      // The unsupported-year message used to be re-read out of this error, but
      // the guard above returns before the calculator can ever raise it, so
      // the only failures that reach here are the database read and a saved
      // row the calculator rejects. Neither is something the user can fix by
      // reading an internal message.
      console.error('Could not calculate federal withholding.', cause);
      Alert.alert('Estimate not calculated', 'Your settings could not be loaded. Try again.');
    } finally {
      setCalculating(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.title}>Federal withholding</Text>
          <Text style={styles.subtitle}>Optional local estimate for one regular paycheck.</Text>
        </View>
        <Switch
          accessibilityLabel="Show federal withholding settings and calculator"
          value={enabled}
          onValueChange={setEnabled}
        />
      </View>

      {enabled ? (
        <View style={styles.form}>
          <Text selectable style={styles.disclosure}>{FEDERAL_WITHHOLDING_DISCLOSURE}</Text>

          <ChoiceGroup
            label="Job"
            choices={jobs.map((item) => ({ value: item.id, label: item.name }))}
            selected={job?.id ?? ''}
            disabled={saving || calculating}
            onSelect={chooseJob}
          />

          <Text style={styles.sectionTitle}>Save a new W-4 setting</Text>
          <DateField
            label="First paycheck pay date this applies to"
            value={effectiveFrom}
            disabled={saving}
            onChange={setEffectiveFrom}
            onOpen={() => setDateTarget('effective')}
          />
          <ChoiceGroup
            label="Filing status"
            choices={FILING_STATUSES}
            selected={filingStatus}
            disabled={saving}
            onSelect={(value) => setFilingStatus(value as FederalFilingStatus)}
          />
          <ChoiceGroup
            label="Pay frequency"
            choices={PAY_PERIODS.map((item) => ({ value: String(item.value), label: item.label }))}
            selected={String(payPeriods)}
            disabled={saving}
            onSelect={(value) => setPayPeriods(Number(value))}
          />

          <SwitchRow label="W-4 says Exempt" value={exempt} disabled={saving} onChange={chooseExempt} />
          {!exempt ? (
            <>
              <SwitchRow label="Step 2 checkbox is checked" value={step2} disabled={saving} onChange={setStep2} />
              <MoneyField label="Step 3 credits" value={step3} disabled={saving} onChange={setStep3} />
              <MoneyField label="Step 4(a) other income" value={step4a} disabled={saving} onChange={setStep4a} />
              <MoneyField label="Step 4(b) deductions" value={step4b} disabled={saving} onChange={setStep4b} />
              <MoneyField label="Step 4(c) extra withholding" value={step4c} disabled={saving} onChange={setStep4c} />
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            style={[styles.primaryButton, saving && styles.disabledButton]}
            onPress={() => void handleSave()}
          >
            <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save new settings'}</Text>
          </Pressable>
          {savedNote ? <Text selectable style={styles.successText}>{savedNote}</Text> : null}

          <Text style={styles.sectionTitle}>Estimate one {SUPPORTED_TAX_YEAR} paycheck</Text>
          {!payDateSupported ? (
            <Text selectable style={styles.warningText}>
              This app only has {SUPPORTED_TAX_YEAR} withholding tables. Choose a{' '}
              {SUPPORTED_TAX_YEAR} paycheck pay date, or wait for an update that adds
              the next year.
            </Text>
          ) : null}
          <DateField
            label="Paycheck pay date"
            value={payDate}
            disabled={calculating}
            onChange={(value) => {
              setPayDate(value);
              setResult(null);
            }}
            onOpen={() => setDateTarget('paycheck')}
          />
          <MoneyField
            label="Federal taxable wages from paystub"
            value={taxableWages}
            disabled={calculating}
            required
            onChange={(value) => {
              setTaxableWages(value);
              setResult(null);
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: calculating || !payDateSupported }}
            disabled={calculating || !payDateSupported}
            style={[
              styles.primaryButton,
              (calculating || !payDateSupported) && styles.disabledButton,
            ]}
            onPress={() => void handleCalculate()}
          >
            <Text style={styles.primaryText}>{calculating ? 'Calculating…' : 'Estimate federal withholding'}</Text>
          </Pressable>

          {result ? <WithholdingResult jobName={job?.name ?? ''} result={result} /> : null}

          <CalendarPicker
            key={`${dateTarget}:${dateTarget === 'effective' ? effectiveFrom : payDate}`}
            visible={dateTarget !== null}
            selectedDate={dateTarget === 'effective' ? effectiveFrom : payDate}
            datesWithShifts={new Set()}
            onSelect={(date) => {
              if (dateTarget === 'effective') setEffectiveFrom(date);
              if (dateTarget === 'paycheck') {
                setPayDate(date);
                setResult(null);
              }
              setDateTarget(null);
            }}
            onClose={() => setDateTarget(null)}
          />
        </View>
      ) : null}
    </View>
  );
}

function ChoiceGroup({ label, choices, selected, disabled, onSelect }: {
  label: string;
  choices: { value: string; label: string }[];
  selected: string;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.fieldGroup} accessibilityRole="radiogroup">
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {choices.map((choice) => {
          const checked = selected === choice.value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ checked, disabled }}
              disabled={disabled}
              style={[styles.choice, checked && styles.choiceSelected]}
              onPress={() => onSelect(choice.value)}
            >
              <Text style={[styles.choiceText, checked && styles.choiceTextSelected]}>{choice.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DateField({ label, value, disabled, onChange, onOpen }: {
  label: string; value: string; disabled: boolean; onChange: (value: string) => void; onOpen: () => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dateRow}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="none"
          editable={!disabled}
          inputMode="numeric"
          maxLength={10}
          placeholder="YYYY-MM-DD"
          style={[styles.input, styles.dateInput]}
          value={value}
          onChangeText={onChange}
        />
        <Pressable accessibilityRole="button" disabled={disabled} style={styles.dateButton} onPress={onOpen}>
          <Text style={styles.dateButtonText}>Calendar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MoneyField({ label, value, disabled, required = false, onChange }: {
  label: string; value: string; disabled: boolean; required?: boolean; onChange: (value: string) => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}{required ? '' : ' (blank is $0)'}</Text>
      <View style={styles.moneyRow}>
        <Text style={styles.dollar}>$</Text>
        <TextInput
          accessibilityLabel={`${label}, dollars`}
          editable={!disabled}
          inputMode="decimal"
          placeholder="0.00"
          style={[styles.input, styles.moneyInput]}
          value={value}
          onChangeText={onChange}
        />
      </View>
    </View>
  );
}

function SwitchRow({ label, value, disabled, onChange }: {
  label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.label}>{label}</Text>
      <Switch accessibilityLabel={label} disabled={disabled} value={value} onValueChange={onChange} />
    </View>
  );
}

function WithholdingResult({ jobName, result }: { jobName: string; result: Result }) {
  return (
    <View accessibilityRole="summary" style={styles.result}>
      <Text selectable style={styles.resultTitle}>
        Estimated {SUPPORTED_TAX_YEAR} federal withholding
      </Text>
      <Text selectable style={styles.resultAmount}>{formatCents(result.withholdingCents)}</Text>
      <Text selectable style={styles.resultLine}>{jobName} · Pay date {result.payDate}</Text>
      <Text selectable style={styles.resultLine}>Federal taxable wages: {formatCents(result.taxableWagesCents)}</Text>
      <Text selectable style={styles.resultLine}>Settings effective: {result.settings.effective_from}</Text>
      <Text selectable style={styles.resultLine}>{FILING_STATUS_LABELS[result.settings.filing_status]} · {PAY_PERIOD_LABELS[result.settings.pay_periods_per_year]}</Text>
      <Text selectable style={styles.resultLine}>Step 2: {checkedLabel(result.settings.step2_checked)} · Exempt: {yesNo(result.settings.exempt)}</Text>
      <Text selectable style={styles.resultLine}>Step 3 {formatCents(result.settings.step3_credits_cents)} · Step 4(a) {formatCents(result.settings.step4a_other_income_cents)}</Text>
      <Text selectable style={styles.resultLine}>Step 4(b) {formatCents(result.settings.step4b_deductions_cents)} · Step 4(c) {formatCents(result.settings.step4c_extra_withholding_cents)}</Text>
    </View>
  );
}

function checkedLabel(value: number): string {
  return value === 1 ? 'checked' : 'not checked';
}

function yesNo(value: number): string {
  return value === 1 ? 'yes' : 'no';
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, borderTopColor: '#e5e7eb', padding: 16, gap: 12 },
  toggleRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleText: { flex: 1, gap: 2 },
  title: { color: '#111827', fontSize: 16, fontWeight: '700' },
  subtitle: { color: '#6b7280', lineHeight: 18 },
  form: { gap: 16 },
  disclosure: { color: '#4b5563', fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: '#111827', fontSize: 16, fontWeight: '700', paddingTop: 8 },
  fieldGroup: { gap: 6 },
  label: { color: '#374151', fontWeight: '600', lineHeight: 20 },
  choices: { gap: 8 },
  choice: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12 },
  choiceSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  choiceText: { color: '#374151' },
  choiceTextSelected: { color: '#1d4ed8', fontWeight: '700' },
  switchRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#fff', color: '#111827', fontSize: 16, paddingHorizontal: 12 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateInput: { flex: 1 },
  dateButton: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: '#2563eb', borderRadius: 8, paddingHorizontal: 12 },
  dateButtonText: { color: '#2563eb', fontWeight: '600' },
  moneyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dollar: { color: '#374151', fontSize: 18 },
  moneyInput: { flex: 1, fontVariant: ['tabular-nums'] },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#2563eb', paddingHorizontal: 16 },
  disabledButton: { opacity: 0.55 },
  primaryText: { color: '#fff', fontWeight: '700' },
  successText: { color: '#166534', lineHeight: 20 },
  // Dark enough on the light background to clear the 4.5:1 contrast minimum,
  // the same bar the rest of this screen's text is held to.
  warningText: { color: '#92400e', lineHeight: 20 },
  result: { borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, backgroundColor: '#eff6ff', padding: 16, gap: 6 },
  resultTitle: { color: '#1e3a8a', fontWeight: '700' },
  resultAmount: { color: '#1e3a8a', fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  resultLine: { color: '#374151', lineHeight: 19, fontVariant: ['tabular-nums'] },
});

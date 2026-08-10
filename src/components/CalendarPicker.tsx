import { Modal, Pressable, StyleSheet } from 'react-native';
import Calendar from './Calendar';

// The bottom sheet around Calendar, for the forms that ask for a date in
// passing rather than as a step of their own -- editing a shift, and the
// withholding form's effective date. The calendar itself moved into Calendar
// when the log-a-shift flow needed the same grid on a full screen; everything
// here is the sheet and nothing else.
type Props = {
  visible: boolean;
  selectedDate: string;
  datesWithShifts: Set<string>;
  onSelect: (date: string) => void;
  onClose: () => void;
};

export default function CalendarPicker({
  visible,
  selectedDate,
  datesWithShifts,
  onSelect,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tapping outside the sheet closes it, which is what a sheet that slides
          up from the bottom is expected to do. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows taps inside the sheet so they do not reach the backdrop
            above and close it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Calendar
            selectedDate={selectedDate}
            datesWithShifts={datesWithShifts}
            onSelect={onSelect}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },
});

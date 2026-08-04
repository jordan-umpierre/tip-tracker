import { useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { MONTH_NAMES, parseCalendarDate, WEEKDAY_NAMES } from '../lib/dates';
import { buildMonthGrid, shiftMonth } from '../lib/monthGrid';

type Props = {
  visible: boolean;

  // The date the picker opens on, as YYYY-MM-DD. Also the cell drawn as
  // selected, so an unparseable value just means nothing looks selected rather
  // than the picker refusing to open -- the field it comes from lets the user
  // type freely.
  selectedDate: string;

  // Days that already have a shift, so they can be dotted. A Set rather than
  // an array because every one of up to 42 cells asks about itself on each
  // render, and scanning hundreds of shifts that many times is wasteful for a
  // question that is pure membership.
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
  // Which month is on screen. Seeded from the selected date so opening the
  // picker lands where the user already is, then owned by the arrows.
  const parsed = parseCalendarDate(selectedDate);
  const today = new Date();
  const [shown, setShown] = useState({
    year: parsed?.year ?? today.getFullYear(),
    month: parsed?.month ?? today.getMonth() + 1,
  });

  const cells = buildMonthGrid(shown.year, shown.month);

  function pageMonth(delta: number) {
    setShown((current) => shiftMonth(current.year, current.month, delta));
  }

  // Swiping the grid pages the month, the same gesture the shift rows already
  // use for their Delete action. PanResponder rather than a gesture library:
  // it is React Native's own, it is already the pattern in ShiftList, and this
  // needs one axis and one decision.
  //
  // Nothing here animates. The arrows do not either, so a swipe that simply
  // changes the month matches what is already on screen -- an animated page
  // would be the odd one out, not the other way around.
  const monthSwipe = useRef(
    PanResponder.create({
      // Claims only a clearly horizontal drag, so a vertical flick that is
      // really an attempt to dismiss the sheet is left alone.
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderRelease: (_, gesture) => {
        // Distance or a flick, so a short fast swipe works as well as a long
        // slow one. Below both, the gesture is treated as a mis-tap and the
        // month stays put.
        if (gesture.dx > 50 || gesture.vx > 0.3) {
          pageMonth(-1);
        } else if (gesture.dx < -50 || gesture.vx < -0.3) {
          pageMonth(1);
        }
      },
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tapping outside the sheet closes it, which is what a sheet that slides
          up from the bottom is expected to do. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows taps inside the sheet so they do not reach the backdrop
            above and close it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={12}
              style={styles.monthArrow}
              onPress={() => pageMonth(-1)}
            >
              <Text style={styles.monthArrowText}>‹</Text>
            </Pressable>
            <Text style={styles.monthLabel}>
              {MONTH_NAMES[shown.month - 1]} {shown.year}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={12}
              style={styles.monthArrow}
              onPress={() => pageMonth(1)}
            >
              <Text style={styles.monthArrowText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.grid} {...monthSwipe.panHandlers}>
            {WEEKDAY_NAMES.map((name) => (
              <Text key={name} style={[styles.cell, styles.weekdayHeading]}>
                {name}
              </Text>
            ))}

            {cells.map((cell, index) => {
              // The blanks padding the first and last weeks. They still occupy
              // a cell so the days stay under the right weekday heading, but
              // they are not pressable and carry no label.
              if (cell === null) {
                // eslint-disable-next-line react/no-array-index-key
                return <View key={`blank-${index}`} style={styles.cell} />;
              }

              const isSelected = cell.date === selectedDate;
              const hasShift = datesWithShifts.has(cell.date);

              return (
                <Pressable
                  key={cell.date}
                  accessibilityRole="button"
                  // Spoken instead of the bare number, so the dot -- which is
                  // purely visual -- is not information a screen reader misses.
                  accessibilityLabel={`${MONTH_NAMES[shown.month - 1]} ${cell.day}${
                    hasShift ? ', shift already logged' : ''
                  }`}
                  accessibilityState={{ selected: isSelected }}
                  style={styles.cell}
                  onPress={() => onSelect(cell.date)}
                >
                  <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}>
                    <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
                      {cell.day}
                    </Text>
                  </View>
                  {/* Rendered always, transparent when there is no shift, so a
                      dotted day and an undotted one are the same height and
                      the rows do not shift as months change. */}
                  <View style={[styles.dot, hasShift && styles.dotVisible]} />
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.legend}>A dot means a shift is already logged for that day.</Text>
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
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  monthArrow: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowText: {
    color: '#2563eb',
    fontSize: 28,
    fontWeight: '600',
  },
  monthLabel: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },
  // Seven columns by wrapping rather than by nesting a View per week: the grid
  // is already a flat array of cells, so letting them wrap keeps the render as
  // flat as the data.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  cell: {
    // A seventh of the row. Percentages rather than a measured width so this
    // holds on any screen without reading Dimensions.
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekdayHeading: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    paddingBottom: 4,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: '#2563eb',
  },
  dayText: {
    color: '#111827',
    fontSize: 16,
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
    backgroundColor: 'transparent',
  },
  dotVisible: {
    backgroundColor: '#2563eb',
  },
  legend: {
    color: '#6b7280',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});

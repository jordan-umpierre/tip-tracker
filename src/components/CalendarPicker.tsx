import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { MONTH_NAMES, parseCalendarDate, WEEKDAY_NAMES } from '../lib/dates';
import { buildMonthGrid, monthFromIndex, monthIndex } from '../lib/monthGrid';

type Props = {
  visible: boolean;

  // The date the picker opens on, as YYYY-MM-DD. Also the cell drawn as
  // selected, so an unparseable value just means nothing looks selected rather
  // than the picker refusing to open -- the field it comes from lets the user
  // type freely.
  selectedDate: string;

  // Days that already have a shift, so they can be dotted. A Set rather than
  // an array because every one of 42 cells asks about itself on each render,
  // and scanning hundreds of shifts that many times is wasteful for a question
  // that is pure membership.
  datesWithShifts: Set<string>;

  onSelect: (date: string) => void;
  onClose: () => void;
};

// Haptics are feedback, never a reason for an interaction to fail. Older
// devices and the simulator can reject these, so the promise is swallowed
// rather than left to surface as an unhandled rejection.
function feedback(run: () => Promise<void>) {
  void run().catch(() => {});
}

const PAGE_DURATION_MS = 220;

// Every day cell is exactly this tall, dots or not, day or blank. See the
// `cell` style for why it is pinned rather than left to the contents.
const CELL_HEIGHT = 52;

// The weekday label strip. Named because the month chooser has to match the
// grid's total height to keep the sheet from resizing.
const WEEKDAY_ROW_HEIGHT = 24;

// How many months either side of the anchor get a position on the strip.
// Swiping is one month at a time, so five years in each direction is far more
// than a single session of paging will cover; anything further is what the
// month and year chooser is for.
const SPAN_MONTHS = 60;

export default function CalendarPicker({
  visible,
  selectedDate,
  datesWithShifts,
  onSelect,
  onClose,
}: Props) {
  const { width } = useWindowDimensions();

  // Months are tracked as integers rather than {year, month} pairs, because
  // the strip positions each month by its distance from an anchor and that is
  // a subtraction.
  const parsed = parseCalendarDate(selectedDate);
  const today = new Date();
  const openedOn = monthIndex(
    parsed?.year ?? today.getFullYear(),
    parsed?.month ?? today.getMonth() + 1
  );

  // The month the strip is laid out around. Every rendered month sits at a
  // fixed offset from it, so a month's pane never moves once placed. That is
  // the whole point: the previous design re-centred the strip after each page,
  // which meant moving it and swapping its contents at the same instant. With
  // the transform on the native thread those two do not reliably land in the
  // same frame, and the gap showed as a flash of the month being left behind.
  const [anchor, setAnchor] = useState(openedOn);
  const [shownIndex, setShownIndex] = useState(openedOn);

  // Tapping the header swaps the day grid for a month and year chooser, so
  // reaching June 2025 is two taps rather than fourteen swipes.
  const [choosingMonth, setChoosingMonth] = useState(false);

  const shown = monthFromIndex(shownIndex);

  // Where the strip has to sit for a given month to fill the window.
  function offsetFor(index: number, span: number) {
    return -(index - anchor + SPAN_MONTHS) * span;
  }

  const translateX = useRef(new Animated.Value(offsetFor(openedOn, width))).current;

  // Read inside the pan handlers, which are created once and would otherwise
  // close over the first render's values forever.
  const shownRef = useRef(shownIndex);
  shownRef.current = shownIndex;
  const widthRef = useRef(width);
  widthRef.current = width;
  const offsetRef = useRef(offsetFor);
  offsetRef.current = offsetFor;

  function commitPage(delta: number) {
    const target = shownRef.current + delta;

    // State first, animation second, and no reset afterwards. The month being
    // left is still rendered -- it is a neighbour of the target -- so nothing
    // changes on screen at this moment. The animation then slides to a
    // position that is already correct for the content sitting there.
    setShownIndex(target);
    feedback(Haptics.selectionAsync);

    Animated.timing(translateX, {
      toValue: offsetRef.current(target, widthRef.current),
      duration: PAGE_DURATION_MS,
      useNativeDriver: true,
    }).start();
  }

  function settleBack() {
    Animated.timing(translateX, {
      toValue: offsetRef.current(shownRef.current, widthRef.current),
      duration: 150,
      useNativeDriver: true,
    }).start();
  }

  // PanResponder rather than a gesture library: it is React Native's own, it
  // is already the pattern SwipeableShiftRow uses, and this needs one axis.
  const monthSwipe = useRef(
    PanResponder.create({
      // Claims only a clearly horizontal drag, so a vertical flick meant to
      // dismiss the sheet is left alone.
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        translateX.setValue(offsetRef.current(shownRef.current, widthRef.current) + gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        // A quarter of the screen, or a flick. Either alone is enough, so a
        // short fast swipe works as well as a long slow one.
        const far = Math.abs(gesture.dx) > widthRef.current / 4;
        const fast = Math.abs(gesture.vx) > 0.3;
        if (!far && !fast) {
          settleBack();
          return;
        }
        commitPage(gesture.dx > 0 ? -1 : 1);
      },
      // A gesture taken away mid-drag -- by the modal dismissing, say -- has
      // to put the strip back or it stays stranded off centre.
      onPanResponderTerminate: settleBack,
    })
  ).current;

  // Used by the month and year chooser. This re-anchors and jumps outright
  // rather than sliding: the chooser exists precisely because the target is
  // too far away to page to, so animating across the gap would be a long slide
  // through months nobody asked to see. Re-anchoring also keeps the strip's
  // span centred on wherever the user has moved to.
  function jumpTo(index: number, closeChooser: boolean) {
    feedback(Haptics.selectionAsync);
    setAnchor(index);
    setShownIndex(index);
    translateX.setValue(-SPAN_MONTHS * width);
    if (closeChooser) setChoosingMonth(false);
  }

  function handleDayPress(date: string) {
    feedback(Haptics.selectionAsync);
    onSelect(date);
  }

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
              onPress={() => commitPage(-1)}
            >
              <Text style={styles.monthArrowText}>‹</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: choosingMonth }}
              accessibilityHint="Choose a different month or year"
              hitSlop={8}
              onPress={() => {
                feedback(Haptics.selectionAsync);
                setChoosingMonth((current) => !current);
              }}
            >
              <Text style={styles.monthLabel}>
                {MONTH_NAMES[shown.month - 1]} {shown.year} {choosingMonth ? '⌃' : '⌄'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={12}
              style={styles.monthArrow}
              onPress={() => commitPage(1)}
            >
              <Text style={styles.monthArrowText}>›</Text>
            </Pressable>
          </View>

          {choosingMonth ? (
            <View style={styles.chooser}>
              <View style={styles.chooserYearRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous year"
                  hitSlop={12}
                  style={styles.monthArrow}
                  onPress={() => jumpTo(monthIndex(shown.year - 1, shown.month), false)}
                >
                  <Text style={styles.monthArrowText}>‹</Text>
                </Pressable>
                <Text style={styles.chooserYear}>{shown.year}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next year"
                  hitSlop={12}
                  style={styles.monthArrow}
                  onPress={() => jumpTo(monthIndex(shown.year + 1, shown.month), false)}
                >
                  <Text style={styles.monthArrowText}>›</Text>
                </Pressable>
              </View>
              <View style={styles.chooserMonths}>
                {MONTH_NAMES.map((name, index) => {
                  const isShown = index + 1 === shown.month;
                  return (
                    <Pressable
                      key={name}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isShown }}
                      style={styles.chooserMonthCell}
                      onPress={() => jumpTo(monthIndex(shown.year, index + 1), true)}
                    >
                      <View style={[styles.chooserPill, isShown && styles.chooserPillSelected]}>
                        <Text
                          style={[
                            styles.chooserMonthText,
                            isShown && styles.chooserMonthTextSelected,
                          ]}
                        >
                          {name.slice(0, 3)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <>
          <View style={styles.weekdayRow}>
            {WEEKDAY_NAMES.map((name) => (
              <Text key={name} style={[styles.cell, styles.weekdayHeading]}>
                {name}
              </Text>
            ))}
          </View>

          {/* Clips the two off-screen months. Without it they render beyond the
              sheet and are visible past its rounded corners. */}
          <View style={styles.window} {...monthSwipe.panHandlers}>
            <Animated.View
              style={[
                styles.strip,
                // Wide enough to hold every position the strip can be scrolled
                // to. The three rendered months are placed absolutely inside
                // it, so this width is a coordinate space rather than
                // something that gets drawn.
                { width: width * (SPAN_MONTHS * 2 + 1), transform: [{ translateX }] },
              ]}
            >
              {[shownIndex - 1, shownIndex, shownIndex + 1].map((index) => {
                const month = monthFromIndex(index);
                return (
                  <MonthCells
                    key={index}
                    year={month.year}
                    month={month.month}
                    width={width}
                    // Fixed by the month's own distance from the anchor, so a
                    // month's pane stays exactly where it was put for as long
                    // as the picker is open.
                    left={(index - anchor + SPAN_MONTHS) * width}
                    selectedDate={selectedDate}
                    datesWithShifts={datesWithShifts}
                    onDayPress={handleDayPress}
                    // The neighbours exist only so a drag has something to
                    // reveal. Hiding them from assistive tech keeps VoiceOver
                    // from walking into a month the user cannot see.
                    offScreen={index !== shownIndex}
                  />
                );
              })}
            </Animated.View>
          </View>
            </>
          )}

          <Text style={styles.legend}>A dot means a shift is already logged for that day.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MonthCells({
  year,
  month,
  width,
  left,
  selectedDate,
  datesWithShifts,
  onDayPress,
  offScreen,
}: {
  year: number;
  month: number;
  width: number;
  left: number;
  selectedDate: string;
  datesWithShifts: Set<string>;
  onDayPress: (date: string) => void;
  offScreen: boolean;
}) {
  return (
    <View
      style={[styles.month, { width, left }]}
      accessibilityElementsHidden={offScreen}
      importantForAccessibility={offScreen ? 'no-hide-descendants' : 'auto'}
    >
      {buildMonthGrid(year, month).map((cell, index) => {
        // The blanks padding the first and last weeks. They still occupy a
        // cell so the days stay under the right weekday heading, but they are
        // not pressable and carry no label.
        if (cell === null) {
          return <View key={`blank-${index}`} style={styles.cell} />;
        }

        const isSelected = cell.date === selectedDate;
        const hasShift = datesWithShifts.has(cell.date);

        return (
          <Pressable
            key={cell.date}
            accessibilityRole="button"
            // Spoken instead of the bare number, so the dot -- which is purely
            // visual -- is not information a screen reader misses.
            accessibilityLabel={`${MONTH_NAMES[month - 1]} ${cell.day}${
              hasShift ? ', shift already logged' : ''
            }`}
            accessibilityState={{ selected: isSelected }}
            style={styles.cell}
            onPress={() => onDayPress(cell.date)}
          >
            <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}>
              <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>{cell.day}</Text>
            </View>
            {/* Rendered always, transparent when there is no shift, so a dotted
                day and an undotted one are the same height and the rows do not
                move as months change. */}
            <View style={[styles.dot, hasShift && styles.dotVisible]} />
          </Pressable>
        );
      })}
    </View>
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
  // The headings sit outside the sliding strip: they are the same seven labels
  // whatever month is showing, so sliding them would be motion with no meaning.
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  window: {
    overflow: 'hidden',
  },
  // The panes inside are positioned absolutely, so the strip has no height of
  // its own to inherit from them and has to state it. Six rows, matching the
  // fixed grid.
  strip: {
    height: CELL_HEIGHT * 6,
  },
  // Seven columns by wrapping rather than by nesting a View per week: the grid
  // is already a flat array of cells, so letting them wrap keeps the render as
  // flat as the data.
  month: {
    position: 'absolute',
    top: 0,
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
    // Fixed rather than left to the contents. A row is as tall as its tallest
    // cell, and a blank padding cell has no circle and no dot, so letting
    // height follow content made the sheet a different size depending on how
    // the month happened to land. Pinning it means six rows are always the
    // same six rows.
    height: CELL_HEIGHT,
    justifyContent: 'center',
  },
  // Shares `cell` for its width so the labels line up with the columns, but
  // overrides the day-cell height -- a heading does not need to be as tall as
  // a circle and a dot.
  weekdayHeading: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    height: WEEKDAY_ROW_HEIGHT,
    paddingVertical: 0,
    textAlign: 'center',
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
  // The chooser stands in for the weekday row plus the six-row grid, so it is
  // pinned to their combined height. Without that the sheet would jump every
  // time the header was tapped, which is the same resizing the fixed cell
  // height exists to prevent.
  chooser: {
    height: WEEKDAY_ROW_HEIGHT + CELL_HEIGHT * 6,
    paddingHorizontal: 16,
  },
  chooserYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chooserYear: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
  },
  chooserMonths: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Three across, four down.
  chooserMonthCell: {
    width: '33.33%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  chooserPill: {
    minWidth: 80,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
  },
  chooserPillSelected: {
    backgroundColor: '#2563eb',
  },
  chooserMonthText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
  },
  chooserMonthTextSelected: {
    color: '#fff',
  },
  legend: {
    color: '#6b7280',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});

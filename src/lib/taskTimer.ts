export interface TimerState {
  remainingSeconds: number; // negative once in overtime
  zone: 'green' | 'yellow' | 'red';
  overtime: boolean;
}

export function getTimerState(estimatedMinutes: number, elapsedSeconds: number): TimerState {
  const totalSeconds = estimatedMinutes * 60;
  const remainingSeconds = totalSeconds - elapsedSeconds;
  const overtime = remainingSeconds <= 0;
  const remainingFraction = overtime ? 0 : remainingSeconds / totalSeconds;

  let zone: TimerState['zone'];
  if (overtime || remainingFraction < 0.2) {
    zone = 'red';
  } else if (remainingFraction < 0.5) {
    zone = 'yellow';
  } else {
    zone = 'green';
  }

  return { remainingSeconds, zone, overtime };
}

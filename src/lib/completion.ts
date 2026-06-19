import type { Chore } from './houseTypes';

export interface CompletionResult {
  success: boolean;
  awardedPoints: number;
  stepsCompleted: number;
  totalSteps: number;
}

export function runCompletion(chore: Chore, verifySequence: Array<boolean>): CompletionResult {
  const totalSteps = verifySequence.length;
  const stepsCompleted = verifySequence.filter(Boolean).length;
  
  // All steps must pass
  const allPassed = verifySequence.every(Boolean);
  
  if (!allPassed) {
    return {
      success: false,
      awardedPoints: 0,
      stepsCompleted,
      totalSteps
    };
  }
  
  // Bonus for perfect execution (no retries)
  const pointsBase = chore.points;
  const bonus = verifySequence.every(Boolean) ? Math.round(pointsBase * 0.1) : 0;
  
  return {
    success: true,
    awardedPoints: pointsBase + bonus,
    stepsCompleted,
    totalSteps
  };
}

const completion = { runCompletion };
export default completion;

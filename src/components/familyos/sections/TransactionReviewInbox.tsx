import React, { useState } from 'react';
import {
  Check,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Landmark,
  Tag,
} from 'lucide-react';
import { CATEGORIES, normalizeMerchantName, ExpenseItem } from '@/lib/transactionReview';

interface Props {
  uncertainExpenses: ExpenseItem[];
  hasAnyExpenses?: boolean;
  onConfirm: (expense: ExpenseItem, category: string) => Promise<void> | void;
  onConfirmBatch?: (expenses: ExpenseItem[]) => Promise<void> | void;
}

const BATCH_SIZE = 5;

export const TransactionReviewInbox: React.FC<Props> = ({
  uncertainExpenses,
  hasAnyExpenses = true,
  onConfirm,
  onConfirmBatch,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const totalCount = uncertainExpenses.length;
  const visibleBatch = uncertainExpenses.slice(0, BATCH_SIZE);

  // Filter items in the visible batch that already have a confident suggested category (not Other)
  const confirmableBatch = visibleBatch.filter(
    (e) => e.category && e.category.toLowerCase() !== 'other' && e.category.toLowerCase() !== 'uncategorized'
  );

  const isBusy = processingId !== null || bulkProcessing;

  const handleConfirmSingle = async (expense: ExpenseItem, categoryOverride?: string) => {
    const chosenCategory = categoryOverride || expense.category || 'Other';
    setProcessingId(expense.id);
    try {
      await onConfirm(expense, chosenCategory);
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmSuggested = async () => {
    if (!onConfirmBatch || confirmableBatch.length === 0) return;
    setBulkProcessing(true);
    try {
      await onConfirmBatch(confirmableBatch);
    } finally {
      setBulkProcessing(false);
    }
  };

  if (totalCount === 0) {
    if (!hasAnyExpenses) return null;
    return (
      <div className="bg-sage-950/20 border border-sage-500/30 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-sage-500/20 text-sage-400 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-5 h-5 text-sage-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-semibold flex items-center gap-1.5">
            All Caught Up! 🎉
          </div>
          <p className="text-cream-400/70 text-xs">
            Every transaction is categorized and your merchant memory is compounding.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bark-800/70 border border-honey-500/30 rounded-2xl p-4 space-y-3 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-honey-500/20 text-honey-400 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-semibold">Review Queue</span>
              <span className="bg-honey-500/20 border border-honey-500/40 text-honey-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                {totalCount} {totalCount === 1 ? 'item' : 'items'}
              </span>
            </div>
            <p className="text-cream-400/60 text-[11px]">
              1-tap confirm or fix. When you fix a merchant once, Bear House remembers it forever.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onConfirmBatch && confirmableBatch.length > 0 && (
            <button
              onClick={handleConfirmSuggested}
              disabled={isBusy}
              className="hidden sm:inline-flex items-center gap-1 bg-honey-500/20 hover:bg-honey-500/30 border border-honey-500/40 text-honey-200 text-xs px-2.5 py-1.5 rounded-lg transition disabled:opacity-50 focus-ring font-medium"
            >
              <Check className="w-3.5 h-3.5" />
              {bulkProcessing ? 'Confirming…' : `Confirm Suggested (${confirmableBatch.length})`}
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-cream-400/60 hover:text-white p-1 rounded-lg transition focus-ring"
            aria-label={expanded ? 'Collapse review queue' : 'Expand review queue'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2.5 pt-1">
          {totalCount > BATCH_SIZE && (
            <div className="text-[11px] text-honey-300/80 bg-honey-950/30 border border-honey-500/20 rounded-lg px-2.5 py-1 flex items-center justify-between">
              <span>Showing {BATCH_SIZE} of {totalCount} uncertain transactions</span>
              {onConfirmBatch && confirmableBatch.length > 0 && (
                <button
                  onClick={handleConfirmSuggested}
                  disabled={isBusy}
                  className="sm:hidden text-honey-300 hover:text-white font-medium underline"
                >
                  Confirm Suggested ({confirmableBatch.length})
                </button>
              )}
            </div>
          )}

          {visibleBatch.map((expense) => {
            const normalized = normalizeMerchantName(expense.notes);
            const currentCat = expense.category || 'Other';
            const isOther = currentCat.toLowerCase() === 'other' || !currentCat;

            return (
              <div
                key={expense.id}
                className="bg-bark-700/50 border border-cream-400/10 rounded-xl p-3 space-y-2.5 transition"
              >
                {/* Top Row: Merchant + Amount */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">
                      {expense.notes || 'Unnamed Merchant'}
                    </div>
                    <div className="text-cream-400/60 text-xs flex items-center gap-2 mt-0.5">
                      <span>{expense.date}</span>
                      {expense.paidBy && <span>· {expense.paidBy}</span>}
                      {expense.source === 'simplefin' && (
                        <span className="flex items-center gap-0.5 text-honey-400/80 text-[10px]">
                          <Landmark className="w-2.5 h-2.5" /> {expense.institutionName || 'Bank'}
                        </span>
                      )}
                      {normalized && normalized !== expense.notes && (
                        <span className="text-[10px] text-cream-400/40 hidden md:inline">
                          ({normalized})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-white font-bold text-sm">
                      ${expense.amount.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-amber-400/90 font-medium">
                      {isOther ? 'Needs Category' : 'Verify Category'}
                    </div>
                  </div>
                </div>

                {/* Quick Confirm & Category Choice */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-cream-400/60">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3 text-honey-400" />
                      Current: <strong className="text-honey-300">{currentCat}</strong>
                    </span>
                    {!isOther && (
                      <button
                        onClick={() => handleConfirmSingle(expense, currentCat)}
                        disabled={isBusy}
                        className="flex items-center gap-1 bg-sage-600/30 hover:bg-sage-600/50 border border-sage-500/40 text-sage-200 text-xs px-2.5 py-1 rounded-lg transition disabled:opacity-50 focus-ring font-medium"
                      >
                        <Check className="w-3 h-3 text-sage-300" />
                        Confirm {currentCat}
                      </button>
                    )}
                  </div>

                  {/* 1-Tap Category Pills */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {CATEGORIES.map((cat) => {
                      const isSelected = currentCat === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => handleConfirmSingle(expense, cat)}
                          disabled={isBusy}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition focus-ring ${
                            isSelected
                              ? 'bg-honey-500 border-honey-400 text-white font-semibold'
                              : 'bg-bark-800/80 hover:bg-bark-700 border-cream-400/10 text-cream-400/80 hover:text-white'
                          } disabled:opacity-50`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TransactionReviewInbox;

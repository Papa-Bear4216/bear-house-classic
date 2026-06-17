/**
 * Enhanced Banking Integration for Hermes
 * Real-time budget alerts, spending predictions, smart notifications
 */

import { PlaidApi, Configuration, PlaidEnvironments } from 'plaid';

export interface SpendingAlert {
  type: 'over_budget' | 'unusual_charge' | 'subscription' | 'low_balance' | 'goal_risk';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  amount?: number;
  merchant?: string;
  suggestion?: string;
}

export interface BudgetCategory {
  name: string;
  allocated: number;
  spent: number;
  remaining: number;
  pace: 'on_track' | 'ahead' | 'behind';
  projection: number; // End of month projection
}

export class BankingIntegration {
  private plaid: PlaidApi;
  private alertThresholds = {
    lowBalance: 100,
    unusualCharge: 200,
    budgetWarning: 0.8, // 80% of budget
    budgetCritical: 0.95, // 95% of budget
  };

  constructor(
    private clientId: string,
    private secret: string,
    private accessToken: string
  ) {
    const configuration = new Configuration({
      basePath: PlaidEnvironments.production,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': clientId,
          'PLAID-SECRET': secret,
        },
      },
    });
    this.plaid = new PlaidApi(configuration);
  }

  async getRealTimeBalance(): Promise<{
    available: number;
    current: number;
    alerts: SpendingAlert[];
  }> {
    const response = await this.plaid.accountsBalanceGet({
      access_token: this.accessToken,
    });

    const primaryAccount = response.data.accounts[0];
    const alerts: SpendingAlert[] = [];

    // Low balance alert
    if (primaryAccount.balances.available! < this.alertThresholds.lowBalance) {
      alerts.push({
        type: 'low_balance',
        severity: 'critical',
        message: `⚠️ Low balance: $${primaryAccount.balances.available}`,
        amount: primaryAccount.balances.available!,
        suggestion: 'Postpone non-essential purchases',
      });
    }

    return {
      available: primaryAccount.balances.available!,
      current: primaryAccount.balances.current!,
      alerts,
    };
  }

  async checkRecentTransactions(): Promise<SpendingAlert[]> {
    const alerts: SpendingAlert[] = [];
    
    const response = await this.plaid.transactionsGet({
      access_token: this.accessToken,
      start_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 24h
      end_date: new Date().toISOString().split('T')[0],
    });

    for (const transaction of response.data.transactions) {
      // Unusual charge detection
      if (transaction.amount > this.alertThresholds.unusualCharge) {
        alerts.push({
          type: 'unusual_charge',
          severity: 'warning',
          message: `Large charge: $${transaction.amount} at ${transaction.merchant_name}`,
          amount: transaction.amount,
          merchant: transaction.merchant_name || undefined,
          suggestion: 'Verify this purchase was intentional',
        });
      }

      // Subscription detection
      if (this.isLikelySubscription(transaction)) {
        alerts.push({
          type: 'subscription',
          severity: 'info',
          message: `Recurring charge: ${transaction.merchant_name}`,
          amount: transaction.amount,
          merchant: transaction.merchant_name || undefined,
          suggestion: 'Review if this subscription is still needed',
        });
      }
    }

    return alerts;
  }

  async getCategoryBudgets(): Promise<BudgetCategory[]> {
    // Get current month transactions
    const startDate = new Date();
    startDate.setDate(1);
    const endDate = new Date();

    const response = await this.plaid.transactionsGet({
      access_token: this.accessToken,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
    });

    // Aggregate by category
    const categorySpending = new Map<string, number>();
    response.data.transactions.forEach(t => {
      const category = t.category?.[0] || 'Other';
      const current = categorySpending.get(category) || 0;
      categorySpending.set(category, current + t.amount);
    });

    // Budget allocations (would be user-configured)
    const budgetAllocations: Record<string, number> = {
      'Food and Drink': 800,
      'Shops': 500,
      'Transportation': 300,
      'Recreation': 200,
      'Service': 400,
      'Other': 300,
    };

    const categories: BudgetCategory[] = [];
    const daysInMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
    const daysPassed = endDate.getDate();

    for (const [category, allocated] of Object.entries(budgetAllocations)) {
      const spent = categorySpending.get(category) || 0;
      const dailyBudget = allocated / daysInMonth;
      const expectedSpend = dailyBudget * daysPassed;
      const projection = (spent / daysPassed) * daysInMonth;

      categories.push({
        name: category,
        allocated,
        spent,
        remaining: allocated - spent,
        pace: spent > expectedSpend * 1.1 ? 'behind' : spent < expectedSpend * 0.9 ? 'ahead' : 'on_track',
        projection,
      });
    }

    return categories;
  }

  async getSmartAlerts(location?: { lat: number; lon: number }): Promise<SpendingAlert[]> {
    const alerts: SpendingAlert[] = [];
    const [balance, recent, budgets] = await Promise.all([
      this.getRealTimeBalance(),
      this.checkRecentTransactions(),
      this.getCategoryBudgets(),
    ]);

    // Combine all alert sources
    alerts.push(...balance.alerts, ...recent);

    // Budget alerts
    for (const budget of budgets) {
      const percentUsed = budget.spent / budget.allocated;
      
      if (percentUsed > this.alertThresholds.budgetCritical) {
        alerts.push({
          type: 'over_budget',
          severity: 'critical',
          message: `${budget.name} budget critical: ${Math.round(percentUsed * 100)}% used`,
          amount: budget.remaining,
          suggestion: `Only $${budget.remaining.toFixed(2)} left for ${budget.name}`,
        });
      } else if (percentUsed > this.alertThresholds.budgetWarning && budget.pace === 'behind') {
        alerts.push({
          type: 'over_budget',
          severity: 'warning',
          message: `${budget.name} spending high`,
          suggestion: `Slow down - projected to exceed by $${(budget.projection - budget.allocated).toFixed(2)}`,
        });
      }
    }

    // Location-based alerts (if near store)
    if (location) {
      const nearbyStores = await this.checkNearbyStores(location);
      if (nearbyStores.length > 0 && balance.available < 50) {
        alerts.push({
          type: 'low_balance',
          severity: 'warning',
          message: 'Low balance - entering shopping area',
          suggestion: 'Consider shopping list before entering store',
        });
      }
    }

    return alerts;
  }

  private isLikelySubscription(transaction: any): boolean {
    const subscriptionKeywords = [
      'netflix', 'spotify', 'hulu', 'disney', 'amazon prime',
      'apple', 'google', 'microsoft', 'adobe', 'subscription',
      'monthly', 'recurring', 'membership'
    ];

    const name = (transaction.merchant_name || transaction.name || '').toLowerCase();
    return subscriptionKeywords.some(keyword => name.includes(keyword));
  }

  private async checkNearbyStores(location: { lat: number; lon: number }): Promise<string[]> {
    // Would use maps API to check nearby merchants
    // Simplified for example
    return [];
  }

  // Smart shopping mode - alerts while shopping
  async activateShoppingMode(userId: string): Promise<{
    budget: number;
    spent: number;
    suggestions: string[];
  }> {
    const balance = await this.getRealTimeBalance();
    const budgets = await this.getCategoryBudgets();
    const shoppingBudget = budgets.find(b => b.name === 'Shops');

    return {
      budget: shoppingBudget?.remaining || 0,
      spent: 0,
      suggestions: [
        'Stick to list',
        `Budget remaining: $${shoppingBudget?.remaining.toFixed(2)}`,
        'Compare prices on items over $20',
      ],
    };
  }

  // Predictive alerts
  async getPredictiveAlerts(): Promise<Array<{
    daysUntil: number;
    event: string;
    estimatedCost: number;
    preparation: string;
  }>> {
    const predictions = [];

    // Check for upcoming known expenses
    const today = new Date();
    const dayOfMonth = today.getDate();

    // Rent/mortgage usually due on 1st
    if (dayOfMonth > 25) {
      predictions.push({
        daysUntil: new Date(today.getFullYear(), today.getMonth() + 1, 1).getDate() - dayOfMonth,
        event: 'Rent/Mortgage payment',
        estimatedCost: 2000, // Would be configured
        preparation: 'Ensure funds available for housing payment',
      });
    }

    // Utility bills around 15th
    if (dayOfMonth > 10 && dayOfMonth < 15) {
      predictions.push({
        daysUntil: 15 - dayOfMonth,
        event: 'Utility bills',
        estimatedCost: 300,
        preparation: 'Review last month\'s usage',
      });
    }

    // Check transaction history for patterns
    const history = await this.plaid.transactionsGet({
      access_token: this.accessToken,
      start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
    });

    // Find recurring patterns (simplified)
    const merchantFrequency = new Map<string, number[]>();
    history.data.transactions.forEach(t => {
      if (t.merchant_name) {
        const day = new Date(t.date).getDate();
        const days = merchantFrequency.get(t.merchant_name) || [];
        days.push(day);
        merchantFrequency.set(t.merchant_name, days);
      }
    });

    return predictions;
  }
}
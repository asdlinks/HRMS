import { type Locator, type Page } from '@playwright/test';
import { selectByLabelText } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

export interface PayrollSettingsFields {
  payCycleDay?: string;
  financialYearStartMonth?: string;
  currency?: string;
  hourlyRateBaseComponentName?: string;
  standardMonthlyHours?: string;
  otRateMultiplier?: string;
  roundingRule?: 'No rounding' | 'Nearest whole number' | 'Nearest 0.5' | 'Always round up' | 'Always round down';
}

/** Wraps client/src/pages/PayrollSettingsPage.tsx (standalone /payroll/settings route — always renders full chrome, per its own doc comment). */
export class PayrollSettingsPage {
  readonly page: Page;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.saveButton = page.getByRole('button', { name: /^(Save Settings|Saving…)$/ });
  }

  async goto() {
    await this.page.goto('/payroll/settings');
    assertSessionActive(this.page);
  }

  async fill(fields: PayrollSettingsFields) {
    if (fields.payCycleDay !== undefined) await this.page.getByLabel('Pay cycle day').fill(fields.payCycleDay);
    if (fields.financialYearStartMonth !== undefined) {
      await selectByLabelText(this.page, 'Financial year starts').click();
      await this.page.getByRole('option', { name: fields.financialYearStartMonth, exact: true }).click();
    }
    if (fields.currency !== undefined) await this.page.getByLabel('Currency').fill(fields.currency);
    if (fields.hourlyRateBaseComponentName !== undefined) {
      await selectByLabelText(this.page, 'Hourly rate base component').click();
      await this.page.getByRole('option', { name: new RegExp(fields.hourlyRateBaseComponentName) }).click();
    }
    if (fields.standardMonthlyHours !== undefined) await this.page.getByLabel('Standard monthly hours').fill(fields.standardMonthlyHours);
    if (fields.otRateMultiplier !== undefined) await this.page.getByLabel('Overtime rate multiplier').fill(fields.otRateMultiplier);
    if (fields.roundingRule !== undefined) {
      await selectByLabelText(this.page, 'Net pay rounding').click();
      await this.page.getByRole('option', { name: fields.roundingRule, exact: true }).click();
    }
  }

  async save() {
    await this.saveButton.click();
  }
}

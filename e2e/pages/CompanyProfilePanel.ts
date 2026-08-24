import { type Locator, type Page } from '@playwright/test';
import { Toast } from './components/Toast';
import { selectByLabelText, setColorInputValue } from '../helpers/locators';
import { assertSessionActive } from '../helpers/sessionGuard';

export interface CompanyProfileFormFields {
  name?: string;
  website?: string;
  contactEmail?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  /** Must exactly match one of SettingsPage.tsx's CURRENCY_OPTIONS. */
  currency?: string;
  /** Must exactly match one of SettingsPage.tsx's DATE_FORMAT_OPTIONS. */
  dateFormat?: string;
  /** Full month name (e.g. 'April') — the Select's options are rendered from MONTH_NAMES. */
  financialYearStartMonth?: string;
  themePrimaryColor?: string;
  themeSecondaryColor?: string;
}

/** Wraps the "Company Profile" tab inside SettingsPage.tsx (route: /settings). The sibling "General Config" tab's Attendance Link field is owned by AttendanceLinkPanel.ts, and its Leave Allocations section by the already-frozen LeaveSettingsPanel.ts. */
export class CompanyProfilePanel {
  readonly page: Page;
  readonly navItem: Locator;
  readonly saveButton: Locator;
  readonly uploadLogoButton: Locator;
  readonly logoFileInput: Locator;
  readonly logoImage: Locator;
  readonly primaryColorInput: Locator;
  readonly secondaryColorInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navItem = page.getByRole('button', { name: 'Company Profile', exact: true });
    this.saveButton = page.getByRole('button', { name: /^(Save Company Profile|Saving…)$/ });
    this.uploadLogoButton = page.getByRole('button', { name: 'Upload Logo' });
    this.logoFileInput = page.locator('input[type="file"]');
    this.logoImage = page.getByAltText('Company logo');
    // Two identical, unlabeled native color inputs (Primary/Secondary) — the
    // preceding Typography caption is the only visual distinction, and
    // getByLabel can't resolve either since neither wires an actual <label>.
    // Positional order matches the JSX (Primary first, Secondary second).
    this.primaryColorInput = page.locator('input[type="color"]').nth(0);
    this.secondaryColorInput = page.locator('input[type="color"]').nth(1);
  }

  /** Navigates to Settings and opens the Company Profile tab if the nav item is present (permission-gated on company.manage — CP-UI-01). Bounded-waits for it rather than checking isVisible() immediately, same fix as skipUnlessVisible/LeaveSettingsPanel.goto(). */
  async goto() {
    await this.page.goto('/settings');
    const visible = await this.navItem.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (visible) await this.navItem.click();
    assertSessionActive(this.page);
  }

  async fill(fields: CompanyProfileFormFields) {
    if (fields.name !== undefined) await this.page.getByLabel('Company Name').fill(fields.name);
    if (fields.website !== undefined) await this.page.getByLabel('Website').fill(fields.website);
    if (fields.contactEmail !== undefined) await this.page.getByLabel('Contact Email').fill(fields.contactEmail);
    if (fields.phone !== undefined) await this.page.getByLabel('Phone').fill(fields.phone);
    if (fields.addressLine1 !== undefined) await this.page.getByLabel('Address Line 1').fill(fields.addressLine1);
    if (fields.addressLine2 !== undefined) await this.page.getByLabel('Address Line 2').fill(fields.addressLine2);
    if (fields.city !== undefined) await this.page.getByLabel('City').fill(fields.city);
    if (fields.state !== undefined) await this.page.getByLabel('State').fill(fields.state);
    if (fields.country !== undefined) await this.page.getByLabel('Country').fill(fields.country);
    if (fields.postalCode !== undefined) await this.page.getByLabel('Postal Code').fill(fields.postalCode);
    if (fields.currency !== undefined) {
      await selectByLabelText(this.page, 'Currency').click();
      await this.page.getByRole('option', { name: fields.currency, exact: true }).click();
    }
    if (fields.dateFormat !== undefined) {
      await selectByLabelText(this.page, 'Date Format').click();
      await this.page.getByRole('option', { name: fields.dateFormat, exact: true }).click();
    }
    if (fields.financialYearStartMonth !== undefined) {
      await selectByLabelText(this.page, 'Financial Year Starts').click();
      await this.page.getByRole('option', { name: fields.financialYearStartMonth, exact: true }).click();
    }
    if (fields.themePrimaryColor !== undefined) await setColorInputValue(this.primaryColorInput, fields.themePrimaryColor);
    if (fields.themeSecondaryColor !== undefined) await setColorInputValue(this.secondaryColorInput, fields.themeSecondaryColor);
  }

  /** Reads the currently-selectable option labels for a Currency/Date Format/Financial Year Starts dropdown (CP-UI-03 — proving only the fixed client-side list is offered, regardless of what the API itself will accept). Opens then closes the dropdown. */
  async dropdownOptionLabels(label: 'Currency' | 'Date Format' | 'Financial Year Starts'): Promise<string[]> {
    await selectByLabelText(this.page, label).click();
    const labels = await this.page.getByRole('option').allTextContents();
    await this.page.keyboard.press('Escape');
    return labels;
  }

  async uploadLogo(filePath: string) {
    await this.logoFileInput.setInputFiles(filePath);
  }

  async save() {
    await this.saveButton.click();
  }

  async expectSaved() {
    await new Toast(this.page).expectVisible('Company profile saved!');
  }
}

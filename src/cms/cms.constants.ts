// Collection/model-token names — five singleton content docs, matching the Express
// reference template's Manage module 1:1. Terms & Conditions and Privacy Policy are
// confirmed against the Figma admin dashboard; About Us/FAQ/Contact Us are carried
// over from the template as likely candidates for the driver app's 9-variant Settings
// screen, but not individually confirmed against exact Figma labels — cheap to drop
// if they turn out unused, see the testing guide.
export const CMS_COLLECTIONS = {
  TERMS_CONDITIONS: 'TermsConditions',
  PRIVACY_POLICY: 'PrivacyPolicy',
  ABOUT_US: 'AboutUs',
  FAQ: 'FAQ',
  CONTACT_US: 'ContactUs',
} as const;

export type CmsCollectionName = (typeof CMS_COLLECTIONS)[keyof typeof CMS_COLLECTIONS];

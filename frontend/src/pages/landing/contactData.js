export const INQUIRY_TYPES = [
  { value: 'general', label: 'General inquiry' },
  { value: 'demo', label: 'Request a demo' },
  { value: 'partnership', label: 'Partnership & institutions' },
  { value: 'support', label: 'Product support' },
  { value: 'press', label: 'Press & media' },
];

export const CONTACT_CHANNELS = [
  {
    icon: 'mail',
    label: 'Email',
    value: 'hello@propath.com',
    href: 'mailto:hello@propath.com',
  },
  {
    icon: 'clock',
    label: 'Response time',
    value: 'Within one business day',
  },
  {
    icon: 'building',
    label: 'For institutions',
    value: 'Demo, onboarding & program setup',
  },
];

export const EMPTY_CONTACT_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  organization: '',
  inquiryType: 'general',
  subject: '',
  message: '',
};

import { request } from '../client.js';

export async function submitContactForm(payload) {
  return request('/api/contact', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

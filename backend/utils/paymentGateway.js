import { randomBytes } from 'crypto';

/**
 * Simulated payment gateway — records a Payments row and returns a transaction id.
 * Replace with Stripe/JazzCash webhooks when integrating a live gateway.
 */
export async function processSubscriptionPayment(supabase, {
  subscriptionId,
  entityType,
  entityId,
  amount,
  currency = 'PKR',
  paymentMethod = 'Stripe',
  cardLast4 = null,
}) {
  const numericAmount = parseFloat(amount) || 0;
  const transactionId = `sim_${Date.now()}_${randomBytes(4).toString('hex')}`;

  if (numericAmount <= 0) {
    return { skipped: true, transactionId: null, payment: null };
  }

  const remarks = cardLast4 ? `Simulated checkout · card ·••• ${cardLast4}` : 'Simulated checkout';

  const { data: payment, error } = await supabase
    .from('Payments')
    .insert({
      SubscriptionID: subscriptionId,
      EntityType: entityType,
      EntityID: entityId,
      Amount: numericAmount,
      Currency: currency,
      PaymentDate: new Date().toISOString(),
      PaymentMethod: paymentMethod,
      TransactionID: transactionId,
      PaymentStatus: 'Completed',
      Remarks: remarks,
      CreatedAt: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    const err = new Error(error.message || 'Payment processing failed');
    err.code = 'PAYMENT_FAILED';
    throw err;
  }

  return { skipped: false, transactionId, payment };
}

export const PAYMENT_METHODS = ['Stripe', 'JazzCash', 'CreditCard', 'BankTransfer', 'PayPal'];

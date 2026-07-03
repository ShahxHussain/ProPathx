import { useState } from 'react';
import { CreditCard, Smartphone, Building2, AlertCircle, Loader2 } from 'lucide-react';
import './PaymentCheckout.css';

export const PAYMENT_METHOD_OPTIONS = [
  { id: 'Stripe', label: 'Card (Stripe)', icon: CreditCard },
  { id: 'JazzCash', label: 'JazzCash', icon: Smartphone },
  { id: 'BankTransfer', label: 'Bank transfer', icon: Building2 },
];

/**
 * Simulated payment step — records a Payments row via subscription API.
 * Replace with Stripe/JazzCash Elements when integrating live gateways.
 */
const PaymentCheckout = ({ amount, currency = 'PKR', onPay, loading, error }) => {
  const [method, setMethod] = useState('Stripe');
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');

  const numericAmount = parseFloat(amount) || 0;
  const last4 = cardNumber.replace(/\D/g, '').slice(-4);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (method === 'Stripe' || method === 'CreditCard') {
      const digits = cardNumber.replace(/\D/g, '');
      if (digits.length < 12) {
        return;
      }
    }
    onPay({
      paymentMethod: method,
      cardLast4: last4 || null,
      confirmPayment: true,
    });
  };

  if (numericAmount <= 0) {
    return (
      <div className="payment-checkout payment-checkout--free">
        <p>This plan is free — no payment required.</p>
        <button type="button" className="btn-primary" onClick={() => onPay({ confirmPayment: true })} disabled={loading}>
          {loading ? <Loader2 size={16} className="spinner" /> : 'Activate plan'}
        </button>
      </div>
    );
  }

  return (
    <form className="payment-checkout" onSubmit={handleSubmit}>
      <div className="payment-checkout-amount">
        <span>Amount due</span>
        <strong>
          {currency} {numericAmount.toLocaleString()}
        </strong>
      </div>

      <div className="payment-method-grid">
        {PAYMENT_METHOD_OPTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`payment-method-card ${method === id ? 'active' : ''}`}
            onClick={() => setMethod(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {(method === 'Stripe' || method === 'CreditCard') && (
        <div className="payment-card-fields">
          <label>
            <span>Name on card</span>
            <input
              type="text"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="Jane Doe"
              required
            />
          </label>
          <label>
            <span>Card number</span>
            <input
              type="text"
              inputMode="numeric"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="4242 4242 4242 4242"
              required
            />
          </label>
        </div>
      )}

      {method === 'JazzCash' && (
        <p className="payment-alt-hint">You will be redirected to JazzCash in production. This demo completes instantly.</p>
      )}

      {method === 'BankTransfer' && (
        <p className="payment-alt-hint">Bank transfer reference is simulated for this demo checkout.</p>
      )}

      <div className="payment-sim-note">
        <AlertCircle size={14} />
        <span>Simulated gateway — creates a completed payment record. Live Stripe/JazzCash webhooks coming later.</span>
      </div>

      {error && <div className="payment-error">{error}</div>}

      <button type="submit" className="btn-primary payment-submit" disabled={loading}>
        {loading ? (
          <>
            <Loader2 size={16} className="spinner" />
            Processing…
          </>
        ) : (
          `Pay ${currency} ${numericAmount.toLocaleString()}`
        )}
      </button>
    </form>
  );
};

export default PaymentCheckout;

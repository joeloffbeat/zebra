# Zebra — UI Design System

> Sui-Native ZK Dark Pool

---

## Brand Identity

**Theme:** Sophisticated privacy. Hidden in plain sight.
**Mood:** Professional, trustworthy, mysterious but not dark.

---

## Color System

### Primary Palette

```css
:root {
  /* Core - Black & White with depth */
  --background: #0A0A0A;
  --background-secondary: #141414;
  --card: #1A1A1A;
  --card-hover: #222222;
  --border: #2A2A2A;
  --border-hover: #3A3A3A;

  /* Text */
  --text-primary: #FAFAFA;
  --text-secondary: #A3A3A3;
  --text-muted: #6B6B6B;

  /* Accent - Subtle blue for trust */
  --accent: #3B82F6;
  --accent-hover: #60A5FA;
  --accent-muted: #3B82F6/20;

  /* Status */
  --success: #22C55E;
  --success-muted: #22C55E/20;
  --warning: #F59E0B;
  --warning-muted: #F59E0B/20;
  --error: #EF4444;
  --error-muted: #EF4444/20;

  /* Trading */
  --buy: #22C55E;
  --buy-muted: #22C55E/15;
  --sell: #EF4444;
  --sell-muted: #EF4444/15;

  /* Privacy indicator */
  --hidden: #8B5CF6;
  --hidden-muted: #8B5CF6/20;

  /* Sui brand */
  --sui-blue: #6FBCF0;
}
```

### Zebra Pattern Accent

For decorative elements, use subtle zebra stripe patterns:

```css
.zebra-pattern {
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 10px,
    rgba(255,255,255,0.02) 10px,
    rgba(255,255,255,0.02) 20px
  );
}
```

---

## Typography

### Font Stack

```css
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

### Type Scale

| Name | Size | Weight | Use |
|------|------|--------|-----|
| `display` | 48px | 700 | Hero headlines |
| `h1` | 32px | 600 | Page titles |
| `h2` | 24px | 600 | Section headers |
| `h3` | 18px | 600 | Card titles |
| `body` | 16px | 400 | Body text |
| `small` | 14px | 400 | Secondary text |
| `caption` | 12px | 400 | Labels, captions |
| `price` | 20px | 500 | Prices (mono) |
| `amount` | 16px | 500 | Amounts (mono) |

---

## Spacing

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
}
```

---

## Components

### 1. Order Card (Hidden Order)

```tsx
interface HiddenOrderCardProps {
  commitment: string;
  timestamp: Date;
  status: 'pending' | 'matched' | 'revealed' | 'settled';
  side?: 'BUY' | 'SELL'; // Only shown after reveal
  amount?: string;       // Only shown after reveal
  price?: string;        // Only shown after reveal
}

export function HiddenOrderCard({ commitment, timestamp, status, side, amount, price }: HiddenOrderCardProps) {
  const isRevealed = status === 'revealed' || status === 'settled';

  return (
    <div className="bg-card rounded-lg border border-border p-4 hover:border-border-hover transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-hidden animate-pulse" />
          <span className="text-small text-muted">
            {commitment.slice(0, 8)}...{commitment.slice(-6)}
          </span>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Order Details */}
      {isRevealed ? (
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-secondary">Side</span>
            <span className={side === 'BUY' ? 'text-buy' : 'text-sell'}>
              {side}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary">Amount</span>
            <span className="font-mono">{amount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary">Price</span>
            <span className="font-mono">{price}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-6 bg-hidden-muted rounded-md">
          <div className="flex items-center gap-2 text-hidden">
            <LockIcon className="w-4 h-4" />
            <span>Order Hidden</span>
          </div>
        </div>
      )}

      {/* Timestamp */}
      <div className="mt-3 pt-3 border-t border-border">
        <span className="text-caption text-muted">
          {formatRelativeTime(timestamp)}
        </span>
      </div>
    </div>
  );
}
```

### 2. Order Form

```tsx
interface OrderFormProps {
  pair: string;
  balance: string;
  onSubmit: (order: OrderParams) => Promise<void>;
}

export function OrderForm({ pair, balance, onSubmit }: OrderFormProps) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-h3 mb-4">Place Hidden Order</h3>

      {/* Side Selector */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setSide('BUY')}
          className={cn(
            'py-3 rounded-lg font-medium transition-colors',
            side === 'BUY'
              ? 'bg-buy text-white'
              : 'bg-card-hover text-secondary hover:text-primary'
          )}
        >
          BUY
        </button>
        <button
          onClick={() => setSide('SELL')}
          className={cn(
            'py-3 rounded-lg font-medium transition-colors',
            side === 'SELL'
              ? 'bg-sell text-white'
              : 'bg-card-hover text-secondary hover:text-primary'
          )}
        >
          SELL
        </button>
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="text-small text-secondary mb-2 block">Amount</label>
        <div className="relative">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-background border border-border rounded-lg px-4 py-3 font-mono focus:border-accent outline-none"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary">
            {pair.split('/')[0]}
          </span>
        </div>
      </div>

      {/* Price Input */}
      <div className="mb-4">
        <label className="text-small text-secondary mb-2 block">Limit Price</label>
        <div className="relative">
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-background border border-border rounded-lg px-4 py-3 font-mono focus:border-accent outline-none"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary">
            {pair.split('/')[1]}
          </span>
        </div>
      </div>

      {/* Order Summary */}
      <div className="bg-background rounded-lg p-4 mb-4 space-y-2">
        <div className="flex justify-between text-small">
          <span className="text-secondary">Order Value</span>
          <span className="font-mono">
            ${(parseFloat(amount || '0') * parseFloat(price || '0')).toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-small">
          <span className="text-secondary">Available Balance</span>
          <span className="font-mono">{balance}</span>
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="flex items-center gap-2 mb-4 p-3 bg-hidden-muted rounded-lg">
        <ShieldIcon className="w-4 h-4 text-hidden" />
        <span className="text-small text-hidden">
          ZK proof will be generated and verified on-chain
        </span>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isGeneratingProof}
        className={cn(
          'w-full py-4 rounded-lg font-medium transition-colors',
          side === 'BUY'
            ? 'bg-buy hover:bg-buy/90 text-white'
            : 'bg-sell hover:bg-sell/90 text-white',
          isGeneratingProof && 'opacity-50 cursor-not-allowed'
        )}
      >
        {isGeneratingProof ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner className="w-4 h-4" />
            Generating ZK Proof...
          </span>
        ) : (
          `Hide ${side} Order in the Herd`
        )}
      </button>
    </div>
  );
}
```

### 3. Herd Statistics

```tsx

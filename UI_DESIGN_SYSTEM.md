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
interface HerdStatsProps {
  pair: string;
  totalOrders: number;
  volume24h: string;
  estimatedSpread: string;
}

export function HerdStats({ pair, totalOrders, volume24h, estimatedSpread }: HerdStatsProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <ZebraIcon className="w-5 h-5" />
        <h3 className="text-h3">The Herd</h3>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-caption text-muted mb-1">Hidden Orders</div>
          <div className="text-h2 font-mono">{totalOrders}</div>
        </div>
        <div>
          <div className="text-caption text-muted mb-1">24h Volume</div>
          <div className="text-h2 font-mono">{volume24h}</div>
        </div>
        <div>
          <div className="text-caption text-muted mb-1">Est. Spread</div>
          <div className="text-h2 font-mono">{estimatedSpread}</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2 text-small text-muted">
          <LockIcon className="w-3 h-3" />
          <span>Individual order details are hidden. Only aggregate stats shown.</span>
        </div>
      </div>
    </div>
  );
}
```

### 4. Proof Generation Progress

```tsx
interface ProofProgressProps {
  stage: 'preparing' | 'computing' | 'verifying' | 'complete';
  progress: number;
}

export function ProofProgress({ stage, progress }: ProofProgressProps) {
  const stages = [
    { key: 'preparing', label: 'Preparing witness' },
    { key: 'computing', label: 'Computing proof' },
    { key: 'verifying', label: 'Verifying on-chain' },
    { key: 'complete', label: 'Complete' },
  ];

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-h3 mb-4">Generating ZK Proof</h3>

      <div className="space-y-4">
        {stages.map((s, i) => {
          const isActive = s.key === stage;
          const isComplete = stages.findIndex(x => x.key === stage) > i;

          return (
            <div key={s.key} className="flex items-center gap-3">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center',
                isComplete ? 'bg-success' : isActive ? 'bg-accent' : 'bg-border'
              )}>
                {isComplete ? (
                  <CheckIcon className="w-4 h-4 text-white" />
                ) : isActive ? (
                  <Spinner className="w-4 h-4 text-white" />
                ) : (
                  <span className="text-caption text-muted">{i + 1}</span>
                )}
              </div>
              <span className={cn(
                'text-small',
                isActive ? 'text-primary' : isComplete ? 'text-success' : 'text-muted'
              )}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div className="mt-6">
        <div className="h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-caption text-muted text-right">
          {progress}%
        </div>
      </div>
    </div>
  );
}
```

### 5. Cross-Chain Deposit (LI.FI)

```tsx
interface DepositFormProps {
  suiAddress: string;
  onDeposit: (params: DepositParams) => Promise<void>;
}

export function DepositForm({ suiAddress, onDeposit }: DepositFormProps) {
  const [fromChain, setFromChain] = useState('ethereum');
  const [fromToken, setFromToken] = useState('ETH');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-h3 mb-4">Deposit to Trade</h3>
      <p className="text-small text-secondary mb-6">
        Deposit from any chain, trade on Sui
      </p>

      {/* From Chain */}
      <div className="mb-4">
        <label className="text-small text-secondary mb-2 block">From</label>
        <ChainSelector
          value={fromChain}
          onChange={setFromChain}
          chains={['ethereum', 'arbitrum', 'base', 'polygon', 'optimism']}
        />
      </div>

      {/* Token & Amount */}
      <div className="mb-4">
        <label className="text-small text-secondary mb-2 block">Token & Amount</label>
        <div className="flex gap-2">
          <TokenSelector
            chain={fromChain}
            value={fromToken}
            onChange={setFromToken}
          />
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-background border border-border rounded-lg px-4 py-3 font-mono"
          />
        </div>
      </div>

      {/* To (Fixed: Sui) */}
      <div className="mb-4">
        <label className="text-small text-secondary mb-2 block">To</label>
        <div className="bg-background border border-border rounded-lg px-4 py-3 flex items-center gap-2">
          <SuiLogo className="w-5 h-5" />
          <span>Sui</span>
          <span className="text-secondary">• USDC</span>
        </div>
      </div>

      {/* Quote */}
      {quote && (
        <div className="bg-background rounded-lg p-4 mb-4 space-y-2">
          <div className="flex justify-between text-small">
            <span className="text-secondary">You'll Receive</span>
            <span className="font-mono text-success">~{quote.toAmount} USDC</span>
          </div>
          <div className="flex justify-between text-small">
            <span className="text-secondary">Route</span>
            <span className="text-muted">{quote.route}</span>
          </div>
          <div className="flex justify-between text-small">
            <span className="text-secondary">Est. Time</span>
            <span className="text-muted">~{quote.estimatedTime}</span>
          </div>
        </div>
      )}

      {/* LI.FI Badge */}
      <div className="flex items-center gap-2 mb-4 text-caption text-muted">
        <span>Powered by</span>
        <LiFiLogo className="h-4" />
      </div>

      <button className="w-full py-4 rounded-lg bg-sui-blue hover:bg-sui-blue/90 text-white font-medium">
        Deposit to Sui
      </button>
    </div>
  );
}
```

---

## Page Layouts

### Markets Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Logo | Markets | My Orders | Deposit | Connect Wallet  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  HERO: "Trade Without Revealing Your Hand"                  ││
│  │  Sui-native ZK dark pool with on-chain proof verification   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  AVAILABLE MARKETS                                               │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ │
│  │ SUI/USDC         │ │ USDC/USDT        │ │ WETH/USDC        │ │
│  │ Mark: $1.23      │ │ Mark: $1.00      │ │ Mark: $3,456     │ │
│  │ Hidden: 47       │ │ Hidden: 23       │ │ Hidden: 89       │ │
│  │ Vol: $1.2M       │ │ Vol: $890K       │ │ Vol: $2.4M       │ │
│  │ [TRADE]          │ │ [TRADE]          │ │ [TRADE]          │ │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ YOUR HIDDEN ORDERS (3 active)                               ││
│  │ ─────────────────────────────────────────────────────────── ││
│  │ [Hidden Order Card] [Hidden Order Card] [Hidden Order Card] ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Trading Interface

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER                                                          │
├─────────────────────────────────────────────────────────────────┤
│  SUI/USDC    $1.23 (+2.4%)    │ Markets ▼                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────┐ ┌─────────────────────────────────┐  │
│  │ HERD STATISTICS       │ │ ORDER FORM                      │  │
│  │ ───────────────────── │ │ ───────────────────────────────│  │
│  │                       │ │                                 │  │
│  │ Hidden Orders: 47     │ │ [BUY]  [SELL]                   │  │
│  │ 24h Volume: $1.2M     │ │                                 │  │
│  │ Est. Spread: 0.1%     │ │ Amount: [________] SUI          │  │
│  │                       │ │ Price:  [________] USDC         │  │
│  │ 🔒 Individual orders  │ │                                 │  │
│  │    are hidden         │ │ Order Value: $1,230             │  │
│  │                       │ │                                 │  │
│  └───────────────────────┘ │ 🔒 ZK proof verified on-chain   │  │
│                            │                                 │  │
│  ┌───────────────────────┐ │ [HIDE ORDER IN THE HERD]        │  │
│  │ PRICE CHART           │ │                                 │  │
│  │ ───────────────────── │ └─────────────────────────────────┘  │
│  │                       │                                      │
│  │    ╭──────╮           │ ┌─────────────────────────────────┐  │
│  │   ╭╯      ╰──╮        │ │ YOUR ORDERS                     │  │
│  │  ╭╯          ╰─╮      │ │ ───────────────────────────────│  │
│  │ ─╯             ╰──    │ │                                 │  │
│  │                       │ │ [Hidden Order Card]             │  │
│  │ 1H  4H  1D  1W        │ │ [Hidden Order Card]             │  │
│  └───────────────────────┘ └─────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Animations

### Proof Generation

```css
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
  50% { box-shadow: 0 0 20px 10px rgba(139, 92, 246, 0.2); }
}

.generating-proof {
  animation: pulse-glow 2s ease-in-out infinite;
}
```

### Order Hidden Confirmation

```css
@keyframes fade-to-hidden {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.98); }
  100% { opacity: 1; transform: scale(1); background: var(--hidden-muted); }
}

.order-hidden {
  animation: fade-to-hidden 0.5s ease-out forwards;
}
```

---

## Icons

Use Lucide icons with these semantic mappings:

| Concept | Icon |
|---------|------|
| Hidden/Private | `Lock`, `EyeOff`, `Shield` |
| Revealed | `Unlock`, `Eye` |
| ZK Proof | `ShieldCheck`, `Fingerprint` |
| Order | `ArrowUpDown`, `TrendingUp`, `TrendingDown` |
| Success | `Check`, `CheckCircle` |
| Warning | `AlertTriangle` |
| Error | `XCircle` |
| Loading | `Loader2` (animated) |
| Sui | Custom Sui logo |
| LI.FI | Custom LI.FI logo |

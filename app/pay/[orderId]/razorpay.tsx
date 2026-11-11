'use client';

import { useRef } from 'react';

type Props = {
  keyId: string;
  gatewayOrderId: string;
  orderId: string;
  amountPaise: number;
  name: string;
  email: string;
  verify: (fd: FormData) => Promise<void>;
};

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

/** Opens Razorpay Checkout, then posts the signed result to the verify action. */
export function RazorpayButton(p: Props) {
  const form = useRef<HTMLFormElement>(null);
  function open() {
    if (!window.Razorpay) return alert('Payment window is still loading. Try again in a moment.');
    new window.Razorpay({
      key: p.keyId,
      order_id: p.gatewayOrderId,
      amount: p.amountPaise,
      currency: 'INR',
      name: 'Olready',
      description: p.name,
      prefill: { email: p.email },
      theme: { color: '#C48000' },
      handler: (r: { razorpay_payment_id: string; razorpay_signature: string }) => {
        const f = form.current!;
        (f.elements.namedItem('razorpay_payment_id') as HTMLInputElement).value = r.razorpay_payment_id;
        (f.elements.namedItem('razorpay_signature') as HTMLInputElement).value = r.razorpay_signature;
        f.requestSubmit();
      },
    }).open();
  }
  return (
    <>
      <button type="button" onClick={open} className="btn btn-pink w-full">
        Pay with Razorpay
      </button>
      <form ref={form} action={p.verify} hidden>
        <input type="hidden" name="order_id" value={p.orderId} />
        <input type="hidden" name="razorpay_payment_id" />
        <input type="hidden" name="razorpay_signature" />
      </form>
    </>
  );
}

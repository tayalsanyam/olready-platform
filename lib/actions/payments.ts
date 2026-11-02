'use server';

import { sql, DomainError } from '../db';
import { requireProfile } from '../auth';
import { markOrderPaid, orderProduct, razorpayCheckoutValid, type Order } from '../payments';
import { attempt, str } from './run';

async function myOrder(orderId: string) {
  const p = await requireProfile(`/pay/${orderId}`);
  const [o] = await sql<Order[]>`select * from mkt.orders where id = ${orderId} and profile_id = ${p.id}`;
  if (!o) throw new DomainError('not_found', 'Order not found');
  return { p, o };
}

/** Local development only: completes a payment on the test gateway. */
export async function completeTestPayment(fd: FormData) {
  const orderId = str(fd, 'order_id');
  await attempt(`/pay/${orderId}`, async () => {
    if (process.env.NODE_ENV === 'production') throw new DomainError('no_test', 'Test payments are off');
    const { p, o } = await myOrder(orderId);
    if (o.gateway !== 'test') throw new DomainError('bad_order', 'Not a test order');
    await markOrderPaid(sql, orderId, `test-${Date.now()}`, p.id);
    return { to: (await orderProduct(sql, o)).done, ok: 'Payment received' };
  });
}

/** Razorpay Checkout posts back here; the webhook is the backstop if this never arrives. */
export async function razorpayVerifyAction(fd: FormData) {
  const orderId = str(fd, 'order_id');
  await attempt(`/pay/${orderId}`, async () => {
    const { p, o } = await myOrder(orderId);
    if (!o.gateway_order_id) throw new DomainError('bad_order', 'Order not found');
    const ok = razorpayCheckoutValid(o.gateway_order_id, str(fd, 'razorpay_payment_id'), str(fd, 'razorpay_signature'));
    if (!ok) throw new DomainError('bad_signature', 'We could not confirm this payment. If money left your account, contact support.');
    await markOrderPaid(sql, orderId, str(fd, 'razorpay_payment_id'), p.id);
    return { to: (await orderProduct(sql, o)).done, ok: 'Payment received' };
  });
}

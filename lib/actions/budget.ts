'use server';

import { DomainError, sql } from '../db';
import { requireProfile } from '../auth';
import { weddingFor } from '../weddings';
import { addBudgetItem, removeBudgetItem, setBudgetVisibility, setCategoryBudget, setTotalBudget, updateBudgetItemPaid } from '../budget';
import { attempt, num, str } from './run';

async function wedding() {
  const p = await requireProfile('/me/budget');
  const w = await weddingFor(sql, p.id);
  if (!w) throw new DomainError('no_wedding', 'Set up your wedding first');
  return { p, w };
}

export async function saveTotalBudgetAction(fd: FormData) {
  await attempt('/me/budget', async () => {
    const { p, w } = await wedding();
    await setTotalBudget(sql, w.id, p.id, num(fd, 'total'));
    return { ok: 'Budget saved' };
  });
}

export async function saveCategoryBudgetAction(fd: FormData) {
  await attempt('/me/budget', async () => {
    const { p, w } = await wedding();
    await setCategoryBudget(sql, w.id, p.id, Number(str(fd, 'category_id')), num(fd, 'budget'));
    return { ok: 'Saved' };
  });
}

export async function addBudgetItemAction(fd: FormData) {
  await attempt('/me/budget', async () => {
    const { p, w } = await wedding();
    await addBudgetItem(sql, w.id, p.id, { label: str(fd, 'label'), categoryId: num(fd, 'category_id'), amount: num(fd, 'amount') ?? 0, paid: num(fd, 'paid') ?? 0 });
    return { ok: 'Cost added' };
  });
}

export async function updateBudgetItemAction(fd: FormData) {
  await attempt('/me/budget', async () => {
    const { p, w } = await wedding();
    if (str(fd, 'remove') === '1') await removeBudgetItem(sql, w.id, p.id, str(fd, 'id'));
    else await updateBudgetItemPaid(sql, w.id, p.id, str(fd, 'id'), num(fd, 'paid') ?? 0);
    return { ok: str(fd, 'remove') === '1' ? 'Cost removed' : 'Payment saved' };
  });
}

export async function budgetVisibilityAction(fd: FormData) {
  await attempt('/me/budget', async () => {
    const { p, w } = await wedding();
    await setBudgetVisibility(sql, w.id, p.id, str(fd, 'vis') === 'family' ? 'family' : 'owners');
    return { ok: 'Saved who can see the budget' };
  });
}

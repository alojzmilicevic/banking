'use client'
import { use } from 'react'
import Link from 'next/link'
import { Alert } from '@/components/ui/alert'
import { Card, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAccount, useAccountTransactions } from '@/lib/queries'

function fmtAmount(amount: number, currency: string) {
  const cls = amount < 0 ? 'text-neg' : amount > 0 ? 'text-pos' : ''
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return (
    <span className={cls}>
      {formatted} {currency}
    </span>
  )
}

export default function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const accountQ = useAccount(id)
  const txQ = useAccountTransactions(id)

  const account = accountQ.data?.account
  const connection = accountQ.data?.connection
  const balances = accountQ.data?.balances ?? []
  const transactions = txQ.data?.transactions ?? []

  const error =
    accountQ.error?.message ?? txQ.error?.message ?? null
  const loading = accountQ.isLoading || txQ.isLoading

  const title =
    account?.details || account?.product || account?.name || account?.iban || 'Account'

  return (
    <main className="mx-auto max-w-[960px] px-6 pb-16 pt-8">
      <p className="mt-0">
        <Link href="/">← back</Link>
      </p>
      <h1 className="mb-6 text-[1.6rem] font-semibold">{title}</h1>
      {error && <Alert>{error}</Alert>}

      {account && (
        <Card>
          <CardTitle>Details</CardTitle>
          {connection?.label && (
            <p className="my-1 text-sm text-muted-foreground">{connection.label}</p>
          )}
          {account.name && (
            <p className="my-1 text-sm text-muted-foreground">Holder: {account.name}</p>
          )}
          {account.product && (
            <p className="my-1 text-sm text-muted-foreground">Product: {account.product}</p>
          )}
          {account.iban && (
            <p className="my-1 text-sm text-muted-foreground">IBAN: {account.iban}</p>
          )}
          {account.bban && (
            <p className="my-1 text-sm text-muted-foreground">BBAN: {account.bban}</p>
          )}
          {account.bic && (
            <p className="my-1 text-sm text-muted-foreground">BIC: {account.bic}</p>
          )}
          {account.currency && (
            <p className="my-1 text-sm text-muted-foreground">Currency: {account.currency}</p>
          )}
          {account.accountType && (
            <p className="my-1 text-sm text-muted-foreground">Type: {account.accountType}</p>
          )}
        </Card>
      )}

      {balances.length > 0 && (
        <Card>
          <CardTitle>Balances</CardTitle>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Reference date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.map((b, i) => (
                <TableRow key={i}>
                  <TableCell>{b.balanceType}</TableCell>
                  <TableCell className="text-muted-foreground">{b.referenceDate ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {fmtAmount(b.amount, b.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardTitle>
          Transactions{' '}
          <span className="font-normal text-muted-foreground">({transactions.length})</span>
        </CardTitle>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && transactions.length === 0 && (
          <p className="text-sm text-muted-foreground">No transactions stored yet — try Sync now.</p>
        )}
        {transactions.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow
                  key={t.fingerprint}
                  className={t.status && t.status !== 'BOOK' ? 'opacity-60' : ''}
                >
                  <TableCell>{t.date}</TableCell>
                  <TableCell>{t.description || t.counterparty || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{t.status || ''}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {fmtAmount(t.amount, t.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </main>
  )
}

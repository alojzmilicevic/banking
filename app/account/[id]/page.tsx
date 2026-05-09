import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAccountDetails } from '@/lib/services/account'
import { fmtMoney } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { Card, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function Amount({ amount, currency }: { amount: number; currency: string }) {
  const cls = amount < 0 ? 'text-neg' : amount > 0 ? 'text-pos' : ''
  return (
    <span className={cls}>
      <Sensitive>{fmtMoney(amount, currency, { decimals: 2 })}</Sensitive>
    </span>
  )
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const details = getAccountDetails(id)
  if (!details) notFound()

  const { account, connection, balances: accountBalances, transactions: accountTransactions } =
    details

  const title = account.details || account.product || account.name || account.iban || 'Account'

  const detailRows: Array<[string, string | null | undefined]> = [
    ['', connection?.label],
    ['Holder', account.name],
    ['Product', account.product],
    ['IBAN', account.iban],
    ['BBAN', account.bban],
    ['BIC', account.bic],
    ['Currency', account.currency],
    ['Type', account.accountType],
  ]

  return (
    <main className="mx-auto max-w-240 px-6 pb-16 pt-8">
      <p className="mt-0">
        <Link href="/">← back</Link>
      </p>
      <h1 className="mb-6 text-24 font-semibold">{title}</h1>

      <Card>
        <CardTitle>Details</CardTitle>
        {detailRows.map(([label, value]) =>
          value ? (
            <p key={label || 'connection'} className="my-1 text-sm text-muted-foreground">
              {label ? `${label}: ` : ''}
              {value}
            </p>
          ) : null,
        )}
      </Card>

      {accountBalances.length > 0 && (
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
              {accountBalances.map((b) => (
                <TableRow key={b.balanceType}>
                  <TableCell>{b.balanceType}</TableCell>
                  <TableCell className="text-muted-foreground">{b.referenceDate ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    <Amount amount={b.amount} currency={b.currency} />
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
          <span className="font-normal text-muted-foreground">({accountTransactions.length})</span>
        </CardTitle>
        {accountTransactions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No transactions stored yet — try Sync now.
          </p>
        )}
        {accountTransactions.length > 0 && (
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
              {accountTransactions.map((t) => (
                <TableRow
                  key={t.fingerprint}
                  className={t.status && t.status !== 'BOOK' ? 'opacity-60' : ''}
                >
                  <TableCell>{t.date}</TableCell>
                  <TableCell>{t.description || t.counterparty || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{t.status || ''}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    <Amount amount={t.amount} currency={t.currency} />
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

import { notFound } from 'next/navigation'
import { getAccountDetails } from '@/lib/services/account'
import { accountLabel } from '@/lib/accounts'
import { fmtMoney } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { BackLink } from '@/app/components/BackLink'
import { Card, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

function signClass(amount: number) {
  if (amount === 0) return ''
  return amount > 0 ? 'text-pos' : 'text-neg'
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

function Amount({ amount, currency }: { amount: number; currency: string }) {
  return (
    <span className={signClass(amount)}>
      <Sensitive>{fmtMoney(amount, currency, { decimals: 2 })}</Sensitive>
    </span>
  )
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const details = getAccountDetails(id)
  if (!details) notFound()

  const { account, connection, balances, transactions } = details

  const title = accountLabel(account, 'Account')

  const detailRows: Array<[string, string | null | undefined]> = [
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
      <div className="mb-4">
        <BackLink href="/">Back</BackLink>
      </div>
      <h1 className="mb-6 text-24 font-semibold">{title}</h1>

      <Card>
        <CardTitle>Details</CardTitle>
        {connection?.label && (
          <p className="my-1 text-sm text-muted-foreground">{connection.label}</p>
        )}
        {detailRows.map(([label, value]) =>
          value ? (
            <p key={label} className="my-1 text-sm text-muted-foreground">
              {label}: {value}
            </p>
          ) : null,
        )}
      </Card>

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
              {balances.map((b) => (
                <TableRow key={b.balanceType}>
                  <TableCell>{b.balanceType}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(b.referenceDate)}</TableCell>
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
          <span className="font-normal text-muted-foreground">({transactions.length})</span>
        </CardTitle>
        {transactions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No transactions stored yet — try Sync now.
          </p>
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
                  className={cn(t.status && t.status !== 'BOOK' && 'opacity-60')}
                >
                  <TableCell>{fmtDate(t.date)}</TableCell>
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
